// Imported explicitly: inside the Kotlin DSL the `java` extension accessor from the Java base plugin
// shadows the `java.*` package, so `java.util.Properties()` fails to resolve ("Unresolved reference 'util'").
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing lives outside the repo: apps/mobile/android/key.properties (gitignored, see
// android/.gitignore) + the keystore it points at. CI writes both from repository secrets.
// Without key.properties (fresh clone, local dev, PR builds) release falls back to the debug key so
// `flutter run --release` keeps working. Never commit key.properties or the keystore.
val keystorePropertiesFile = rootProject.file("key.properties")
val hasReleaseKeystore = keystorePropertiesFile.isFile
val keystoreProperties = Properties().apply {
    if (hasReleaseKeystore) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

if (hasReleaseKeystore) {
    listOf("storeFile", "storePassword", "keyAlias", "keyPassword").forEach { key ->
        require(!keystoreProperties.getProperty(key).isNullOrBlank()) {
            "key.properties exists but '$key' is missing or empty"
        }
    }
}

android {
    namespace = "com.centuriontrade.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.centuriontrade.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Explicit (MASVS-RESILIENCE): never debuggable; R8 shrinks the Java/Kotlin side.
            // Dart code is obfuscated by `flutter build --obfuscate --split-debug-info` (tool/build_release.sh).
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            // A public build must be signed with the upload key: Play Store rejects debug-signed APKs and
            // a later release-signed build cannot update a debug-signed install (signature mismatch).
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                logger.lifecycle("release signing: key.properties not found, falling back to the DEBUG key (not distributable)")
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
