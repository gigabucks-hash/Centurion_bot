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

  test('P04xx mapper: MESSAGE = code wins; non-P04 SQLSTATE is unknown', () {
    expect(ApiErrorCode.fromPostgres('P0409', 'STRATEGY_REV_CONFLICT'), ApiErrorCode.fromWire('STRATEGY_REV_CONFLICT'));
    expect(ApiErrorCode.fromPostgres('P0400', 'APPROVAL_EXPIRED'), ApiErrorCode.fromWire('APPROVAL_EXPIRED'));
    expect(ApiErrorCode.fromPostgres('23505', 'duplicate key'), ApiErrorCode.unknown);
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
      'http': 418,
      'retryable': true,
      'message': 'Fixture only',
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
  });
}
