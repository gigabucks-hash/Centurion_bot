import 'package:flutter_lucide/flutter_lucide.dart';

/// One place for the G1-blue menu icon set.
///
/// Set: **Lucide** (lucide.dev), free and open source under the ISC licence (package wrapper
/// `flutter_lucide`, MIT). One 24 px / 1.5 px-stroke outline family for the bottom navigation,
/// settings rows, guard/approval entry points and status markers, so the whole menu reads as
/// one system and matches the flat 1 px-border reference. Material Icons stay only where they
/// are content illustrations (e.g. the fingerprint on the login screen).
///
/// Roles, not package names: swapping the set later only edits this file.
abstract final class AppIcons {
  // Bottom navigation.
  static const navHome = LucideIcons.house;
  static const navBots = LucideIcons.bot;
  static const navActivity = LucideIcons.activity;
  static const navRisk = LucideIcons.shield;
  static const navRiskActive = LucideIcons.shield_check;
  static const navSettings = LucideIcons.settings;

  // Entry points / actions.
  static const approvals = LucideIcons.bell;
  static const notifications = LucideIcons.bell_ring;
  static const positions = LucideIcons.wallet;
  static const guard = LucideIcons.shield_check;
  static const guardPending = LucideIcons.shield_alert;
  static const warning = LucideIcons.triangle_alert;
  static const locked = LucideIcons.lock;
  static const keyOff = LucideIcons.key_round;
  static const signOut = LucideIcons.log_out;
  static const reset = LucideIcons.rotate_ccw;
  static const info = LucideIcons.info;
  static const switches = LucideIcons.sliders_horizontal;
  static const fills = LucideIcons.receipt;
  static const backend = LucideIcons.server;
  static const language = LucideIcons.languages;
  static const theme = LucideIcons.sun_moon;
  static const search = LucideIcons.search;
  static const searchOff = LucideIcons.search_x;
  static const empty = LucideIcons.inbox;
  static const back = LucideIcons.arrow_left;
  static const close = LucideIcons.x;
  static const chevronRight = LucideIcons.chevron_right;
  static const chevronDown = LucideIcons.chevron_down;
  static const refresh = LucideIcons.refresh_cw;
  static const filter = LucideIcons.list_filter;

  // Bot state.
  static const play = LucideIcons.play;
  static const pause = LucideIcons.pause;
  static const stop = LucideIcons.circle_stop;
  static const paused = LucideIcons.circle_pause;
  static const resumed = LucideIcons.circle_play;
  static const blocked = LucideIcons.ban;
  static const critical = LucideIcons.octagon_alert;
  static const error = LucideIcons.circle_alert;
  static const closed = LucideIcons.flag;
  static const feed = LucideIcons.activity;

  // Approvals / activity.
  static const pending = LucideIcons.hourglass;
  static const clock = LucideIcons.clock;
  static const expired = LucideIcons.hourglass;
  static const approved = LucideIcons.check_check;
  static const approve = LucideIcons.circle_check;
  static const reject = LucideIcons.circle_x;
  static const found = LucideIcons.radar;
  static const armed = LucideIcons.target;
  static const bought = LucideIcons.arrow_down_left;
  static const sold = LucideIcons.arrow_up_right;
  static const proposal = LucideIcons.vote;
  static const skipped = LucideIcons.rotate_ccw;
}
