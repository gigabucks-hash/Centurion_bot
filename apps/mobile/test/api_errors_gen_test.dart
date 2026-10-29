import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/data/api/api_exception.dart';

import '../tool/gen_errors.dart' as gen;

/// The generated enum must track `errors.json` exactly. No count is hardcoded
/// here: everything is read from the JSON the generator consumes.
void main() {
  final source = Platform.environment['ERRORS_JSON'] ?? 'tool/contracts/errors.json';
  final json = jsonDecode(File(source).readAsStringSync()) as Map<String, Object?>;
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
    final dart = root == null ? 'dart' : '$root/bin/dart';
    final r = await Process.run(dart, ['run', 'tool/gen_errors.dart', '--check', '--source', source]);
    expect(r.exitCode, 0, reason: '${r.stdout}${r.stderr}\nRun: dart run tool/gen_errors.dart');
  }, timeout: const Timeout(Duration(minutes: 2)));

  test('a new code in errors.json is generated with no manual edits', () {
    final fixture = jsonDecode(File(source).readAsStringSync()) as Map<String, dynamic>;
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
    final bad = jsonDecode(File(source).readAsStringSync()) as Map<String, dynamic>;
    ((bad['codes'] as List).first as Map)['sqlstate'] = 'P0999';
    expect(() => gen.generate(jsonEncode(bad)), throwsA(isA<FormatException>()));
  });
}
