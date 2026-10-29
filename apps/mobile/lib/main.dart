import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';

/// Prototype entry point: mock backend. A `main_supabase.dart` flavor will
/// `Supabase.initialize(...)` and override the repository providers.
void main() {
  runApp(const ProviderScope(child: SolBotApp()));
}
