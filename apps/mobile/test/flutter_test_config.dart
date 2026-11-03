import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

/// Tests never hit the network: runtime fetching is off, so google_fonts must
/// resolve Inter / JetBrains Mono from the bundled assets/google_fonts/*.ttf
/// (see test/fonts_bundled_test.dart).
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;
  // pubspec `fonts:` are not loaded by flutter_test: register the identicon's bundled Inter Bold explicitly.
  final bold = File('assets/fonts/Inter-Bold.ttf').readAsBytesSync();
  await (FontLoader('InterIdenticon')..addFont(Future.value(ByteData.sublistView(bold)))).load();
  await testMain();
}
