import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Minimal secure key/value surface (fake in tests).
abstract interface class SecureKeyValue {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
  Future<void> deleteAll();
}

/// flutter_secure_storage 11.2.0 with the reviewed options (SIWS_LOGIN_REVIEW §11.4):
/// iOS Keychain `first_unlock_this_device`, `synchronizable: false` (refresh from a
/// notification action while locked still works; never migrates to a new device);
/// Android default `AndroidOptions` (RSA-OAEP Keystore-wrapped AES-GCM), namespace
/// `sentra_auth`, app keeps `allowBackup=false` + `dataExtractionRules`.
class FlutterSecureKeyValue implements SecureKeyValue {
  FlutterSecureKeyValue([FlutterSecureStorage? storage]) : _s = storage ?? _default;

  static const _default = FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device, synchronizable: false),
    aOptions: AndroidOptions(storageNamespace: 'sentra_auth'),
  );
  final FlutterSecureStorage _s;

  @override
  Future<String?> read(String key) => _s.read(key: key);
  @override
  Future<void> write(String key, String value) => _s.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _s.delete(key: key);
  @override
  Future<void> deleteAll() => _s.deleteAll();
}

/// "Has this install run before?" marker. Keychain items survive an iOS uninstall,
/// so the first run of a fresh install wipes stale tokens (§11.4 f).
abstract interface class InstallMarker {
  Future<bool> exists();
  Future<void> create();
}

/// Marker file in the app support dir (no SharedPreferences dependency).
/// iOS: `$HOME/Library/Application Support` (inside the app container, removed on
/// uninstall). Android: app data is removed on uninstall and never restored
/// (`allowBackup=false`), so no stale token can exist: [forPlatform] returns null.
class FileInstallMarker implements InstallMarker {
  FileInstallMarker(this.file);
  final File file;

  static FileInstallMarker? forPlatform() {
    if (!Platform.isIOS) return null;
    final home = Platform.environment['HOME'];
    if (home == null || home.isEmpty) return null;
    return FileInstallMarker(File('$home/Library/Application Support/.centurion_installed'));
  }

  @override
  Future<bool> exists() => file.exists();
  @override
  Future<void> create() async {
    await file.parent.create(recursive: true);
    await file.writeAsString('1', flush: true);
  }
}

/// Stores ONLY the rotating refresh token (`srt_…`). Access token, x25519 keys and
/// the Phantom session stay in memory.
///
/// Rotation: the new token is kept in memory FIRST ([current]) so the session keeps
/// working; the write is retried ([writeAttempts], backoff); if it still fails the
/// caller gets `false` and should ask for a fresh login after this session ends
/// (the next cold start would otherwise present a rotated-out token = reuse).
class SecureTokenStore {
  SecureTokenStore(
    this._kv, {
    this.marker,
    this.writeAttempts = 3,
    this.retryDelay = const Duration(milliseconds: 200),
  });

  static const refreshKey = 'refresh_token';
  final SecureKeyValue _kv;
  final InstallMarker? marker;
  final int writeAttempts;
  final Duration retryDelay;

  String? _memory;
  bool _persisted = true;

  /// In-memory refresh token (authoritative while the app runs).
  String? get current => _memory;

  /// False when the latest rotation could not be written.
  bool get persisted => _persisted;

  /// Call once at startup before [load]: wipes leftovers from a previous install.
  Future<void> firstRunCleanup() async {
    final m = marker;
    if (m == null) return;
    try {
      if (await m.exists()) return;
      await _kv.deleteAll();
      await m.create();
    } catch (_) {
      // Fail safe: a failed check only means we may not have wiped; never crash startup.
    }
  }

  Future<String?> load() async {
    try {
      _memory = await _kv.read(refreshKey);
    } catch (_) {
      _memory = null; // resetOnError may have wiped the store → re-login
    }
    return _memory;
  }

  /// Rotation or first login. Returns whether it reached secure storage.
  Future<bool> save(String refreshToken) async {
    if (!refreshToken.startsWith('srt_')) throw ArgumentError('not a refresh token');
    _memory = refreshToken;
    for (var i = 0; i < writeAttempts; i++) {
      try {
        await _kv.write(refreshKey, refreshToken);
        _persisted = true;
        return true;
      } catch (_) {
        if (i < writeAttempts - 1) await Future<void>.delayed(retryDelay * (i + 1));
      }
    }
    _persisted = false;
    return false;
  }

  Future<void> clear() async {
    _memory = null;
    _persisted = true;
    try {
      await _kv.delete(refreshKey);
    } catch (_) {
      try {
        await _kv.deleteAll();
      } catch (_) {}
    }
  }
}
