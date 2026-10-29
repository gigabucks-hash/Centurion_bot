# solbot_mobile

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## Error codes (contracts `errors.json` → Dart)

```bash
# from app/
dart run tool/gen_errors.dart                       # regenerate lib/data/api/api_errors.g.dart
dart run tool/gen_errors.dart --check               # exit 1 if stale
ERRORS_JSON=/workspace/sentra/packages/contracts/errors.json dart run tool/gen_errors.dart
tool/ci_check_errors.sh                             # CI gate: regenerate + git diff --exit-code
```

Update contracts: `cp /workspace/sentra/packages/contracts/errors.json tool/contracts/` then regenerate and commit.
Never edit `api_errors.g.dart` by hand. Counts are read from the JSON (test `api_errors_gen_test.dart`).
CI: `.github/workflows/mobile.yml` runs pub get → `tool/ci_check_errors.sh` → analyze → test.
Details: `../ARCHITECTURE.md` §8a. Contract v1.1 wire mapping lives only in `lib/data/api/`.
