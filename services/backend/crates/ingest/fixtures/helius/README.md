Synthetic frames kept only for shapes that no current mainnet frame has:
- `logs_create_legacy.json`: the older CreateEvent layout, without trailing fields.
- `logs_failed.json`: a failed tx (dropped by the parser).
- `logs_unrelated.json`: an unrelated program and garbage data.

Everything else is tested against the real captures in `services/backend/fixtures/mainnet/`.
