// Generates src/wire/errors.ts and services/backend/crates/common/src/error_codes.rs from errors.json.
// Run from repo root: node packages/contracts/scripts/gen-errors.mjs  (CI fails if outputs are stale).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const spec = JSON.parse(readFileSync(join(pkg, "errors.json"), "utf8"));
const codes = spec.codes;
const pascal = (c) => c.toLowerCase().split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("");

const ts = `// GENERATED from errors.json by scripts/gen-errors.mjs. Do not edit.
export const ERROR_CODES_VERSION = ${spec.version} as const;
export type ErrorCode =
${codes.map((c) => `  | "${c.code}"`).join("\n")};
export interface ErrorCodeInfo { http: number; retryable: boolean; message: string }
export const ERROR_CODES: Record<ErrorCode, ErrorCodeInfo> = {
${codes.map((c) => `  ${c.code}: { http: ${c.http}, retryable: ${c.retryable}, message: ${JSON.stringify(c.message)} },`).join("\n")}
};
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown>; request_id?: string };
}
export function isErrorCode(v: string): v is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CODES, v);
}
`;
writeFileSync(join(pkg, "src", "wire", "errors.ts"), ts);

const rs = `// GENERATED from packages/contracts/errors.json by scripts/gen-errors.mjs. Do not edit.
use serde::{Deserialize, Serialize};

pub const ERROR_CODES_VERSION: u32 = ${spec.version};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
${codes.map((c) => `    ${pascal(c.code)},`).join("\n")}
}

impl ErrorCode {
    pub const ALL: &'static [ErrorCode] = &[
${codes.map((c) => `        ErrorCode::${pascal(c.code)},`).join("\n")}
    ];

    pub fn as_str(self) -> &'static str {
        match self {
${codes.map((c) => `            ErrorCode::${pascal(c.code)} => "${c.code}",`).join("\n")}
        }
    }

    pub fn http_status(self) -> u16 {
        match self {
${codes.map((c) => `            ErrorCode::${pascal(c.code)} => ${c.http},`).join("\n")}
        }
    }

    pub fn retryable(self) -> bool {
        match self {
${codes.map((c) => `            ErrorCode::${pascal(c.code)} => ${c.retryable},`).join("\n")}
        }
    }
}
`;
writeFileSync(join(pkg, "..", "..", "services", "backend", "crates", "common", "src", "error_codes.rs"), rs);
console.log(`generated ${codes.length} error codes`);
