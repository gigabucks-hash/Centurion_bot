package com.centuriontrade.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/**
 * Wallet-login deep links without a third-party plugin (SIWS_LOGIN_REVIEW §12):
 * - `centurion/deeplink` `openUrl`: ACTION_VIEW for https://phantom.app/ul/... only;
 * - `centurion/deeplink/events`: incoming `centurion://auth?...` (cold start + onNewIntent).
 * Nothing is logged (query params carry encrypted wallet payloads).
 */
class MainActivity : FlutterActivity() {
    private var sink: EventChannel.EventSink? = null
    private var pendingLink: String? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        MethodChannel(messenger, "centurion/deeplink").setMethodCallHandler { call, result ->
            when (call.method) {
                "openUrl" -> {
                    val url = call.arguments as? String
                    val uri = url?.let { Uri.parse(it) }
                    if (uri == null || uri.scheme != "https" || uri.host != "phantom.app") {
                        result.success(false)
                    } else {
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
                            result.success(true)
                        } catch (e: ActivityNotFoundException) {
                            result.success(false)
                        }
                    }
                }
                else -> result.notImplemented()
            }
        }
        EventChannel(messenger, "centurion/deeplink/events").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
                sink = events
                pendingLink?.let { events.success(it) }
                pendingLink = null
            }

            override fun onCancel(arguments: Any?) {
                sink = null
            }
        })
        deliver(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deliver(intent)
    }

    private fun deliver(intent: Intent?) {
        val data = intent?.data ?: return
        if (intent.action != Intent.ACTION_VIEW || data.scheme != "centurion" || data.host != "auth") return
        val link = data.toString()
        if (link.length > 8192) return
        val s = sink
        if (s != null) s.success(link) else pendingLink = link
    }
}
