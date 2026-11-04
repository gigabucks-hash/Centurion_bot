import 'package:centurion_mobile/app/app.dart';
import 'package:centurion_mobile/core/startup/deferred_init.dart';
import 'package:centurion_mobile/core/theme/centurion_theme.dart';
import 'package:centurion_mobile/data/mock/mock_backend.dart';
import 'package:centurion_mobile/data/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// G1-blue menu icons: Lucide (ISC, free for commercial use) on the bottom navigation and every
/// settings row. The font family check is the gate: a stray Material glyph in a menu surface
/// fails here instead of only being visible on a device.
Widget _app(MockBackend b, String location) => ProviderScope(
  overrides: [mockBackendProvider.overrideWithValue(b), deferredInitProvider.overrideWithValue(DeferredInit(const []))],
  child: CenturionApp(initialLocation: location),
);

Future<void> _phone(WidgetTester tester) async {
  tester.view.physicalSize = const Size(412 * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

Iterable<Icon> _iconsIn(WidgetTester tester, Finder scope) =>
    tester.widgetList<Icon>(find.descendant(of: scope, matching: find.byType(Icon)));

void main() {
  testWidgets('bottom navigation uses the Lucide menu set', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/'));
    await tester.pump();

    final nav = find.byType(NavigationBar);
    final icons = _iconsIn(tester, nav).toList();
    expect(icons.length, greaterThanOrEqualTo(5));
    for (final icon in icons) {
      expect(icon.icon, isNotNull);
      expect(icon.icon!.fontFamily, 'lucide', reason: 'menu icons come from one set, not Material');
    }
    // Icons did not break routing: tapping the Bots tab opens the Bots screen.
    await tester.tap(find.descendant(of: nav, matching: find.text('Bots')));
    await tester.pumpAndSettle();
    expect(find.text('Bots'), findsWidgets);
    b.dispose();
  });

  testWidgets('settings rows use the Lucide menu set', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/more'));
    await tester.pump();

    final rows = find.byType(ListTile);
    final icons = _iconsIn(tester, find.byType(ListView)).toList();
    expect(rows, findsWidgets);
    expect(icons.length, greaterThanOrEqualTo(8));
    for (final icon in icons) {
      expect(icon.icon!.fontFamily, 'lucide');
    }
    b.dispose();
  });

  // The G1-blue scheme maps secondaryContainer to guard orange, so Material's default selected
  // NavigationBar ink (onSecondaryContainer) rendered the active tab orange inside a blue pill.
  // This locks the selected ink to the pill's own on-color.
  for (final (name, theme) in [('light', CenturionTheme.light()), ('dark', CenturionTheme.dark())]) {
    test('$name: selected nav ink stays on the primaryContainer pill', () {
      final nav = theme.navigationBarTheme;
      const selected = {WidgetState.selected};
      expect(nav.indicatorColor, theme.colorScheme.primaryContainer);
      expect(nav.iconTheme!.resolve(selected)!.color, theme.colorScheme.onPrimaryContainer);
      expect(nav.iconTheme!.resolve(const {})!.color, theme.colorScheme.onSurfaceVariant);
      final label = nav.labelTextStyle!.resolve(selected)!;
      expect(label.color, theme.colorScheme.onSurface);
      expect(label.fontWeight, FontWeight.w600);
    });
  }
}
