// T-17: Inter + JetBrains Mono load from LOCAL assets with google_fonts runtime
// fetching OFF. Files: Google Fonts download (fonts.google.com, 29 Okt 2026):
//   static/Inter_18pt-{Regular,Medium,SemiBold}.ttf → renamed Inter-{Regular,Medium,SemiBold}.ttf
//   static/JetBrainsMono-{Medium,SemiBold}.ttf     → names kept as-is
// License: SIL OFL 1.1 (no Reserved Font Name), texts in assets/google_fonts/*-OFL.txt.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:sentra_mobile/core/theme/sentra_theme.dart';

const bundled = [
  'Inter-Regular.ttf',
  'Inter-Medium.ttf',
  'Inter-SemiBold.ttf',
  'JetBrainsMono-Medium.ttf',
  'JetBrainsMono-SemiBold.ttf',
];

void main() {
  test('runtime fetching is OFF in tests', () {
    expect(GoogleFonts.config.allowRuntimeFetching, isFalse);
  });

  test('all 5 static fonts + both OFL texts are bundled assets', () async {
    final assets = (await AssetManifest.loadFromAssetBundle(rootBundle)).listAssets();
    for (final f in [...bundled, 'Inter-OFL.txt', 'JetBrainsMono-OFL.txt']) {
      expect(assets, contains('assets/google_fonts/$f'));
    }
    // google_fonts 9 matches by suffix "<Family>-<Weight>": Google's raw names would not match.
    expect('Inter_18pt-Regular'.endsWith('Inter-Regular'), isFalse);
    for (final f in ['Inter-OFL.txt', 'JetBrainsMono-OFL.txt']) {
      expect(await rootBundle.loadString('assets/google_fonts/$f'), contains('SIL Open Font License, Version 1.1'));
    }
  });

  test('each bundled weight loads with fetching off (Inter 400/500/600, JetBrains Mono 500/600)', () async {
    for (final w in [FontWeight.w400, FontWeight.w500, FontWeight.w600]) {
      GoogleFonts.inter(fontWeight: w);
    }
    for (final w in [FontWeight.w500, FontWeight.w600]) {
      GoogleFonts.jetBrainsMono(fontWeight: w);
    }
    await GoogleFonts.pendingFonts().timeout(const Duration(seconds: 10));
  });

  testWidgets('theme text (Inter 400/500/600) and AppText.num (JetBrains Mono 500/600) load from assets', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: SentraTheme.dark(),
        home: Builder(
          builder: (context) {
            final tt = Theme.of(context).textTheme;
            return Column(
              children: [
                Text('body', style: tt.bodyMedium),
                Text('title', style: tt.titleMedium),
                Text('label', style: tt.labelLarge),
                Text('0,24', style: AppText.num(14)),
                Text('0,24', style: AppText.num(14, weight: FontWeight.w600)),
                Text('x', style: GoogleFonts.inter(fontWeight: FontWeight.w400)),
                Text('x', style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
                Text('x', style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
              ],
            );
          },
        ),
      ),
    );
    // Fetching is off, so the only source is assets; a failed load must fail the test, not hang it.
    Object? err;
    await tester.runAsync(() async {
      try {
        await GoogleFonts.pendingFonts().timeout(const Duration(seconds: 10));
      } catch (e) {
        err = e;
      }
    });
    expect(err, isNull);
    expect(tester.takeException(), isNull);
    final num = tester.widget<Text>(find.text('0,24').first).style!;
    expect(num.fontFamily, startsWith('JetBrainsMono'));
    expect(tester.widget<Text>(find.text('body')).style!.fontFamily, startsWith('Inter'));
  });

  test('negative control: a weight that is NOT bundled fails with fetching off', () async {
    GoogleFonts.inter(fontWeight: FontWeight.w800);
    await expectLater(GoogleFonts.pendingFonts(), throwsA(anything));
  });
}
