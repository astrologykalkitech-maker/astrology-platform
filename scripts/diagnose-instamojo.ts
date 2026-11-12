import fs from "fs";
import path from "path";
import { validateInstamojoEnvironment } from "../lib/financial/config";
import { getInstamojoConfig } from "../lib/financial/instamojo";

// Manually parse .env.local without external dotenv dependency
try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  console.warn("Could not load .env.local:", e);
}

console.log("=====================================================");
console.log("       JYOTISHSETU — INSTAMOJO PAYMENT DIAGNOSTIC    ");
console.log("=====================================================");

const diagnostic = validateInstamojoEnvironment();
const config = getInstamojoConfig();

console.log("Environment Mode:   ", diagnostic.environment);
console.log("Resolved Base URL:  ", diagnostic.resolvedBaseUrl);
console.log("Configured Base URL:", config.endpoint);
console.log("Public Site URL:    ", diagnostic.publicSiteUrl);
console.log("Has API Key:        ", diagnostic.hasApiKey && config.apiKey ? "YES [MASKED: " + config.apiKey.slice(0, 4) + "..." + config.apiKey.slice(-4) + "]" : "NO");
console.log("Has Auth Token:     ", diagnostic.hasAuthToken && config.authToken ? "YES [MASKED: " + config.authToken.slice(0, 4) + "..." + config.authToken.slice(-4) + "]" : "NO");
console.log("Has Private Salt:   ", diagnostic.hasSalt ? "YES [MASKED]" : "NO");
console.log("Has Webhook Config: ", diagnostic.hasWebhookConfig ? "YES" : "NO");

if (diagnostic.missingVariables.length > 0) {
  console.log("\n[WARNING] Missing variables:", diagnostic.missingVariables.join(", "));
} else {
  console.log("\n[SUCCESS] All mandatory Instamojo configuration variables are loaded.");
}

console.log("=====================================================");
