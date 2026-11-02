
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    // Next.js generated files
    ".next/**",
    "**/.next/**",

    // Dependencies and build output
    "**/node_modules/**",
    "out/**",
    "build/**",

    // TypeScript generated files
    "next-env.d.ts",

    // Other ignored folders
    "scripts/**",
    "scratch/**",

    // Accidental nested project folder
    "astrologer-platform-main/**",
  ]),

  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
]);

export default eslintConfig;
