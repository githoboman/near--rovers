import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider, KeyPair, keyToImplicitAddress } from "near-api-js";

function parseEnvLines(raw: string): string[] {
  return raw.split(/\r?\n/);
}

function upsertEnvVars(
  filePath: string,
  updates: Record<string, string>,
): void {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : "";
  const lines = existing ? parseEnvLines(existing) : [];
  const seen = new Set<string>();

  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      return line;
    }
    const eqIdx = line.indexOf("=");
    const key = line.slice(0, eqIdx).trim();
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) {
      nextLines.push(`${k}=${v}`);
    }
  }

  fs.writeFileSync(filePath, nextLines.join("\n").replace(/\n*$/, "\n"), "utf8");
}

async function main(): Promise<void> {
  const rootDir = path.resolve(process.cwd(), "..");
  const rootEnvPath = path.join(rootDir, ".env");
  const webEnvPath = path.join(rootDir, "web", ".env.local");

  const kp = KeyPair.fromRandom("ed25519");
  const publicKey = kp.getPublicKey().toString();
  const implicitId = keyToImplicitAddress(kp.getPublicKey());
  const privateKey = kp.toString();

  let activeAccountId = implicitId;
  let cliCreatedAccount: string | null = null;

  const nearCliExe = process.env.NEAR_CLI_EXE || "";
  if (nearCliExe && fs.existsSync(nearCliExe)) {
    const candidateName = `perpetua-${implicitId.slice(0, 8)}.testnet`;
    console.log(`[wallet] trying official near-cli-rs sponsor faucet for ${candidateName}...`);
    const res = spawnSync(
      nearCliExe,
      [
        "account",
        "create-account",
        "sponsor-by-faucet-service",
        candidateName,
        "use-manually-provided-public-key",
        publicKey,
        "network-config",
        "testnet",
        "create",
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 20000,
        encoding: "utf8",
      },
    );
    if (res.status === 0) {
      cliCreatedAccount = candidateName;
      activeAccountId = candidateName;
      console.log(`[wallet] near-cli-rs created account: ${candidateName}`);
    } else {
      const errOut = `${res.stdout || ""}\n${res.stderr || ""}`.trim();
      console.log(
        `[wallet] near-cli-rs sponsor skipped (${res.error?.message || `exit=${String(res.status)}`})${errOut ? `: ${errOut.slice(0, 220)}` : ""}`,
      );
    }
  }

  upsertEnvVars(rootEnvPath, {
    NEAR_NETWORK: "testnet",
    NEAR_RPC_URL: "https://test.rpc.fastnear.com",
    NEAR_CONTRACT_ID: activeAccountId,
    NEAR_CONTRACT_PRIVATE_KEY: privateKey,
    NEAR_RESOLVER_ACCOUNT_ID: activeAccountId,
    NEAR_RESOLVER_PRIVATE_KEY: privateKey,
    NEXT_PUBLIC_CONTRACT_ID: activeAccountId,
  });

  upsertEnvVars(webEnvPath, {
    NEXT_PUBLIC_NEAR_NETWORK: "testnet",
    NEXT_PUBLIC_NEAR_RPC_URL: "https://test.rpc.fastnear.com",
    NEXT_PUBLIC_CONTRACT_ID: activeAccountId,
    NEXT_PUBLIC_SERVICES_URL: "http://localhost:3001",
  });

  const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
  let balanceNear = "0 (unfunded yet)";
  try {
    const acct = await provider.viewAccount({ accountId: activeAccountId });
    balanceNear = `${(Number(acct.amount) / 1e24).toFixed(4)} NEAR`;
  } catch {
    // Account doesn't exist on-chain until funded if implicit.
  }

  console.log("=== GENERATED TESTNET WALLET (keys saved safely in .env, NOT printed) ===");
  console.log("Account ID to fund:", activeAccountId);
  console.log("Public Key:", publicKey);
  if (cliCreatedAccount) {
    console.log("Sponsored named account:", cliCreatedAccount);
  } else {
    console.log("Account Type: NEAR Testnet Implicit Address (auto-creates on first transfer!)");
  }
  console.log("Current Testnet Balance:", balanceNear);
}

main().catch((err) => {
  console.error("[wallet] failed:", err);
  process.exit(1);
});

