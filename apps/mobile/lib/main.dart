import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app/app.dart';

/// Prototype entry point: mock backend. A `main_supabase.dart` flavor will
/// `Supabase.initialize(...)` and override the repository providers.
///
/// Startup rule: nothing is awaited before `runApp`; services start after the
/// first frame (`core/startup/deferred_init.dart`).
void main() {
  // Fonts are bundled (assets/google_fonts); never download at runtime: no
  // startup network round-trip, no third-party request (MASVS-NETWORK/PRIVACY).
  GoogleFonts.config.allowRuntimeFetching = false;
  // OFL 1.1: bundled fonts ship with their license (shown on the licenses page).
  LicenseRegistry.addLicense(() async* {
    for (final f in ['Inter-OFL.txt', 'Sora-OFL.txt', 'JetBrainsMono-OFL.txt']) {
      yield LicenseEntryWithLineBreaks(['google_fonts'], await rootBundle.loadString('assets/google_fonts/$f'));
    }
  });
  runApp(const ProviderScope(child: CenturionApp()));
}
