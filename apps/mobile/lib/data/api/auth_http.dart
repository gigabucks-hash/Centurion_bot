/// REST client for `/v1/auth/*` (API_ENDPOINTS §4.1, contracts 1.1.4 + "Unreleased:
/// wallet login"). No HTTP package: [IoJsonTransport] uses `dart:io` and refuses
/// anything but `https` (cleartext is also blocked by network_security_config).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'api_exception.dart';
import 'auth.dart';

class JsonResponse {
  const JsonResponse(this.status, this.body, {this.headers = const {}});
  final int status;
  final Map<String, Object?> body;

  /// Lower-case header names.
  final Map<String, String> headers;
}

/// Minimal POST-JSON surface (fake in tests).
abstract interface class JsonTransport {
  Future<JsonResponse> postJson(String path, Map<String, Object?> body, {String? bearer});
}

class IoJsonTransport implements JsonTransport {
  IoJsonTransport(this.baseUrl, {HttpClient? client, this.timeout = const Duration(seconds: 20)})
    : _client = client ?? HttpClient() {
    if (baseUrl.scheme != 'https') throw ArgumentError.value(baseUrl, 'baseUrl', 'https only');
    _client.connectionTimeout = timeout;
  }

  final Uri baseUrl;
  final Duration timeout;
  final HttpClient _client;

  /// 64 KiB is far above any auth response; bigger bodies are dropped.
  static const maxBody = 64 * 1024;

  @override
  Future<JsonResponse> postJson(String path, Map<String, Object?> body, {String? bearer}) async {
    final uri = baseUrl.resolve(path);
    if (uri.scheme != 'https' || uri.host != baseUrl.host) throw ArgumentError.value(path, 'path');
    try {
      final req = await _client.postUrl(uri).timeout(timeout);
      req.followRedirects = false;
      req.headers.contentType = ContentType.json;
      req.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (bearer != null) req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $bearer');
      req.add(utf8.encode(jsonEncode(body)));
      final res = await req.close().timeout(timeout);
      final bytes = <int>[];
      await for (final chunk in res.timeout(timeout)) {
        bytes.addAll(chunk);
        if (bytes.length > maxBody) throw const FormatException('body too large');
      }
      final headers = <String, String>{};
      res.headers.forEach((k, v) => headers[k.toLowerCase()] = v.join(','));
      final text = utf8.decode(bytes, allowMalformed: false);
      final decoded = text.isEmpty ? const <String, Object?>{} : jsonDecode(text);
      return JsonResponse(
        res.statusCode,
        decoded is Map ? decoded.cast<String, Object?>() : const {},
        headers: headers,
      );
    } on TimeoutException {
      throw ApiException.fromCode('UNAVAILABLE', details: {'reason': 'timeout'});
    } on SocketException {
      throw ApiException.fromCode('UNAVAILABLE', details: {'reason': 'network'});
    } on HandshakeException {
      throw ApiException.fromCode('UNAVAILABLE', details: {'reason': 'tls'});
    } on FormatException {
      throw ApiException.fromCode('UNAVAILABLE', details: {'reason': 'bad_body'});
    }
  }

  void close() => _client.close(force: true);
}

class HttpSiwsAuthRepository implements SiwsAuthRepository {
  HttpSiwsAuthRepository(this.transport, {DateTime Function()? clock})
    : _clock = clock ?? (() => DateTime.now().toUtc());

  final JsonTransport transport;
  final DateTime Function() _clock;

  /// Last `X-Centurion-Login-Delay-Ms` (owner soft delay instead of 429), for UI copy.
  int? lastLoginDelayMs;

  Map<String, Object?> _data(JsonResponse r) {
    final h = r.headers['x-centurion-login-delay-ms'];
    lastLoginDelayMs = h == null ? null : int.tryParse(h);
    if (r.status >= 200 && r.status < 300) {
      final d = r.body['data'];
      if (d is Map) return d.cast<String, Object?>();
      throw ApiException.fromCode('UNAVAILABLE', details: {'reason': 'bad_body'});
    }
    if (r.body['error'] is Map) {
      final e = ApiException.fromRestBody(r.body);
      final retry = r.headers['retry-after'];
      if (retry != null && !e.details.containsKey('retry_after_s')) {
        return throw ApiException(
          e.code,
          rawCode: e.rawCode,
          message: e.message,
          details: {...e.details, 'retry_after_s': int.tryParse(retry) ?? 0},
        );
      }
      throw e;
    }
    // No error envelope (proxy page, 404 for a disabled route, ...).
    throw ApiException.fromCode(
      r.status == 401 ? 'UNAUTHENTICATED' : (r.status == 429 ? 'RATE_LIMITED' : 'UNAVAILABLE'),
      details: {'http': r.status},
    );
  }

  @override
  Future<SiwsChallenge> nonce({
    required String address,
    required String domain,
    String? uri,
    String? chainId,
    int statementVersion = SiwsChallenge.currentStatementVersion,
  }) async {
    final d = _data(
      await transport.postJson(AuthPaths.siwsNonce, {
        'address': address,
        'domain': domain,
        'uri': ?uri,
        'chain_id': chainId ?? 'solana:mainnet',
        'statement_version': statementVersion,
      }),
    );
    return SiwsChallenge.fromJson(d);
  }

  @override
  Future<Session> verify({
    required String address,
    required String message,
    required String signatureBase58,
    String client = 'mobile',
  }) async {
    final d = _data(
      await transport.postJson(AuthPaths.siwsVerify, {
        'address': address,
        'message': message,
        'signature': signatureBase58,
        'client': client,
      }),
    );
    return Session.fromJson(d, now: _clock());
  }

  @override
  Future<Session> refresh(String refreshToken) async => Session.fromJson(
    _data(await transport.postJson(AuthPaths.sessionRefresh, {'refresh_token': refreshToken})),
    now: _clock(),
  );

  @override
  Future<void> logout(String refreshToken) async {
    try {
      _data(await transport.postJson(AuthPaths.sessionLogout, {'refresh_token': refreshToken}));
    } on ApiException {
      // Always 200 by contract; local tokens are wiped by the caller regardless.
    }
  }
}
