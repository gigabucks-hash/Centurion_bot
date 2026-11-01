/// Login copy that @sentra/i18n (0.4.7) does not have yet. The vendored ARB is a
/// byte-identical copy (tool/ci_check_vendored.sh), so these live here until UX
/// adds the keys; then switch to `AppLocalizations` and delete this file.
/// Requested ARB keys (report to UX): loginButtonPhantom, loginPhantomWaiting,
/// loginPhantomNotInstalled, loginPhantomExpired, loginPhantomBadResponse.
library;

class LoginStrings {
  const LoginStrings._(this._id);
  factory LoginStrings.of(String languageCode) => LoginStrings._(languageCode == 'id');
  final bool _id;

  String get buttonPhantom => _id ? 'Masuk dengan Phantom' : 'Sign in with Phantom';
  String get phantomWaiting => _id ? 'Menunggu Phantom…' : 'Waiting for Phantom…';
  String get phantomNotInstalled => _id
      ? 'Phantom belum terpasang. Pasang Phantom lalu coba lagi.'
      : 'Phantom isn’t installed. Install it and try again.';
  String get phantomExpired => _id ? 'Waktu login habis. Coba lagi.' : 'Login timed out. Try again.';
  String get phantomBadResponse =>
      _id ? 'Balasan wallet tidak valid. Tidak ada yang dikirim.' : 'The wallet reply was invalid. Nothing was sent.';
}
