import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:centurion_mobile/data/api/api_exception.dart';

import '../tool/gen_errors.dart' as gen;
import 'support/contracts_source.dart';

/// The generated enum must track `errors.json` exactly. No count is hardcoded
/// here: everything is read from the JSON the generator consumes.
void main() {
  // errors.json at the contracts pin (lib/data/api/contracts_pin.dart), not the working tree.
  final pinned = pinnedErrorsJson();
  final source = '${Directory.systemTemp.createTempSync('errors_pin').path}/errors.json';
  File(source).writeAsStringSync(pinned);
  final json = jsonDecode(pinned) as Map<String, Object?>;
  final codes = [for (final c in json['codes']! as List) (c as Map)['code'] as String];

  test('count + version + every code match errors.json', () {
    expect(apiErrorCodesCount, codes.length);
    expect(ApiErrorCode.values.where((c) => c != ApiErrorCode.unknown), hasLength(codes.length));
    expect(apiErrorCodesVersion, json['version']);
    for (final c in codes) {
      expect(ApiErrorCode.fromWire(c), isNot(ApiErrorCode.unknown), reason: c);
    }
    expect(ApiErrorCode.fromWire('RESET_COOLDOWN').http, 429);
  });

  test('v4: sqlstate = P0+http, kind and en/id messages come from errors.json', () {
    for (final raw in json['codes']! as List) {
      final c = (raw as Map).cast<String, Object?>();
      final e = ApiErrorCode.fromWire(c['code']! as String);
      expect(e.sqlState, 'P0${c['http']}', reason: e.wire);
      expect(e.sqlState, c['sqlstate'], reason: e.wire);
      expect(e.kind.name, c['kind'], reason: e.wire);
      final msgs = (c['messages']! as Map).cast<String, String>();
      expect(e.message('en'), msgs['en'], reason: e.wire);
      expect(e.message('id'), msgs['id'], reason: e.wire);
    }
    expect(ApiErrorCode.fromWire('POSITION_ALREADY_CLOSED').http, 409);
    expect(ApiErrorCode.fromWire('INVALID_FRACTION').http, 422);
    expect(ApiErrorCode.fromWire('IDEMPOTENCY_KEY_REUSED').http, 422);
    expect(ApiErrorCode.fromWire('UNSUPPORTED_QUOTE_MINT').kind, ApiErrorKind.skip);
  });

  test('sqlstate mapper: P04xx/P05xx + MESSAGE = code; plain Postgres SQLSTATE is unknown', () {
    expect(ApiErrorCode.fromPostgres('P0409', 'VERSION_CONFLICT'), ApiErrorCode.fromWire('VERSION_CONFLICT'));
    expect(
      ApiErrorCode.fromPostgres('P0409', 'POSITION_ALREADY_CLOSED'),
      ApiErrorCode.fromWire('POSITION_ALREADY_CLOSED'),
    );
    expect(ApiErrorCode.fromPostgres('P0503', 'UNAVAILABLE'), ApiErrorCode.fromWire('UNAVAILABLE'));
    expect(ApiErrorCode.fromPostgres('23505', 'duplicate key'), ApiErrorCode.unknown);
    expect(ApiErrorCode.httpFromSqlState('P0422'), 422);
    expect(ApiErrorCode.httpFromSqlState('23505'), isNull);
  });

  test('committed api_errors.g.dart == fresh generator output (sync / golden)', () async {
    final root = Platform.environment['FLUTTER_ROOT'];
    // Windows SDKs ship `bin/dart.bat` plus the real `bin/cache/dart-sdk/bin/dart.exe`; spawning
    // `bin/dart` there fails with "%1 is not a valid Win32 application". Use the .exe (or the .bat
    // through cmd) on Windows; Linux/macOS keep `bin/dart` unchanged.
    var dart = root == null ? 'dart' : '$root/bin/dart';
    var shell = false;
    if (Platform.isWindows) {
      final exe = root == null ? null : '$root/bin/cache/dart-sdk/bin/dart.exe';
      if (exe != null && File(exe).existsSync()) {
        dart = exe;
      } else {
        dart = root == null ? 'dart.bat' : '$root/bin/dart.bat';
        shell = true;
      }
    }
    final r = await Process.run(dart, [
      'run',
      'tool/gen_errors.dart',
      '--check',
      '--source',
      source,
    ], runInShell: shell);
    expect(r.exitCode, 0, reason: '${r.stdout}${r.stderr}\nRun: dart run tool/gen_errors.dart');
  }, timeout: const Timeout(Duration(minutes: 2)));

  test('a new code in errors.json is generated with no manual edits', () {
    final fixture = jsonDecode(pinned) as Map<String, dynamic>;
    (fixture['codes'] as List).add({
      'code': 'BRAND_NEW_CODE',
      'kind': 'error',
      'http': 418,
      'sqlstate': 'P0418',
      'retryable': true,
      'messages': {'id': 'Hanya fixture', 'en': 'Fixture only'},
    });
    final out = gen.generate(jsonEncode(fixture));
    expect(out, contains("'BRAND_NEW_CODE'"));
    expect(out, contains('brandNewCode'));
    expect(out, contains('Hanya fixture'));
    expect(out, contains('apiErrorCodesCount = ${codes.length + 1}'));
    // Duplicates are rejected.
    (fixture['codes'] as List).add({'code': 'BRAND_NEW_CODE', 'http': 418, 'retryable': false, 'message': 'dup'});
    expect(() => gen.generate(jsonEncode(fixture)), throwsA(anything));
    // sqlstate must be P0 + http.
    final bad = jsonDecode(pinned) as Map<String, dynamic>;
    ((bad['codes'] as List).first as Map)['sqlstate'] = 'P0999';
    expect(() => gen.generate(jsonEncode(bad)), throwsA(isA<FormatException>()));
  });
}
