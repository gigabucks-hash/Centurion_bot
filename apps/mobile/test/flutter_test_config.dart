import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

/// Tests never hit the network. With runtime fetching off and no bundled
/// .ttf yet (bundling = milestone D8–9), google_fonts logs one "unable to
/// load font" message per family/weight and the default test font is used.
/// The log lines are expected and harmless; they disappear once fonts are
/// bundled under assets/google_fonts/.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;
  await testMain();
}
