import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_mobile/core/app_identity.dart';
import 'package:sentra_mobile/l10n/gen/app_localizations_en.dart';
import 'package:sentra_mobile/l10n/gen/app_localizations_id.dart';

/// Rebrand "Centurion Trade" (Boss, 29 Okt 2026): ARB app.name, platform ids, scheme.
void main() {
  test('app.name in both locales', () {
    expect(AppLocalizationsEn().appName, AppIdentity.displayName);
    expect(AppLocalizationsId().appName, AppIdentity.displayName);
  });

  test('Android label/applicationId/namespace and iOS bundle id + names', () {
    final gradle = File('android/app/build.gradle.kts').readAsStringSync();
    expect(gradle, contains('applicationId = "${AppIdentity.bundleId}"'));
    expect(gradle, contains('namespace = "${AppIdentity.bundleId}"'));
    expect(
      File('android/app/src/main/AndroidManifest.xml').readAsStringSync(),
      contains('android:label="Centurion Trade"'),
    );
    expect(
      File('android/app/src/main/kotlin/com/centuriontrade/app/MainActivity.kt').readAsStringSync(),
      startsWith('package ${AppIdentity.bundleId}'),
    );
    final pbx = File('ios/Runner.xcodeproj/project.pbxproj').readAsStringSync();
    expect(pbx, isNot(contains('com.sentra.app')));
    expect(pbx, contains('PRODUCT_BUNDLE_IDENTIFIER = ${AppIdentity.bundleId};'));
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    expect(RegExp('<string>Centurion Trade</string>').allMatches(plist), hasLength(2));
  });

  test('deep link scheme centurion://', () {
    expect(AppIdentity.authRedirect, 'centurion://auth');
  });
}
