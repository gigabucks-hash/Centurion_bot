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

  /// Supabase RPC error (`PostgrestException`): `.code` = SQLSTATE `P0`+HTTP, `.message` = the code,
  /// `.details` = JSON text of the details (pass it decoded).
  factory ApiException.fromPostgres({
    required String? sqlState,
    required String? message,
    Map<String, Object?>? details,
  }) {
    final code = ApiErrorCode.fromPostgres(sqlState, message);
    return ApiException(code, rawCode: message ?? '', sqlState: sqlState, details: details ?? const {});
  }

  /// REST error body (1.1.2): `{error: {code, message, ...details, server_now}, server_now}`.
  /// `error` is always an object; 409 merge fields (`current_rev`, `current`, ...) live inside it.
  factory ApiException.fromRestBody(Map<String, Object?> body) {
    final e = (body['error'] as Map?)?.cast<String, Object?>() ?? const {};
    final details = <String, Object?>{
      for (final k in e.keys)
        if (k != 'code' && k != 'message' && k != 'details') k: e[k],
      ...?(e['details'] as Map?)?.cast<String, Object?>(),
      if (!e.containsKey('server_now') && body['server_now'] != null) 'server_now': body['server_now'],
    };
    return ApiException.fromCode('${e['code'] ?? ''}', message: e['message'] as String?, details: details);
  }

  /// Localized message from errors.json (`id`/`en`), else the server's text.
  String localizedMessage(String lang) => code.message(lang) ?? message;

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
