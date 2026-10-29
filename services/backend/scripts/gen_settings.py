#!/usr/bin/env python3
"""Single source for strategy settings v1.1 (snake_case wire keys).

Generates:
  config/strategy_settings.schema.json
  supabase/migrations/0009_contracts_v1_1_4.sql  (strategy_settings_valid(), between the GENERATED markers;
  0001_init.sql keeps the 1.1.0 body, superseded by create-or-replace)
Run from services/backend:  python3 scripts/gen_settings.py
Number rule: percentages, ratios, counts, USD notionals = JSON numbers; SOL amounts = lamport strings.
"""
import json, pathlib, re

LAMPORTS = "^[1-9][0-9]{0,17}$"
# (key, type, lo, hi, description)
NUM = [
    ("max_concurrent_positions", "integer", 1, 20, "Positions open at the same time"),
    ("max_pool_impact_pct", "number", 0, 100, "Largest share of a pool one entry may take, %"),
    ("real_drawdown_halt_pct", "number", 0, 100, "Real mode: stop new entries after this % drop from peak equity (default 50)"),
    ("practice_drawdown_halt_pct", "number", 0, 100, "Practice: stop new entries after this % drop from peak equity; 0 = off"),
    ("age_minutes_min", "number", 0, 525600, "Coin age lower bound, minutes"),
    ("age_minutes_max", "number", 0, 525600, "Coin age upper bound, minutes"),
    ("since_migration_seconds_min", "number", 0, 86400, "Seconds since leaving the launch curve; 0 = off"),
    ("mcap_usd_min", "number", 0, 1e12, "Market cap lower bound, USD"),
    ("mcap_usd_max", "number", 0, 1e12, "Market cap upper bound, USD"),
    ("liquidity_usd_min", "number", 0, 1e12, "Pool liquidity lower bound, USD"),
    ("volume_24h_usd_min", "number", 0, 1e12, "24 h volume lower bound, USD"),
    ("holder_count_min", "number", 0, 1e7, "Holder count lower bound"),
    ("unique_buyers_1h_min", "number", 0, 1e6, "Distinct buyer wallets in the last hour"),
    ("buy_to_sell_ratio_min", "number", 0, 1000, "Buys per sell (ratio)"),
    ("top_holders_share_pct_max", "number", 0, 100, "Share of supply held by the 10 largest holders, %"),
    ("lp_burned_pct_min", "number", 0, 100, "Burned share of the main pool's LP, %"),
    ("volume_to_mcap_1h_min", "number", 0, 1000, "1 h volume / market cap (ratio)"),
    ("volume_to_mcap_1h_max", "number", 0, 1000, "1 h volume / market cap (ratio)"),
    ("change_1h_pct_min", "number", -100, 100000, "1 h price change lower bound, %"),
    ("change_1h_pct_max", "number", -100, 100000, "1 h price change upper bound, %"),
    ("change_1h_pct_preferred_low", "number", -100, 100000, "Preferred 1 h change band, low end, %"),
    ("change_1h_pct_preferred_high", "number", -100, 100000, "Preferred 1 h change band, high end, %"),
    ("off_high_pct_max", "number", 0, 100, "Largest allowed drop from the all-time high, %"),
    ("one_minute_dump_pct_max", "number", 0, 99, "Skip coins with a 1-minute fall of this % in the last hour; 0 = off"),
    ("score_threshold", "number", 50, 125, "Weighted screen points needed to pass"),
    ("revisit_after_move_pct", "number|null", 0, 10000, "Re-screen a rejected coin after this % move; null = default, 0 = never"),
    ("creator_share_pct_max", "number", 0, 100, "Creator wallet share of supply before the guard weighs it, %; 0 = off"),
    ("bundled_share_pct_max", "number", 0, 100, "Same-slot bundled share of supply, %; 0 = off"),
    ("sniper_share_pct_max", "number", 0, 100, "Early sniper share of supply, %; 0 = off"),
    ("entry_discount_pct", "number", 0, 50, "Wait for this % below the pick price before entering; 0 = immediately"),
    ("observe_before_entry_minutes", "number", 0, 60, "Watch a pick this long before entering; 0 = off"),
    ("skip_if_risen_pct", "number", 0, 10000, "Skip the entry if price rose this % since the pick; 0 = off"),
    ("stop_loss_pct", "number", 0, 49, "Hard stop: sell everything after this % loss from the ENTRY price; 0 = off, else 5–49 (v1.0 stopLossPct)"),
    ("peak_trail_pct", "number", 0, 49, "Trailing stop: sell after this % drop from the position's PEAK; 0 = off, else 5–49"),
    ("idle_exit_seconds", "number|null", 5, 3600, "Exit after this many seconds without a trade; null = off"),
    ("time_stop_s", "integer|null", 1, 604800, "Sell the whole position once it has been held this many seconds (exit_reason max_hold); null = off"),
]
BOOL = [
    ("deterministic_only", "No AI review step; rules decide alone"),
    ("avoid_practice_overlap", "Real copy: skip coins its practice twin holds or traded"),
]
OBJ = {  # key -> (description, nested properties for the JSON Schema)
    "screen_rules": ("Screener rule set (config/screener.example.json format)", None),
    "guard_checks": ("Per-check guard overrides (GuardConfig field names)", None),
    "range_break_entry": ("Enter on the break of a quiet range", {
        "window_minutes": ("number", 2, 60), "max_range_pct": ("number", 2, 100), "min_recent_buyers": ("number", 0, 20)}),
    "liveness_gate": ("Enter only while the coin is actively trading", {
        "max_since_last_swap_seconds": ("number", 1, 60), "min_active_5s_slots": ("number", 0, 12),
        "min_recent_buyers": ("number", 0, 3)}),
    "reentry": ("Re-enter a coin after an exit", {
        "trigger": ("enum", ["retrace", "new_high", "any"]), "settle_bars": ("number", 1, 10),
        "watch_minutes": ("number", 1, 1440), "after_loss": ("enum", ["halt", "continue"]),
        "max_entries_per_coin": ("number", 1, 20)}),
    "entry_hours_utc": ("Entry window in UTC hours (may wrap midnight); exits always run", {
        "start_hour": ("number", 0, 23), "end_hour": ("number", 0, 23)}),
    "sell_pressure_exit": ("Exit when a sell-dominated fall exceeds a threshold", {
        "fall_pct": ("number", 1, 90), "window_minutes": ("enum", [1, 5, 60])}),
    "stall_exit": ("Sell the whole position if |price change| over the last window_s seconds is below min_move_pct "
                   "(exit_reason stall); null = off. Both fields required.", {
        "window_s": ("integer", 5, 86400), "min_move_pct": ("number", 0.01, 100)}),
}
REQUIRED_OBJ = {"stall_exit": ["window_s", "min_move_pct"]}
VENUES = ["curve", "amm"]
REQUIRED_CHECKS = ["liquidity_usd", "volume_24h_usd", "mcap_usd", "age_minutes_min", "age_minutes_max",
                   "top_holders_share_pct", "lp_burned_pct"]
EXIT_PRESETS = ["momentum_trail", "principal_recovery", "double_out", "three_step_ladder", "peak_giveback",
                "trail_stop_only", "incremental_trim", "fast_half", "fixed_thirty", "new_high_timeout",
                "ratchet", "tightening_trail", "geometric_ladder"]
APPROVAL_MODES = ["off", "ask_first_buy", "ask_every_buy"]
PAIRS = [("mcap_usd_min", "mcap_usd_max"), ("age_minutes_min", "age_minutes_max"),
         ("volume_to_mcap_1h_min", "volume_to_mcap_1h_max"),
         ("change_1h_pct_preferred_low", "change_1h_pct_preferred_high"),
         ("change_1h_pct_min", "change_1h_pct_max")]
# loss_guards[] item: sell `sell_portion_pct` of the position once it is `at_loss_pct` below the entry price.
LOSS_RUNG = {"at_loss_pct": (1, 99, True), "sell_portion_pct": (0.01, 100, True)}
TARGET_RUNG = {"at_gain_pct": (0.01, 100000, True), "sell_portion_pct": (0.01, 100, True), "giveback_pct": (0, 100, False)}


def schema():
    p = {"name": {"type": "string", "minLength": 1, "maxLength": 60},
         "bankroll_lamports": {"type": "string", "pattern": LAMPORTS,
                               "description": "Total strategy bankroll, lamports as an integer string (<= 100000 SOL)"},
         "ticket_lamports": {"type": "string", "pattern": LAMPORTS,
                             "description": "Lamports per entry (0.001–1000 SOL), <= bankroll_lamports"},
         "approval_mode": {"enum": APPROVAL_MODES, "default": "ask_first_buy"},
         "venues": {"type": "array", "minItems": 1, "uniqueItems": True, "items": {"enum": VENUES}},
         "required_checks": {"type": "array", "uniqueItems": True, "items": {"enum": REQUIRED_CHECKS},
                             "description": "Checks that must pass outright instead of only scoring"},
         "entry_weekdays_utc": {"type": ["array", "null"], "items": {"type": "integer", "minimum": 0, "maximum": 6}},
         "exit_preset": {"enum": EXIT_PRESETS},
         "profit_targets": {"type": "array", "maxItems": 8, "items": rung()},
         "exit_rules": {"type": "object", "additionalProperties": False, "properties": {
             "label": {"type": "string", "maxLength": 60},
             "profit_targets": {"type": "array", "maxItems": 8, "items": rung()},
             "loss_guards": {"type": "array", "maxItems": 8, "items": loss_rung(),
                             "description": "Partial stops measured from the entry price, evaluated in ascending at_loss_pct"}}},
         "sell_floors": {"type": ["object", "null"], "additionalProperties": False,
                         "description": "Deterministic floors, evaluated before every other exit rule",
                         "properties": {"enabled": {"type": "boolean", "default": True},
                                        "max_loss_pct": {"type": "number", "minimum": 1, "maximum": 99, "default": 35},
                                        "liquidity_drop_pct": {"type": "number", "minimum": 1, "maximum": 99, "default": 80}}}}
    for k, t, lo, hi, d in NUM:
        ty = t.split("|") if "|" in t else t
        p[k] = {"type": ty, "minimum": lo, "maximum": hi, "description": d}
    for k, d in BOOL:
        p[k] = {"type": "boolean", "description": d}
    for k, (d, props) in OBJ.items():
        o = {"type": ["object", "null"], "description": d}
        if props:
            o["additionalProperties"] = False
            o["properties"] = {}
            for pk, spec in props.items():
                o["properties"][pk] = {"enum": spec[1]} if spec[0] == "enum" else {"type": spec[0], "minimum": spec[1], "maximum": spec[2]}
            if k in REQUIRED_OBJ:
                o["required"] = REQUIRED_OBJ[k]
        p[k] = o
    return {"$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://sentra.local/schemas/strategy-settings.v1.1.4.json",
            "title": "Strategy settings v1.1.4",
            "description": "snake_case keys. Percentages/ratios/counts/USD are JSON numbers; SOL amounts are lamport integer strings. Mirrors public.strategy_settings_valid(); generated by scripts/gen_settings.py.",
            "type": "object", "additionalProperties": False, "properties": dict(sorted(p.items()))}


def rung():
    return {"type": "object", "required": [k for k, v in TARGET_RUNG.items() if v[2]], "additionalProperties": False,
            "properties": {k: {"type": "number", "minimum": v[0], "maximum": v[1]} for k, v in TARGET_RUNG.items()}}


def loss_rung():
    return {"type": "object", "required": [k for k, v in LOSS_RUNG.items() if v[2]], "additionalProperties": False,
            "properties": {k: {"type": "number", "minimum": v[0], "maximum": v[1]} for k, v in LOSS_RUNG.items()}}


def arr(xs):
    return "array[" + ",".join("'%s'" % x for x in xs) + "]"


def sql():
    keys = sorted(schema()["properties"].keys())
    nums = ",\n      ".join("(array['%s','%s','%s'])" % (k, lo, hi) for k, _, lo, hi, _ in NUM)
    pairs = "\n     or ".join("(s ->> '%s')::numeric > (s ->> '%s')::numeric" % ab for ab in PAIRS)
    rung_ok = " and ".join(
        ("e ? '%s' and " % k if req else "") + "public.jnum_ok(e, '%s', %s, %s)" % (k, lo, hi)
        for k, (lo, hi, req) in TARGET_RUNG.items())
    loss_ok = " and ".join("e ? '%s' and public.jnum_ok(e, '%s', %s, %s)" % (k, k, lo, hi)
                           for k, (lo, hi, _) in LOSS_RUNG.items())
    objs = arr(OBJ.keys())
    ints = arr([k for k, ty, *_ in NUM if ty.startswith("integer")])
    sw = OBJ["stall_exit"][1]["window_s"][1:]
    sm = OBJ["stall_exit"][1]["min_move_pct"][1:]
    bools = arr([k for k, _ in BOOL])
    return f"""create or replace function public.strategy_settings_valid(s jsonb)
returns boolean language plpgsql immutable as $$
-- GENERATED by scripts/gen_settings.py (settings v1.1.4, snake_case). Do not edit by hand.
declare
  allowed constant text[] := {arr(keys)};
  exit_presets constant text[] := {arr(EXIT_PRESETS)};
  required_checks constant text[] := {arr(REQUIRED_CHECKS)};
  k text;
  bad text;
  e jsonb;
begin
  if s is null or jsonb_typeof(s) <> 'object' then
    raise exception 'settings must be a JSON object' using errcode = 'check_violation';
  end if;
  select string_agg(x, ', ') into bad from jsonb_object_keys(s) x where not (x = any (allowed));
  if bad is not null then
    raise exception 'unknown settings key(s): %', bad using errcode = 'check_violation';
  end if;
  if s ? 'name' and (jsonb_typeof(s -> 'name') <> 'string' or length(s ->> 'name') not between 1 and 60) then
    raise exception 'name must be a string of 1-60 chars' using errcode = 'check_violation';
  end if;
  -- percentages, ratios, counts, USD: JSON numbers in [lo, hi]
  for k, bad in
    select r[1], r[2] || '..' || r[3] from (values
      {nums}
    ) v(r)
  loop
    if not public.jnum_ok(s, k, split_part(bad, '..', 1)::numeric, split_part(bad, '..', 2)::numeric) then
      raise exception 'settings.% must be a number in [%]', k, bad using errcode = 'check_violation';
    end if;
  end loop;
  foreach k in array {ints} loop
    if jsonb_typeof(s -> k) = 'number' and (s ->> k)::numeric <> trunc((s ->> k)::numeric) then
      raise exception 'settings.% must be an integer', k using errcode = 'check_violation';
    end if;
  end loop;
  if s ? 'stall_exit' and jsonb_typeof(s -> 'stall_exit') <> 'null' then
    if jsonb_typeof(s -> 'stall_exit') <> 'object'
       or exists (select 1 from jsonb_object_keys(s -> 'stall_exit') x where x not in ('window_s', 'min_move_pct'))
       or jsonb_typeof(s -> 'stall_exit' -> 'window_s') is distinct from 'number'
       or jsonb_typeof(s -> 'stall_exit' -> 'min_move_pct') is distinct from 'number'
       or not public.jnum_ok(s -> 'stall_exit', 'window_s', {sw[0]}, {sw[1]})
       or (s -> 'stall_exit' ->> 'window_s')::numeric <> trunc((s -> 'stall_exit' ->> 'window_s')::numeric)
       or not public.jnum_ok(s -> 'stall_exit', 'min_move_pct', {sm[0]}, {sm[1]}) then
      raise exception 'settings.stall_exit must be null or {{window_s integer {sw[0]}-{sw[1]}, min_move_pct {sm[0]}-{sm[1]}}}'
        using errcode = 'check_violation';
    end if;
  end if;
  foreach k in array array['stop_loss_pct', 'peak_trail_pct'] loop
    if (s ->> k)::numeric between 0.000001 and 4.999999 then
      raise exception 'settings.% must be 0 (off) or 5-49', k using errcode = 'check_violation';
    end if;
  end loop;
  -- SOL amounts: lamports as integer strings
  foreach k in array array['bankroll_lamports','ticket_lamports'] loop
    if s ? k and (jsonb_typeof(s -> k) <> 'string' or (s ->> k) !~ '{LAMPORTS}') then
      raise exception 'settings.% must be a lamports integer string', k using errcode = 'check_violation';
    end if;
  end loop;
  if (s ->> 'bankroll_lamports')::numeric > 100000000000000 or (s ->> 'ticket_lamports')::numeric > 1000000000000
     or (s ->> 'ticket_lamports')::numeric < 1000000 then
    raise exception 'settings lamports out of range (ticket 0.001-1000 SOL, bankroll <= 100000 SOL)' using errcode = 'check_violation';
  end if;
  if (s ->> 'ticket_lamports')::numeric > (s ->> 'bankroll_lamports')::numeric then
    raise exception 'settings.ticket_lamports must be <= bankroll_lamports' using errcode = 'check_violation';
  end if;
  if {pairs} then
    raise exception 'settings min/max pair is inverted' using errcode = 'check_violation';
  end if;
  foreach k in array {bools} loop
    if not public.jbool_ok(s, k) then
      raise exception 'settings.% must be boolean', k using errcode = 'check_violation';
    end if;
  end loop;
  if s ? 'venues' and (jsonb_typeof(s -> 'venues') <> 'array' or jsonb_array_length(s -> 'venues') = 0
       or exists (select 1 from jsonb_array_elements_text(s -> 'venues') x where x not in ({", ".join("'%s'" % v for v in VENUES)}))) then
    raise exception 'settings.venues must be a non-empty subset of [{", ".join(VENUES)}]' using errcode = 'check_violation';
  end if;
  if s ? 'required_checks' and (jsonb_typeof(s -> 'required_checks') <> 'array'
       or exists (select 1 from jsonb_array_elements_text(s -> 'required_checks') x where not (x = any (required_checks)))) then
    raise exception 'settings.required_checks must be a subset of %', required_checks using errcode = 'check_violation';
  end if;
  if s ? 'exit_preset' and not ((s ->> 'exit_preset') = any (exit_presets)) then
    raise exception 'settings.exit_preset must be one of %', exit_presets using errcode = 'check_violation';
  end if;
  if s ? 'profit_targets' then
    if jsonb_typeof(s -> 'profit_targets') <> 'array' or jsonb_array_length(s -> 'profit_targets') > 8 then
      raise exception 'settings.profit_targets must be an array of <= 8 targets' using errcode = 'check_violation';
    end if;
    for e in select * from jsonb_array_elements(s -> 'profit_targets') loop
      if not ({rung_ok}) then
        raise exception 'settings.profit_targets entry invalid: %', e using errcode = 'check_violation';
      end if;
    end loop;
  end if;
  if s ? 'exit_rules' and (jsonb_typeof(s -> 'exit_rules') <> 'object'
       or coalesce(jsonb_array_length(case when jsonb_typeof(s -> 'exit_rules' -> 'profit_targets') = 'array' then s -> 'exit_rules' -> 'profit_targets' end), 0) > 8
       or coalesce(jsonb_array_length(case when jsonb_typeof(s -> 'exit_rules' -> 'loss_guards') = 'array' then s -> 'exit_rules' -> 'loss_guards' end), 0) > 8) then
    raise exception 'settings.exit_rules allows <= 8 profit_targets and <= 8 loss_guards' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(s -> 'exit_rules' -> 'loss_guards') = 'array' then
    for e in select * from jsonb_array_elements(s -> 'exit_rules' -> 'loss_guards') loop
      if jsonb_typeof(e) <> 'object' or exists (select 1 from jsonb_object_keys(e) x where x not in ({", ".join("'%s'" % k for k in LOSS_RUNG)}))
         or not ({loss_ok}) then
        raise exception 'settings.exit_rules.loss_guards entry invalid: %', e using errcode = 'check_violation';
      end if;
    end loop;
  elsif s -> 'exit_rules' ? 'loss_guards' and jsonb_typeof(s -> 'exit_rules' -> 'loss_guards') <> 'null' then
    raise exception 'settings.exit_rules.loss_guards must be an array' using errcode = 'check_violation';
  end if;
  if s ? 'entry_weekdays_utc' and jsonb_typeof(s -> 'entry_weekdays_utc') <> 'null'
     and (jsonb_typeof(s -> 'entry_weekdays_utc') <> 'array'
          or exists (select 1 from jsonb_array_elements(s -> 'entry_weekdays_utc') d
                     where jsonb_typeof(d) <> 'number' or d::text::numeric not in (0,1,2,3,4,5,6))) then
    raise exception 'settings.entry_weekdays_utc must be UTC weekdays 0-6' using errcode = 'check_violation';
  end if;
  if s ? 'approval_mode' and not ((s ->> 'approval_mode') in ({", ".join("'%s'" % m for m in APPROVAL_MODES)})) then
    raise exception 'settings.approval_mode must be off | ask_first_buy | ask_every_buy' using errcode = 'check_violation';
  end if;
  if s ? 'sell_floors' and jsonb_typeof(s -> 'sell_floors') <> 'null' then
    if jsonb_typeof(s -> 'sell_floors') <> 'object'
       or exists (select 1 from jsonb_object_keys(s -> 'sell_floors') x
                  where x not in ('enabled', 'max_loss_pct', 'liquidity_drop_pct'))
       or not public.jbool_ok(s -> 'sell_floors', 'enabled')
       or not public.jnum_ok(s -> 'sell_floors', 'max_loss_pct', 1, 99)
       or not public.jnum_ok(s -> 'sell_floors', 'liquidity_drop_pct', 1, 99) then
      raise exception 'settings.sell_floors must be {{enabled?, max_loss_pct 1-99, liquidity_drop_pct 1-99}}'
        using errcode = 'check_violation';
    end if;
  end if;
  foreach k in array {objs} loop
    if s ? k and jsonb_typeof(s -> k) not in ('object', 'null') then
      raise exception 'settings.% must be an object or null', k using errcode = 'check_violation';
    end if;
  end loop;
  return true;
end $$;"""


root = pathlib.Path(__file__).resolve().parent.parent
(root / "config/strategy_settings.schema.json").write_text(json.dumps(schema(), indent=2) + "\n")
mig = root / "supabase/migrations/0009_contracts_v1_1_4.sql"
src = mig.read_text()
B, E = "-- BEGIN GENERATED strategy_settings_valid\n", "-- END GENERATED strategy_settings_valid"
start = src.index(B) + len(B)
end = src.index(E, start)
mig.write_text(src[:start] + sql() + "\n" + src[end:])
print("settings: %d keys" % len(schema()["properties"]))
