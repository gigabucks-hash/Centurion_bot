import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:centurion_mobile/core/auth/base58.dart';
import 'package:centurion_mobile/core/auth/phantom_box.dart';
import 'package:centurion_mobile/core/auth/secure_token_store.dart';

Uint8List _hex(String h) =>
    Uint8List.fromList([for (var i = 0; i < h.length; i += 2) int.parse(h.substring(i, i + 2), radix: 16)]);
String _toHex(List<int> b) => b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

class FakeKv implements SecureKeyValue {
  final map = <String, String>{};
  int failWrites = 0;
  int writes = 0;
  bool failReads = false;
  int deleteAllCalls = 0;

  @override
  Future<String?> read(String key) async => failReads ? throw StateError('keystore') : map[key];
  @override
  Future<void> write(String key, String value) async {
    writes++;
    if (failWrites > 0) {
      failWrites--;
      throw StateError('keystore busy');
    }
    map[key] = value;
  }

  @override
  Future<void> delete(String key) async => map.remove(key);
  @override
  Future<void> deleteAll() async {
    deleteAllCalls++;
    map.clear();
  }
}

class FakeMarker implements InstallMarker {
  FakeMarker(this.present);
  bool present;
  @override
  Future<bool> exists() async => present;
  @override
  Future<void> create() async => present = true;
}

void main() {
  group('Base58', () {
    test('round-trips and keeps leading zero bytes', () {
      final b = Uint8List.fromList([0, 0, 1, 2, 255, 128]);
      expect(Base58.decode(Base58.encode(b)), b);
      expect(Base58.encode(Uint8List(32)), '1' * 32);
      expect(Base58.encode(utf8.encode('hello world')), 'StV1DL6CwTryKyV');
    });
    test('tryDecodeLength rejects bad chars and wrong length', () {
      expect(Base58.tryDecodeLength('0OIl', 4), isNull);
      expect(Base58.tryDecodeLength(Base58.encode(Uint8List(31)), 32), isNull);
      expect(Base58.tryDecodeLength('', 32), isNull);
      expect(Base58.tryDecodeLength(Base58.encode(Uint8List(32)), 32), hasLength(32));
    });
  });

  group('PhantomBox (pinenacl Box only)', () {
    test('RFC 7748 §5.2 X25519 vectors', () {
      expect(
        _toHex(
          PhantomBox.x25519(
            _hex('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4'),
            _hex('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c'),
          ),
        ),
        'c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552',
      );
      expect(
        _toHex(
          PhantomBox.x25519(
            _hex('4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d'),
            _hex('e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493'),
          ),
        ),
        '95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957',
      );
    });

    test('RFC 7748 §5.2 iterated vector (1 and 1000 iterations)', () {
      var k = _hex('09${'00' * 31}');
      var u = _hex('09${'00' * 31}');
      for (var i = 1; i <= 1000; i++) {
        final r = PhantomBox.x25519(k, u);
        u = k;
        k = r;
        if (i == 1) expect(_toHex(k), '422c8e7a6227d7bca1350b3e2bb7279f7897b87bb6854b783c60e80311ae3079');
      }
      expect(_toHex(k), '684cf59ba83309552800ef566f2f4d3c1c3887c49360e3875f2eb94d99532c51');
    });

    test('RFC 7748 §6.1 Diffie-Hellman vector', () {
      final a = _hex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a');
      final b = _hex('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb');
      final nine = _hex('09${'00' * 31}');
      final ka = PhantomBox.x25519(a, nine);
      final kb = PhantomBox.x25519(b, nine);
      expect(_toHex(ka), '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
      expect(_toHex(kb), 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
      const k = '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';
      expect(_toHex(PhantomBox.x25519(a, kb)), k);
      expect(_toHex(PhantomBox.x25519(b, ka)), k);
      expect(_toHex(PhantomKeyPair.fromSecretForTest(a).publicKey), _toHex(ka));
    });

    test('round trip dapp ↔ "Phantom" (base58 wire form), tamper → decrypt_failed', () {
      final dapp = PhantomKeyPair.generate();
      final wallet = PhantomKeyPair.generate();
      final dappBox = PhantomBox.openBase58(dapp, wallet.publicKeyBase58);
      final walletBox = PhantomBox.open(wallet, dapp.publicKey);
      final msg = Uint8List.fromList(utf8.encode('{"public_key":"x","session":"s"}'));
      final enc = walletBox.encrypt(msg);
      expect(enc.nonce, hasLength(24));
      expect(dappBox.decryptBase58(Base58.encode(enc.nonce), Base58.encode(enc.cipherText)), msg);
      final bad = Uint8List.fromList(enc.cipherText)..[20] ^= 1;
      expect(() => dappBox.decrypt(enc.nonce, bad), throwsA(isA<PhantomBoxException>()));
      // wrong key
      final other = PhantomBox.open(PhantomKeyPair.generate(), wallet.publicKey);
      expect(
        () => other.decrypt(enc.nonce, enc.cipherText),
        throwsA(isA<PhantomBoxException>().having((e) => e.reason, 'reason', 'decrypt_failed')),
      );
    });

    test('fresh keypair per login: two generates differ, toString never leaks the secret', () {
      final a = PhantomKeyPair.generate();
      final b = PhantomKeyPair.generate();
      expect(a.publicKeyBase58, isNot(b.publicKeyBase58));
      expect(a.toString(), isNot(contains(a.publicKeyBase58)));
    });

    test('rejects low-order (all-zero shared secret) and malformed public keys', () {
      final me = PhantomKeyPair.generate();
      for (final low in [Uint8List(32), _hex('01${'00' * 31}')]) {
        expect(
          () => PhantomBox.open(me, low),
          throwsA(isA<PhantomBoxException>().having((e) => e.reason, 'reason', 'low_order_point')),
        );
      }
      expect(() => PhantomBox.open(me, Uint8List(31)), throwsA(isA<PhantomBoxException>()));
      expect(() => PhantomBox.openBase58(me, 'not-base58!'), throwsA(isA<PhantomBoxException>()));
    });

    test('bad inputs surface as PhantomBoxException, never a raw String throw', () {
      final box = PhantomBox.open(PhantomKeyPair.generate(), PhantomKeyPair.generate().publicKey);
      expect(() => box.decrypt(Uint8List(23), Uint8List(32)), throwsA(isA<PhantomBoxException>()));
      expect(() => box.decrypt(Uint8List(24), Uint8List(5)), throwsA(isA<PhantomBoxException>()));
      expect(() => box.decryptBase58('0', '0'), throwsA(isA<PhantomBoxException>()));
      expect(() => PhantomBox.x25519(Uint8List(3), Uint8List(32)), throwsA(isA<PhantomBoxException>()));
    });
  });

  group('SecureTokenStore', () {
    test('reviewed platform options (iOS first_unlock_this_device, no sync, Android namespace)', () {
      // Read back through the public API of the const default instance.
      const s = FlutterSecureStorage(
        iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device, synchronizable: false),
        aOptions: AndroidOptions(storageNamespace: 'centurion_auth'),
      );
      final src = File('lib/core/auth/secure_token_store.dart').readAsStringSync();
      expect(src, contains('KeychainAccessibility.first_unlock_this_device'));
      expect(src, contains('synchronizable: false'));
      expect(src, contains("storageNamespace: 'centurion_auth'"));
      expect(src, isNot(contains('KeychainAccessibility.unlocked,')));
      expect(s.iOptions.toMap()['accessibility'], 'first_unlock_this_device');
      expect(s.iOptions.toMap()['synchronizable'], 'false');
    });

    test('stores only srt_ refresh tokens', () async {
      final kv = FakeKv();
      final st = SecureTokenStore(kv);
      expect(() => st.save('at_access'), throwsArgumentError);
      expect(await st.save('srt_1'), isTrue);
      expect(kv.map, {SecureTokenStore.refreshKey: 'srt_1'});
    });

    test('rotation: memory first, write retried, false after all attempts fail', () async {
      final kv = FakeKv()..failWrites = 2;
      final st = SecureTokenStore(kv, retryDelay: Duration.zero);
      expect(await st.save('srt_2'), isTrue);
      expect(kv.writes, 3);
      expect(st.persisted, isTrue);
      kv.failWrites = 5;
      expect(await st.save('srt_3'), isFalse);
      expect(st.current, 'srt_3', reason: 'session keeps working on the rotated token');
      expect(st.persisted, isFalse);
      expect(kv.map[SecureTokenStore.refreshKey], 'srt_2');
    });

    test('first run after install wipes stale items once', () async {
      final kv = FakeKv()..map['refresh_token'] = 'srt_stale';
      final marker = FakeMarker(false);
      final st = SecureTokenStore(kv, marker: marker);
      await st.firstRunCleanup();
      expect(kv.map, isEmpty);
      expect(marker.present, isTrue);
      await st.save('srt_new');
      await st.firstRunCleanup();
      expect(kv.deleteAllCalls, 1);
      expect(await st.load(), 'srt_new');
    });

    test('read failure → null (re-login), clear wipes memory and storage', () async {
      final kv = FakeKv()..map['refresh_token'] = 'srt_x';
      final st = SecureTokenStore(kv);
      kv.failReads = true;
      expect(await st.load(), isNull);
      kv.failReads = false;
      expect(await st.load(), 'srt_x');
      await st.clear();
      expect(st.current, isNull);
      expect(kv.map, isEmpty);
    });
  });
}
