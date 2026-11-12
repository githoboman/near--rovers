import fs from "node:fs";
import path from "node:path";
import {
  Account,
  JsonRpcProvider,
  teraToGas,
  type KeyPairString,
} from "near-api-js";
import { loadConfig } from "../config.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const contractId = process.env.NEAR_DEPLOY_ACCOUNT_ID || config.contractId;
  const contractPrivateKey = (
    process.env.NEAR_CONTRACT_PRIVATE_KEY ||
    config.resolverPrivateKey
  ) as KeyPairString;

  if (!contractId || !contractPrivateKey) {
    throw new Error(
      "Set NEAR_CONTRACT_ID (or NEAR_DEPLOY_ACCOUNT_ID) and NEAR_CONTRACT_PRIVATE_KEY in .env before deploying.",
    );
  }

  const ownerId = process.env.NEAR_OWNER_ID || contractId;
  const resolverAccountId =
    config.resolverAccountId || contractId;
  const wasmPath = path.resolve(
    process.cwd(),
    process.env.WASM_PATH ||
      "../contract/target/wasm32-unknown-unknown/release/perpetua_contract.wasm",
  );

  if (!fs.existsSync(wasmPath)) {
    throw new Error(`Contract WASM not found at ${wasmPath}`);
  }

  const wasm = new Uint8Array(fs.readFileSync(wasmPath));
  const provider = new JsonRpcProvider({ url: config.nearRpcUrl });
  const account = new Account(contractId, provider, contractPrivateKey);

  console.log(
    `[deploy] deploying ${wasm.byteLength} bytes from ${wasmPath} to ${contractId} (${config.networkId})...`,
  );
  await account.deployContract(wasm);
  console.log(`[deploy] contract code uploaded to ${contractId}`);

  let initialized = false;
  try {
    await provider.callFunction({
      contractId,
      method: "get_config",
      args: {},
    });
    initialized = true;
    console.log(`[deploy] contract already initialized; skipping new()`);
  } catch {
    initialized = false;
  }

  if (!initialized) {
    await account.callFunction({
      contractId,
      methodName: "new",
      args: {
        owner_id: ownerId,
        resolver_account_id: resolverAccountId,
        ...(process.env.CONTRACT_FEE_BPS
          ? { fee_bps: Number(process.env.CONTRACT_FEE_BPS) }
          : {}),
        ...(process.env.CONTRACT_ESCALATION_BOND
          ? { escalation_bond: process.env.CONTRACT_ESCALATION_BOND }
          : {}),
        ...(process.env.CONTRACT_CHALLENGE_WINDOW_NS
          ? { challenge_window_ns: process.env.CONTRACT_CHALLENGE_WINDOW_NS }
          : {}),
      },
      gas: teraToGas("50"),
      deposit: 0n,
    });
    console.log(
      `[deploy] initialized ${contractId} (owner=${ownerId}, resolver=${resolverAccountId})`,
    );
  }
}

main().catch((err) => {
  console.error("[deploy] failed:", err);
  process.exit(1);
});

