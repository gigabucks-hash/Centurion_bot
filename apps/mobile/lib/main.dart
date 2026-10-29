import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';

/// Prototype entry point: mock backend. A `main_supabase.dart` flavor will
/// `Supabase.initialize(...)` and override the repository providers.
void main() {
  // OFL 1.1: bundled fonts ship with their license (shown on the licenses page).
  LicenseRegistry.addLicense(() async* {
    for (final f in ['Inter-OFL.txt', 'JetBrainsMono-OFL.txt']) {
      yield LicenseEntryWithLineBreaks(['google_fonts'], await rootBundle.loadString('assets/google_fonts/$f'));
    }
  });
  runApp(const ProviderScope(child: SentraApp()));
}
