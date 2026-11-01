import 'dart:async';

import 'package:flutter/services.dart';

/// Opens outgoing wallet links and delivers incoming `centurion://auth?...`
/// redirects. Implemented with our own platform channel in `MainActivity.kt`
/// (no url_launcher / app_links package; not approved).
abstract interface class DeepLinkPlatform {
  /// False when no app/browser can open [uri] (e.g. Phantom not installed and no browser).
  Future<bool> openExternal(Uri uri);

  /// Incoming redirects (cold-start link first, then `onNewIntent`).
  Stream<Uri> get links;
}

class MethodChannelDeepLinks implements DeepLinkPlatform {
  MethodChannelDeepLinks({
    MethodChannel method = const MethodChannel('centurion/deeplink'),
    EventChannel events = const EventChannel('centurion/deeplink/events'),
  }) : _method = method,
       _events = events;

  final MethodChannel _method;
  final EventChannel _events;
  Stream<Uri>? _links;

  @override
  Future<bool> openExternal(Uri uri) async {
    if (uri.scheme != 'https') return false; // outgoing links go to phantom.app only
    try {
      return await _method.invokeMethod<bool>('openUrl', uri.toString()) ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  @override
  Stream<Uri> get links => _links ??= _events
      .receiveBroadcastStream()
      .where((e) => e is String && e.length <= 8192)
      .map((e) => Uri.tryParse(e as String))
      .where((u) => u != null)
      .cast<Uri>()
      .asBroadcastStream();
}
