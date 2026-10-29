// Generates src/wire/errors.ts and services/backend/crates/common/src/error_codes.rs from errors.json.
// Run from repo root: node packages/contracts/scripts/gen-errors.mjs  (CI fails if outputs are stale).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const spec = JSON.parse(readFileSync(join(pkg, "errors.json"), "utf8"));
const codes = spec.codes;
for (const c of codes) {
  if (c.sqlstate !== `P0${String(c.http).padStart(3, "0")}`) throw new Error(`${c.code}: sqlstate must be P0+http`);
  if (!c.messages?.en || !c.messages?.id) throw new Error(`${c.code}: messages.en and messages.id required`);
  if (!["error", "notice", "skip"].includes(c.kind)) throw new Error(`${c.code}: kind must be error|notice|skip`);
}
const pascal = (c) => c.toLowerCase().split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("");

const ts = `// GENERATED from errors.json by scripts/gen-errors.mjs. Do not edit.
export const ERROR_CODES_VERSION = ${spec.version} as const;
export type ErrorCode =
${codes.map((c) => `  | "${c.code}"`).join("\n")};
export type ErrorLocale = "en" | "id";
/** sqlstate = what Supabase RPC errors carry (PostgrestException.code); MESSAGE = the code itself. */
export type ErrorKind = "error" | "notice" | "skip";
export interface ErrorCodeInfo { kind: ErrorKind; http: number; sqlstate: string; retryable: boolean; messages: Record<ErrorLocale, string> }
export const ERROR_CODES: Record<ErrorCode, ErrorCodeInfo> = {
${codes.map((c) => `  ${c.code}: { kind: "${c.kind}", http: ${c.http}, sqlstate: "${c.sqlstate}", retryable: ${c.retryable}, messages: { en: ${JSON.stringify(c.messages.en)}, id: ${JSON.stringify(c.messages.id)} } },`).join("\n")}
};
export function errorMessage(code: ErrorCode, locale: ErrorLocale = "en"): string {
  return ERROR_CODES[code].messages[locale];
}
/** REST error body. error is ALWAYS an object; details are flattened into it (e.g. current_rev). */
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; request_id?: string; server_now: string; [detail: string]: import("./events").JsonValue | undefined };
  server_now: string;
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

    /// SQLSTATE raised by the SQL layer for this code (P0 + HTTP status).
    pub fn sqlstate(self) -> &'static str {
        match self {
${codes.map((c) => `            ErrorCode::${pascal(c.code)} => "${c.sqlstate}",`).join("\n")}
        }
    }

    /// "error" | "notice" | "skip".
    pub fn kind(self) -> &'static str {
        match self {
${codes.map((c) => `            ErrorCode::${pascal(c.code)} => "${c.kind}",`).join("\n")}
        }
    }

    pub fn message_en(self) -> &'static str {
        match self {
${codes.map((c) => `            ErrorCode::${pascal(c.code)} => ${JSON.stringify(c.messages.en)},`).join("\n")}
        }
    }

    pub fn message_id(self) -> &'static str {
        match self {
${codes.map((c) => `            ErrorCode::${pascal(c.code)} => ${JSON.stringify(c.messages.id)},`).join("\n")}
        }
    }

    pub fn parse(s: &str) -> Option<ErrorCode> {
        Self::ALL.iter().copied().find(|c| c.as_str() == s)
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
