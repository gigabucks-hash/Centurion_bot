# @sentra/contracts (DRAFT)

Tipe bersama API/WS untuk apps Sentra.

**Status:** draft. Isinya saat ini adalah *view-model* dari Desktop (`apps/desktop`), dipakai sampai Backend API Specialist menerbitkan spec resmi (OpenAPI REST + JSON Schema event WS). Setelah spec resmi ada:
- Backend jadi owner package ini; tipe di-generate dari OpenAPI/JSON Schema (TS untuk web/desktop, Dart untuk mobile, Rust via `typify`/`schemars`).
- Desktop memetakan DTO wire → view-model di Rust (`apps/desktop/src-tauri/src/model.rs`), jadi perubahan wire tidak memecah UI.

Konsumen sekarang: `apps/desktop` (alias `@sentra/contracts` → `src/index.ts`, lihat `apps/desktop/vite.config.ts` dan `tsconfig.json`).

Kenapa Rust belum share dari sini: Rust tidak bisa impor TS. Mirror Rust ada di `apps/desktop/src-tauri/src/model.rs` (serde camelCase) dan harus diubah bersamaan; nanti diganti codegen dari JSON Schema.

## Official wire contract v1 (Backend, 2026-10-29)

| File | Contents |
|---|---|
| `EVENTS_SCHEMA.md` | event envelope, types, transport, seq/resume, `server_now` |
| `API_ENDPOINTS.md` | REST/SSE, scopes, workspace+mode scoping, approvals and tokens, auth, proof-of-confirmation |
| `WEB_INTEGRATION_ANSWERS.md`, `FLUTTER_INTEGRATION_ANSWERS.md` | answers to the client teams |
| `errors.json` | shared error codes (source). `npm run gen` generates `src/wire/errors.ts` and the Rust `error_codes.rs` |
| `src/wire/*` | TS wire types (`import { wire } from "@sentra/contracts"`) |

The view-model in `src/index.ts` (Desktop) stays as-is. Map `wire.*` DTOs onto it.
