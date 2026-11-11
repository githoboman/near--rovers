import fs from "node:fs";
import path from "node:path";

export interface PerpetuaServiceConfig {
  networkId: string;
  nearRpcUrl: string;
  contractId: string;
  resolverAccountId: string;
  resolverPrivateKey: string;
  nearAiBaseUrl: string;
  nearAiApiKey: string;
  juryModels: string[];
  pageModel: string;
  jurySupermajorityNumerator: number;
  jurySupermajorityDenominator: number;
  oneClickApiUrl: string;
  oneClickJwt: string;
  dbPath: string;
  port: number;
  pollIntervalMs: number;
  autoRunJury: boolean;
  autoGeneratePages: boolean;
  allowUnverifiedFallback: boolean;
  corsOrigin: string;
}

const DEFAULT_JURY_MODELS = [
  "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  "Qwen/Qwen3.6-35B-A3B-FP8",
  "z-ai/glm-5.3-flash",
];

const DEFAULT_PAGE_MODEL = "Qwen/Qwen3-VL-30B-A3B-Instruct";

function loadEnvIfPresent(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    try {
      if (typeof process.loadEnvFile === "function") {
        process.loadEnvFile(envPath);
      }
    } catch {
      // Ignore malformed optional .env entries; explicit shell env still takes precedence.
    }
  }
}

export function loadConfig(): PerpetuaServiceConfig {
  loadEnvIfPresent();

  const networkId =
    process.env.NEAR_NETWORK || process.env.NEAR_NETWORK_ID || "testnet";
  const defaultRpc =
    networkId === "mainnet"
      ? "https://rpc.mainnet.fastnear.com"
      : "https://test.rpc.fastnear.com";

  const juryModelsRaw = process.env.JURY_MODELS;
  const juryModels = juryModelsRaw
    ? juryModelsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_JURY_MODELS;

  const port = Number(process.env.SERVICES_PORT || process.env.PORT || 3001);
  const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 4000);
  const num = Number(process.env.JURY_SUPERMAJORITY_NUMERATOR || 2);
  const den = Number(process.env.JURY_SUPERMAJORITY_DENOMINATOR || 3);

  return {
    networkId,
    nearRpcUrl: process.env.NEAR_RPC_URL || defaultRpc,
    contractId:
      process.env.NEAR_CONTRACT_ID ||
      process.env.CONTRACT_ID ||
      process.env.NEXT_PUBLIC_CONTRACT_ID ||
      "",
    resolverAccountId: process.env.NEAR_RESOLVER_ACCOUNT_ID || "",
    resolverPrivateKey: process.env.NEAR_RESOLVER_PRIVATE_KEY || "",
    nearAiBaseUrl: (
      process.env.NEAR_AI_BASE_URL || "https://cloud-api.near.ai/v1"
    ).replace(/\/+$/, ""),
    nearAiApiKey: process.env.NEAR_AI_API_KEY || "",
    juryModels: juryModels.length > 0 ? juryModels : DEFAULT_JURY_MODELS,
    pageModel: process.env.PAGE_MODEL || DEFAULT_PAGE_MODEL,
    jurySupermajorityNumerator: Number.isFinite(num) && num > 0 ? num : 2,
    jurySupermajorityDenominator: Number.isFinite(den) && den > 0 ? den : 3,
    oneClickApiUrl: (
      process.env.ONECLICK_API_BASE ||
      process.env.ONECLICK_API_URL ||
      "https://1click.chaindefuser.com"
    ).replace(/\/+$/, ""),
    oneClickJwt: process.env.ONECLICK_JWT || "",
    dbPath:
      process.env.PERPETUA_DB_PATH ||
      process.env.DB_PATH ||
      "./data/perpetua.db",
    port: Number.isFinite(port) && port > 0 ? port : 3001,
    pollIntervalMs:
      Number.isFinite(pollIntervalMs) && pollIntervalMs >= 1000
        ? pollIntervalMs
        : 4000,
    autoRunJury: process.env.AUTO_RUN_JURY !== "false",
    autoGeneratePages: process.env.AUTO_GENERATE_PAGES !== "false",
    allowUnverifiedFallback: process.env.ALLOW_UNVERIFIED_FALLBACK === "true",
    corsOrigin: process.env.CORS_ORIGIN || "*",
  };
}
