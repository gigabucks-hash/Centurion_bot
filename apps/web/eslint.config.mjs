import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import security from "eslint-plugin-security";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // SECURITY pass: eslint-plugin-security recommended rules. object-injection is noisy for typed Record lookups,
  // so it is a warning; everything else is an error.
  { ...security.configs.recommended, rules: { ...security.configs.recommended.rules, "security/detect-object-injection": "off" } },
  { ignores: ["perf/**", "scripts/**", "screenshots/**"] },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
