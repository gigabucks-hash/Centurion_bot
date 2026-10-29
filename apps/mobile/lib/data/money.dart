/// Money primitives (contract v1.1 number rule): SOL amounts are lamport
/// integers (`BigInt`, wire = integer string), prices are [Decimal] (wire =
/// decimal string). Percentages/ratios/bps stay `num` (JSON numbers in v1.1).
/// `double` is never used for an amount or a price.
library;

import 'package:decimal/decimal.dart';

export 'package:decimal/decimal.dart' show Decimal;

final BigInt _perSol = BigInt.from(1000000000);
final Decimal _perSolD = Decimal.fromBigInt(_perSol);

/// Integer lamports. 1 SOL = 1 000 000 000 lamports.
extension type const Lamports(BigInt raw) {
  static final Lamports zero = Lamports(BigInt.zero);

  /// Wire: integer string, e.g. `"250000000"`.
  static Lamports parse(String wire) => Lamports(BigInt.parse(wire.trim()));
  static Lamports? tryParse(String? wire) {
    final b = wire == null ? null : BigInt.tryParse(wire.trim());
    return b == null ? null : Lamports(b);
  }

  /// From a SOL decimal string (`"0.25"`), exact; sub-lamport digits rounded half-up.
  static Lamports fromSol(String sol) =>
      Lamports((Decimal.parse(sol.trim()) * _perSolD).round().toBigInt());

  static Lamports fromInt(int lamports) => Lamports(BigInt.from(lamports));

  String toWire() => raw.toString();

  /// Exact SOL value as a Decimal (for formatting).
  Decimal toSol() => (Decimal.fromBigInt(raw) / _perSolD).toDecimal(scaleOnInfinitePrecision: 9);

  Lamports operator +(Lamports o) => Lamports(raw + o.raw);
  Lamports operator -(Lamports o) => Lamports(raw - o.raw);
  Lamports operator -() => Lamports(-raw);
  bool operator <(Lamports o) => raw < o.raw;
  bool operator >(Lamports o) => raw > o.raw;
  bool get isNegative => raw.isNegative;
  bool get isZero => raw == BigInt.zero;
  int get sign => raw.sign;
  Lamports abs() => Lamports(raw.abs());

  /// × basis points (0..10000), floor towards zero.
  Lamports bps(int bps) => Lamports(raw * BigInt.from(bps) ~/ BigInt.from(10000));

  /// × an exact Decimal ratio (e.g. mark/entry), rounded half-up to a lamport.
  Lamports times(Decimal ratio) => Lamports((Decimal.fromBigInt(raw) * ratio).round().toBigInt());

  /// Ratio to another amount as a display number (for %, never for money).
  double ratioTo(Lamports base) => base.isZero ? 0 : raw / base.raw;

  /// Chart coordinates only (pixels), never for arithmetic on money.
  double get plotValue => raw.toDouble() / 1e9;
}

Lamports sumLamports(Iterable<Lamports> xs) => xs.fold(Lamports.zero, (a, b) => a + b);

/// Exact a / b for prices (Decimal division is Rational; keep 18 dp).
Decimal ratio(Decimal a, Decimal b) => (a / b).toDecimal(scaleOnInfinitePrecision: 18);

/// Decimal × a display factor (mock random walk only), rounded to 18 dp.
Decimal scaleDecimal(Decimal a, num factor) =>
    (a * Decimal.parse(factor.toStringAsFixed(9))).round(scale: 18);

/// Percent change between two prices, as a display number.
double pctChange(Decimal from, Decimal to) => (ratio(to, from) - Decimal.one).toDouble() * 100;

// ---- locale-aware decimal rendering (no double) ------------------------------

/// Renders |[v]| with [minDp]..[maxDp] decimals, grouping by 3, `id` = `1.234,5` / `en` = `1,234.5`.
String formatDecimalAbs(Decimal v, String loc, {required int minDp, required int maxDp}) {
  final s = v.abs().round(scale: maxDp).toStringAsFixed(maxDp);
  var (intPart, frac) = s.contains('.') ? (s.split('.')[0], s.split('.')[1]) : (s, '');
  while (frac.length > minDp && frac.endsWith('0')) {
    frac = frac.substring(0, frac.length - 1);
  }
  final group = loc == 'id' ? '.' : ',';
  final dec = loc == 'id' ? ',' : '.';
  final b = StringBuffer();
  for (var i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 == 0) b.write(group);
    b.write(intPart[i]);
  }
  return frac.isEmpty ? b.toString() : '$b$dec$frac';
}

/// Decimals needed for [sig] significant digits of |v| (tiny prices keep zeros).
int decimalsForSignificant(Decimal v, int sig) {
  final a = v.abs();
  if (a == Decimal.zero) return 0;
  if (a >= Decimal.one) {
    final intDigits = a.toBigInt().toString().length;
    return intDigits >= sig ? 0 : sig - intDigits;
  }
  final frac = a.toStringAsFixed(30).split('.')[1];
  final firstNonZero = frac.indexOf(RegExp('[1-9]'));
  return firstNonZero + sig;
}
