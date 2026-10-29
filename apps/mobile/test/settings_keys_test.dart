import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_mobile/data/api/settings_keys.dart';

/// Steering: settings field names / exit-preset ids live in ONE file.
void main() {
  test('no settings key or exit preset id is hardcoded outside settings_keys.dart', () {
    final names = <String>{
      for (final k in [...SettingsKeys.all, ...ExitPresets.all]) ...[k.current, k.v10],
    };
    final offenders = <String>[];
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart') || f.path.endsWith('settings_keys.dart') || f.path.contains('/l10n/gen/')) continue;
      final src = f.readAsStringSync();
      for (final n in names) {
        if (src.contains("'$n'") || src.contains('"$n"')) offenders.add('${f.path}: $n');
      }
    }
    expect(offenders, isEmpty);
  });
}
