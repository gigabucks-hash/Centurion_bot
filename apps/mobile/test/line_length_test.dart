// T-16: hand-written Dart stays within the formatter page width (120,
// analysis_options.yaml `formatter: page_width`). `dart format` cannot wrap
// comments or long string literals, so this test enforces the same limit.
// Excluded: generated code (lib/l10n/gen, *.g.dart). The vendored design-tokens
// file is checked too: since 0.2.3 upstream emits ≤ 120 columns (build lint).
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

const pageWidth = 120;

bool _excluded(String path) => path.contains('/l10n/gen/') || path.endsWith('.g.dart');

void main() {
  test('no hand-written line exceeds $pageWidth columns', () {
    final offenders = <String>[];
    for (final dir in ['lib', 'test', 'tool']) {
      final d = Directory(dir);
      if (!d.existsSync()) continue;
      for (final f in d.listSync(recursive: true).whereType<File>()) {
        final p = f.path.replaceAll(r'\', '/');
        if (!p.endsWith('.dart') || _excluded(p)) continue;
        final lines = f.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].runes.length > pageWidth) offenders.add('$p:${i + 1} (${lines[i].runes.length})');
        }
      }
    }
    expect(offenders, isEmpty);
  });
}
