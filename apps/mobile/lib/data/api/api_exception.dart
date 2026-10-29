/// Typed API error. Codes come from the generated [ApiErrorCode]
/// (`api_errors.g.dart`, from `packages/contracts/errors.json`).
library;

import 'api_errors.g.dart';

export 'api_errors.g.dart';

class ApiException implements Exception {
  ApiException(this.code, {String? rawCode, String? message, this.sqlState, this.details = const {}})
      : rawCode = rawCode ?? code.wire,
        message = message ?? code.messageEn ?? rawCode ?? 'Unknown error';

  /// From a code string (REST `error.code`, RPC MESSAGE). Unknown codes keep [rawCode].
  factory ApiException.fromCode(String code, {String? message, Map<String, Object?> details = const {}}) =>
      ApiException(ApiErrorCode.fromWire(code), rawCode: code, message: message, details: details);

  /// Supabase RPC error: SQLSTATE `P04xx`, MESSAGE = code, DETAIL = JSON details.
  factory ApiException.fromPostgres({required String? sqlState, required String? message, Map<String, Object?>? details}) {
    final code = ApiErrorCode.fromPostgres(sqlState, message);
    return ApiException(code, rawCode: message ?? '', sqlState: sqlState, details: details ?? const {});
  }

  /// REST error body `{error: {code, message, details}, ...409 merge fields}`.
  factory ApiException.fromRestBody(Map<String, Object?> body) {
    final e = (body['error'] as Map?)?.cast<String, Object?>() ?? const {};
    final details = <String, Object?>{
      ...?(e['details'] as Map?)?.cast<String, Object?>(),
      for (final k in const ['current_rev', 'base_rev', 'changed_fields', 'changed_by', 'changed_at', 'current'])
        if (body.containsKey(k)) k: body[k],
    };
    return ApiException.fromCode('${e['code'] ?? ''}', message: e['message'] as String?, details: details);
  }

  final ApiErrorCode code;

  /// Code string as received; differs from `code.wire` only for [ApiErrorCode.unknown].
  final String rawCode;
  final String message;
  final String? sqlState;
  final Map<String, Object?> details;

  bool get isConflict => code.http == 409;
  bool get retryable => code.retryable;

  /// True for [wire] even before the generator knows it (raw code match).
  bool isCode(String wire) => rawCode == wire;

  @override
  String toString() => 'ApiException($rawCode${sqlState == null ? '' : ', $sqlState'}): $message';
}
