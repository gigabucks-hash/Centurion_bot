import { useEffect, useState } from "react";
import { useTerm } from "../state/store";
import { cacheKey, logoSrc, logoStatus, recordLogo, type AvatarPx } from "./coinLogo";
import { identiconIndex, identiconInitials } from "./identicon";

const SKELETON_DELAY_MS = 150; // --duration-skeletonDelay
const SKELETON_MIN_MS = 300; // --duration-skeletonMin
const LOAD_TIMEOUT_MS = 4000;

/**
 * Round coin logo, left of the symbol (COIN_LOGO Rev 6.0). Proxy image when the coin has a `logo_hash`,
 * otherwise the deterministic identicon. Loading: empty slot (no layout shift), a STATIC skeleton circle only
 * after 150 ms, shown ≥ 300 ms; no shimmer. Not tradeable: grayscale + 0.55 opacity + dashed ring (the text
 * label next to it carries the meaning). Decorative by default (the symbol text sits next to it).
 *
 * `<img>` cannot tell 404/422 from a network error, so an error is final for this mint+v in this session
 * (never retried); only a 4 s timeout is retried once.
 */
export function CoinAvatar({ mint, symbol, logoHash, size = 24, notTradeable = false, label }: {
  mint: string;
  symbol: string;
  logoHash?: string | null;
  size?: AvatarPx;
  notTradeable?: boolean;
  /** Set only when no symbol text is next to the avatar. */
  label?: string;
}) {
  const origin = useTerm((s) => s.logoOrigin);
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const src = logoSrc(origin, mint, logoHash, size, dpr);
  const key = src ? cacheKey(mint, logoHash!) : "";
  const known = src ? logoStatus(key) : undefined;
  const [phase, setPhase] = useState<"wait" | "skeleton" | "ok" | "failed">(known === "ok" ? "ok" : known === "failed" ? "failed" : "wait");
  const [attempt, setAttempt] = useState(0);
  const [skeletonAt, setSkeletonAt] = useState<number | null>(null);

  useEffect(() => {
    const k = src ? logoStatus(key) : undefined;
    setPhase(k === "ok" ? "ok" : k === "failed" ? "failed" : "wait");
    setSkeletonAt(null);
    setAttempt(0);
  }, [src, key]);

  useEffect(() => {
    if (!src || phase !== "wait") return;
    const sk = setTimeout(() => { setPhase((p) => (p === "wait" ? "skeleton" : p)); setSkeletonAt(performance.now()); }, SKELETON_DELAY_MS);
    return () => clearTimeout(sk);
  }, [src, phase, attempt]);

  useEffect(() => {
    if (!src || phase === "ok" || phase === "failed") return;
    const to = setTimeout(() => {
      const st = recordLogo(key, "network");
      if (st === "retry") setAttempt((a) => a + 1);
      else setPhase("failed");
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(to);
  }, [src, key, phase, attempt]);

  const settle = (ok: boolean) => {
    recordLogo(key, ok ? "ok" : "failed");
    const wait = skeletonAt == null ? 0 : Math.max(0, SKELETON_MIN_MS - (performance.now() - skeletonAt));
    setTimeout(() => setPhase(ok ? "ok" : "failed"), wait); // skeleton shown ≥ 300 ms once visible (anti-flicker)
  };

  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  const cls = `coin-avatar s${size}${notTradeable ? " nt" : ""}`;
  if (!src || phase === "failed") {
    const idx = identiconIndex(mint);
    const ini = identiconInitials(symbol);
    return (
      <span className={`${cls} identicon${ini.length === 1 ? " one" : ""}`} style={{ background: `var(--color-identicon-${idx})` }} data-logo="identicon" {...a11y}>
        {ini}
      </span>
    );
  }
  return (
    <span className={`${cls}${phase === "skeleton" ? " skeleton-dot" : ""}`} data-logo={phase} {...a11y}>
      <img
        key={attempt}
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        className={phase === "ok" ? "on" : ""}
        onLoad={(e) => settle(e.currentTarget.naturalWidth > 0)}
        onError={() => settle(false)}
      />
    </span>
  );
}
