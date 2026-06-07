import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadEnvE2e(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../../.env.e2e");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      "Missing .env.e2e — copy .env.e2e.example to .env.e2e and fill in credentials"
    );
  }
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  const vars: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return vars;
}

export function requireEnv(vars: Record<string, string>, key: string): string {
  const val = vars[key];
  if (!val) throw new Error(`${key} must be set in .env.e2e`);
  return val;
}
