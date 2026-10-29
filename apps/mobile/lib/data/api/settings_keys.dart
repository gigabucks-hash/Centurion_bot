/// SINGLE source of wire identifiers that contract v1.1 renamed: strategy
/// settings keys, exit-preset ids, required checks, venues, exit reasons and
/// metrics. Nothing else in lib/ may hardcode them.
///
/// Filled from the rename table in `packages/contracts/CHANGELOG.md` 1.1.0
/// (v1.0 name -> v1.1 name), as corrected in 1.1.2 (`stopLossPct` →
/// `stop_loss_pct`, separate from `peak_trail_pct`). `current` is what we send; `v10` is accepted
/// when reading (legacy fixtures) and normalized to `current`.
/// TODO(v1.1): drop the `v10` aliases once Backend confirms no v1.0 payload
/// exists anywhere (CHANGELOG: "No producer had shipped v1.0 payloads"), and
/// re-check against `config/strategy_settings.schema.json` when published.
/// Removed in v1.1: `askFirst` (use `approval_mode`).
library;

/// (current wire name, v1.0 alias)
typedef KeyPair = ({String current, String v10});

String _normalize(List<KeyPair> all, String key) {
  for (final k in all) {
    if (key == k.current || key == k.v10) return k.current;
  }
  return key;
}

/// Strategy settings keys.
abstract final class SettingsKeys {
  static const bankrollLamports = (current: 'bankroll_lamports', v10: 'budgetLamports');
  static const ticketLamports = (current: 'ticket_lamports', v10: 'tradeLamports');
  static const maxConcurrentPositions = (current: 'max_concurrent_positions', v10: 'maxOpen');
  static const maxPoolImpactPct = (current: 'max_pool_impact_pct', v10: 'maxPoolSharePct');
  static const approvalMode = (current: 'approval_mode', v10: 'approvalMode');
  static const deterministicOnly = (current: 'deterministic_only', v10: 'codeOnly');
  static const realDrawdownHaltPct = (current: 'real_drawdown_halt_pct', v10: 'lossStopPct');
  static const practiceDrawdownHaltPct = (current: 'practice_drawdown_halt_pct', v10: 'practiceStopPct');
  static const avoidPracticeOverlap = (current: 'avoid_practice_overlap', v10: 'skipTwinCoins');
  static const venues = (current: 'venues', v10: 'streams');
  static const ageMinutesMin = (current: 'age_minutes_min', v10: 'minAgeMinutes');
  static const ageMinutesMax = (current: 'age_minutes_max', v10: 'maxAgeMinutes');
  static const sinceMigrationSecondsMin = (current: 'since_migration_seconds_min', v10: 'minGraduatedSeconds');
  static const mcapUsdMin = (current: 'mcap_usd_min', v10: 'minMarketCapUsd');
  static const mcapUsdMax = (current: 'mcap_usd_max', v10: 'maxMarketCapUsd');
  static const liquidityUsdMin = (current: 'liquidity_usd_min', v10: 'minLiquidityUsd');
  static const volume24hUsdMin = (current: 'volume_24h_usd_min', v10: 'minVolume24hUsd');
  static const holderCountMin = (current: 'holder_count_min', v10: 'minHolders');
  static const uniqueBuyers1hMin = (current: 'unique_buyers_1h_min', v10: 'minBuyers1h');
  static const buyToSellRatioMin = (current: 'buy_to_sell_ratio_min', v10: 'minBuySellRatio');
  static const topHoldersSharePctMax = (current: 'top_holders_share_pct_max', v10: 'maxTop10Percent');
  static const lpBurnedPctMin = (current: 'lp_burned_pct_min', v10: 'minLpBurnPct');
  static const volumeToMcap1hMin = (current: 'volume_to_mcap_1h_min', v10: 'minTurnover1h');
  static const volumeToMcap1hMax = (current: 'volume_to_mcap_1h_max', v10: 'maxTurnover1h');
  static const change1hPctMin = (current: 'change_1h_pct_min', v10: 'minMove1hPct');
  static const change1hPctMax = (current: 'change_1h_pct_max', v10: 'maxMove1hPct');
  static const change1hPctPreferredLow = (current: 'change_1h_pct_preferred_low', v10: 'sweetMove1hLowPct');
  static const change1hPctPreferredHigh = (current: 'change_1h_pct_preferred_high', v10: 'sweetMove1hHighPct');
  static const offHighPctMax = (current: 'off_high_pct_max', v10: 'maxDrawdownPct');
  static const oneMinuteDumpPctMax = (current: 'one_minute_dump_pct_max', v10: 'hourCrashLimit');
  static const requiredChecks = (current: 'required_checks', v10: 'mustHave');
  static const scoreThreshold = (current: 'score_threshold', v10: 'passMark');
  static const revisitAfterMovePct = (current: 'revisit_after_move_pct', v10: 'recheckMovePct');
  static const screenRules = (current: 'screen_rules', v10: 'rules');
  static const guardChecks = (current: 'guard_checks', v10: 'shield');
  static const creatorSharePctMax = (current: 'creator_share_pct_max', v10: 'maxDevPercent');
  static const bundledSharePctMax = (current: 'bundled_share_pct_max', v10: 'maxBundlersPercent');
  static const sniperSharePctMax = (current: 'sniper_share_pct_max', v10: 'maxSnipersPercent');
  static const entryDiscountPct = (current: 'entry_discount_pct', v10: 'dipPct');
  static const observeBeforeEntryMinutes = (current: 'observe_before_entry_minutes', v10: 'entryDelayMinutes');
  static const skipIfRisenPct = (current: 'skip_if_risen_pct', v10: 'entryMaxUpPct');
  static const rangeBreakEntry = (current: 'range_break_entry', v10: 'breakout');
  static const livenessGate = (current: 'liveness_gate', v10: 'activeTrading');
  static const reentry = (current: 'reentry', v10: 'rebuy');
  static const entryWeekdaysUtc = (current: 'entry_weekdays_utc', v10: 'tradingDays');
  static const entryHoursUtc = (current: 'entry_hours_utc', v10: 'tradingHours');
  static const exitPreset = (current: 'exit_preset', v10: 'exitPlan');
  static const exitRules = (current: 'exit_rules', v10: 'exits');
  static const profitTargets = (current: 'profit_targets', v10: 'takeProfits');
  static const lossGuards = (current: 'loss_guards', v10: 'stopLosses');
  static const atGainPct = (current: 'at_gain_pct', v10: 'gainPct');
  static const sellPortionPct = (current: 'sell_portion_pct', v10: 'sellPct');
  static const givebackPct = (current: 'giveback_pct', v10: 'pullbackPct');

  /// Hard stop from ENTRY (0 = off, else 5–49). 1.1.2 corrected the 1.1.0 table,
  /// which wrongly mapped v1.0 `stopLossPct` → `peak_trail_pct`.
  static const stopLossPct = (current: 'stop_loss_pct', v10: 'stopLossPct');

  /// Trailing stop from the PEAK (0 = off, else 5–49). New in v1.1: no v1.0 alias.
  static const peakTrailPct = (current: 'peak_trail_pct', v10: 'peak_trail_pct');
  static const idleExitSeconds = (current: 'idle_exit_seconds', v10: 'noTradeSeconds');
  static const sellPressureExit = (current: 'sell_pressure_exit', v10: 'drain');
  static const sellFloors = (current: 'sell_floors', v10: 'sellFloors');
  static const maxLossPct = (current: 'max_loss_pct', v10: 'maxLossPct');
  static const liquidityDropPct = (current: 'liquidity_drop_pct', v10: 'liquidityDropPct');

  static const all = <KeyPair>[
    bankrollLamports,
    ticketLamports,
    maxConcurrentPositions,
    maxPoolImpactPct,
    approvalMode,
    deterministicOnly,
    realDrawdownHaltPct,
    practiceDrawdownHaltPct,
    avoidPracticeOverlap,
    venues,
    ageMinutesMin,
    ageMinutesMax,
    sinceMigrationSecondsMin,
    mcapUsdMin,
    mcapUsdMax,
    liquidityUsdMin,
    volume24hUsdMin,
    holderCountMin,
    uniqueBuyers1hMin,
    buyToSellRatioMin,
    topHoldersSharePctMax,
    lpBurnedPctMin,
    volumeToMcap1hMin,
    volumeToMcap1hMax,
    change1hPctMin,
    change1hPctMax,
    change1hPctPreferredLow,
    change1hPctPreferredHigh,
    offHighPctMax,
    oneMinuteDumpPctMax,
    requiredChecks,
    scoreThreshold,
    revisitAfterMovePct,
    screenRules,
    guardChecks,
    creatorSharePctMax,
    bundledSharePctMax,
    sniperSharePctMax,
    entryDiscountPct,
    observeBeforeEntryMinutes,
    skipIfRisenPct,
    rangeBreakEntry,
    livenessGate,
    reentry,
    entryWeekdaysUtc,
    entryHoursUtc,
    exitPreset,
    exitRules,
    profitTargets,
    lossGuards,
    atGainPct,
    sellPortionPct,
    givebackPct,
    stopLossPct,
    peakTrailPct,
    idleExitSeconds,
    sellPressureExit,
    sellFloors,
    maxLossPct,
    liquidityDropPct,
  ];

  static String normalize(String key) => _normalize(all, key);

  /// Settings removed in v1.1 (ignored when reading).
  static const removedV10 = <String>['askFirst'];

  /// Display label for a settings key (guard-change diff rows). UI copy, not wire.
  static String label(String key) => switch (normalize(key)) {
    'bundled_share_pct_max' => 'Bundled share max %',
    'holder_count_min' => 'Holders min',
    'top_holders_share_pct_max' => 'Top holders share max %',
    'creator_share_pct_max' => 'Creator share max %',
    final other => other,
  };
}

/// Exit-preset ids (wire `exit_preset`).
abstract final class ExitPresets {
  static const momentumTrail = (current: 'momentum_trail', v10: 'clip');
  static const principalRecovery = (current: 'principal_recovery', v10: 'stake');
  static const doubleOut = (current: 'double_out', v10: 'flip');
  static const threeStepLadder = (current: 'three_step_ladder', v10: 'ladder');
  static const peakGiveback = (current: 'peak_giveback', v10: 'trailingTp');
  static const trailStopOnly = (current: 'trail_stop_only', v10: 'trail');
  static const incrementalTrim = (current: 'incremental_trim', v10: 'scaleOut');
  static const fastHalf = (current: 'fast_half', v10: 'scalp');
  static const fixedThirty = (current: 'fixed_thirty', v10: 'take30');
  static const newHighTimeout = (current: 'new_high_timeout', v10: 'stall');
  static const ratchet = (current: 'ratchet', v10: 'stepLock');
  static const tighteningTrail = (current: 'tightening_trail', v10: 'tighten');
  static const geometricLadder = (current: 'geometric_ladder', v10: 'doubling');

  static const all = <KeyPair>[
    momentumTrail,
    principalRecovery,
    doubleOut,
    threeStepLadder,
    peakGiveback,
    trailStopOnly,
    incrementalTrim,
    fastHalf,
    fixedThirty,
    newHighTimeout,
    ratchet,
    tighteningTrail,
    geometricLadder,
  ];

  static String normalize(String key) => _normalize(all, key);

  /// Short display label (UI copy; not a wire value).
  static String label(String id) => switch (normalize(id)) {
    'three_step_ladder' => 'ladder 3 langkah',
    'fast_half' => 'jual cepat ½',
    'ratchet' => 'ratchet',
    final other => other,
  };
}

/// Required screener checks (`required_checks`).
abstract final class RequiredChecks {
  static const liquidityUsd = (current: 'liquidity_usd', v10: 'liquidity');
  static const volume24hUsd = (current: 'volume_24h_usd', v10: 'volume');
  static const mcapUsd = (current: 'mcap_usd', v10: 'marketCap');
  static const ageMinutesMin = (current: 'age_minutes_min', v10: 'age');
  static const ageMinutesMax = (current: 'age_minutes_max', v10: 'maxAge');
  static const topHoldersSharePct = (current: 'top_holders_share_pct', v10: 'top10');
  static const lpBurnedPct = (current: 'lp_burned_pct', v10: 'lpBurn');

  static const all = <KeyPair>[
    liquidityUsd,
    volume24hUsd,
    mcapUsd,
    ageMinutesMin,
    ageMinutesMax,
    topHoldersSharePct,
    lpBurnedPct,
  ];

  static String normalize(String key) => _normalize(all, key);
}

/// Coin venues (`venues`, coin `venue`).
abstract final class Venues {
  static const curve = (current: 'curve', v10: 'bonding');
  static const amm = (current: 'amm', v10: 'graduated');

  static const all = <KeyPair>[curve, amm];

  static String normalize(String key) => _normalize(all, key);
}

/// Position exit reasons (`ExitReason`).
abstract final class ExitReasons {
  static const profitTarget = (current: 'profit_target', v10: 'take_profit');
  static const lossGuard = (current: 'loss_guard', v10: 'stop_loss');
  static const peakTrail = (current: 'peak_trail', v10: 'trailing_stop');
  static const maxHold = (current: 'max_hold', v10: 'time_out');
  static const idle = (current: 'idle', v10: 'inactivity');
  static const sellPressure = (current: 'sell_pressure', v10: 'drain');
  static const noNewHigh = (current: 'no_new_high', v10: 'stall');
  static const rugDetected = (current: 'rug_detected', v10: 'rug');
  static const drawdownHalt = (current: 'drawdown_halt', v10: 'loss_stop');

  static const all = <KeyPair>[
    profitTarget,
    lossGuard,
    peakTrail,
    maxHold,
    idle,
    sellPressure,
    noNewHigh,
    rugDetected,
    drawdownHalt,
  ];

  static String normalize(String key) => _normalize(all, key);
}

/// Coin metric keys.
abstract final class Metrics {
  static const liquidityUsd = (current: 'liquidity_usd', v10: 'liquidityUsd');
  static const mcapUsd = (current: 'mcap_usd', v10: 'marketCapUsd');
  static const volume1hUsd = (current: 'volume_1h_usd', v10: 'volume1hUsd');
  static const volume24hUsd = (current: 'volume_24h_usd', v10: 'volume24hUsd');
  static const holderCount = (current: 'holder_count', v10: 'holders');
  static const uniqueBuyers1h = (current: 'unique_buyers_1h', v10: 'buyers1h');
  static const buyToSellRatio = (current: 'buy_to_sell_ratio', v10: 'buySellRatio');
  static const volumeToMcap1h = (current: 'volume_to_mcap_1h', v10: 'turnover1h');
  static const topHoldersSharePct = (current: 'top_holders_share_pct', v10: 'top10Pct');
  static const lpBurnedPct = (current: 'lp_burned_pct', v10: 'lpBurnPct');
  static const change1hPct = (current: 'change_1h_pct', v10: 'move1hPct');
  static const offHighPct = (current: 'off_high_pct', v10: 'drawdownPct');
  static const creatorSharePct = (current: 'creator_share_pct', v10: 'devPct');
  static const bundledSharePct = (current: 'bundled_share_pct', v10: 'bundlersPct');
  static const sniperSharePct = (current: 'sniper_share_pct', v10: 'snipersPct');
  static const ageMinutes = (current: 'age_minutes', v10: 'ageMinutes');
  static const sinceMigrationSeconds = (current: 'since_migration_seconds', v10: 'graduatedSeconds');
  static const curveProgressPct = (current: 'curve_progress_pct', v10: 'curveProgressPct');

  static const all = <KeyPair>[
    liquidityUsd,
    mcapUsd,
    volume1hUsd,
    volume24hUsd,
    holderCount,
    uniqueBuyers1h,
    buyToSellRatio,
    volumeToMcap1h,
    topHoldersSharePct,
    lpBurnedPct,
    change1hPct,
    offHighPct,
    creatorSharePct,
    bundledSharePct,
    sniperSharePct,
    ageMinutes,
    sinceMigrationSeconds,
    curveProgressPct,
  ];

  static String normalize(String key) => _normalize(all, key);
}

/// Screener ruleset keys.
abstract final class RulesetKeys {
  static const scoreThreshold = (current: 'score_threshold', v10: 'passMark');
  static const onMissing = (current: 'on_missing', v10: 'onMissing');
  static const zeroAt = (current: 'zero_at', v10: 'zeroAt');
  static const venues = (current: 'venues', v10: 'streams');

  static const all = <KeyPair>[scoreThreshold, onMissing, zeroAt, venues];

  static String normalize(String key) => _normalize(all, key);
}

/// Guard check names (EVENTS_SCHEMA §4), wire values as of v1.1.
abstract final class GuardCheckNames {
  static const all = <String>[
    'mint_authority', 'freeze_authority', 'lp_safety', 'top_holders_share', 'single_holder', //
    'creator_share', 'bundled_share', 'sniper_share', 'transfer_fee', 'honeypot', 'serial_creator',
  ];
}
