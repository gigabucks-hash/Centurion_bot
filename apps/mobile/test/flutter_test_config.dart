import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

/// Tests never hit the network: runtime fetching is off, so google_fonts must
/// resolve Inter / JetBrains Mono from the bundled assets/google_fonts/*.ttf
/// (see test/fonts_bundled_test.dart).
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;
  await testMain();
}
