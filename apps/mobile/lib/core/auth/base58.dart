import 'dart:typed_data';

/// Bitcoin-alphabet base58 (Solana addresses/signatures, Phantom deeplink fields).
/// Small local codec: pinenacl has none and no extra package is approved.
abstract final class Base58 {
  static const _alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  static final _index = {for (var i = 0; i < _alphabet.length; i++) _alphabet.codeUnitAt(i): i};

  static String encode(List<int> bytes) {
    var zeros = 0;
    while (zeros < bytes.length && bytes[zeros] == 0) {
      zeros++;
    }
    var n = BigInt.zero;
    for (final b in bytes) {
      n = (n << 8) | BigInt.from(b);
    }
    final out = StringBuffer();
    final base = BigInt.from(58);
    final chars = <String>[];
    while (n > BigInt.zero) {
      chars.add(_alphabet[(n % base).toInt()]);
      n = n ~/ base;
    }
    out.write('1' * zeros);
    out.writeAll(chars.reversed);
    return out.toString();
  }

  /// Throws [FormatException] on a character outside the alphabet.
  static Uint8List decode(String s) {
    var zeros = 0;
    while (zeros < s.length && s.codeUnitAt(zeros) == 0x31) {
      zeros++;
    }
    var n = BigInt.zero;
    for (final c in s.codeUnits) {
      final v = _index[c];
      if (v == null) throw const FormatException('invalid base58');
      n = n * BigInt.from(58) + BigInt.from(v);
    }
    final body = <int>[];
    while (n > BigInt.zero) {
      body.add((n & BigInt.from(0xff)).toInt());
      n = n >> 8;
    }
    return Uint8List.fromList([...List.filled(zeros, 0), ...body.reversed]);
  }

  /// Decodes and checks the byte length (e.g. 32 for an address, 64 for a signature).
  static Uint8List? tryDecodeLength(String? s, int length) {
    if (s == null || s.isEmpty || s.length > 128) return null;
    try {
      final b = decode(s);
      return b.length == length ? b : null;
    } on FormatException {
      return null;
    }
  }
}
