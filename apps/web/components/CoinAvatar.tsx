"use client";
import { useEffect, useRef, useState } from "react";
import { identicon } from "@/lib/identicon";
import { coinLogoSrc, logoSizeFor } from "@/lib/media";
import { cn } from "@/components/ui/cn";
import { identiconFont } from "@/app/fonts/identicon";

/** Display sizes (UX COIN_LOGO §1 + PERFORMANCE_BUDGET cards/detail). */
const SIZES = { xs: 16, sm: 20, md: 28, lg: 40 } as const;
/** COIN_LOGO §3: skeleton only when the logo is not loaded after 150 ms; once shown, at least 300 ms. */
export const SKELETON_DELAY_MS = 150;
export const SKELETON_MIN_MS = 300;

/** Logo / mint+v pairs that answered 404/422 or failed to decode: identicon for the rest of the session, no retry. */
const failedLogos = new Set<string>();
/** Logos already decoded this session: shown at once, no skeleton (cache hit). */
const loadedLogos = new Set<string>();

type Phase = "wait" | "skeleton" | "loaded" | "failed";

/**
 * Coin avatar (contracts 1.1.6 + UX COIN_LOGO Rev 6.1): the logo through our same-origin image proxy (lib/media.ts),
 * requested at the smallest 48/64/96/128/192 bucket >= px × dpr; `logo_hash` null/absent or a failed load → the
 * deterministic 12-hue identicon with symbol initials. Lazy + async decode, fixed size (no layout shift), decorative
 * (alt="", the symbol is next to it). The loading skeleton is static (no shimmer), never in under 150 ms.
 */
export function CoinAvatar({ mint, logoHash, symbol, size = "sm", className, eager = false, notTradeable = false }: {
  mint: string;
  /** wire logo_hash (= `v`): null/undefined = identicon without a request. */
  logoHash?: string | null;
  /** coin symbol (untrusted, already cleaned) for the identicon initials */
  symbol?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  /** above-the-fold header (coin trail) */
  eager?: boolean;
  /** not tradeable: grayscale + 0.55 opacity + dashed ring (COIN_LOGO §3) */
  notTradeable?: boolean;
}) {
  const px = SIZES[size];
  const src = coinLogoSrc(mint, logoHash, logoSizeFor(px));
  const src2x = coinLogoSrc(mint, logoHash, logoSizeFor(px, 2));
  const known = src != null && failedLogos.has(src) ? "failed" : src != null && loadedLogos.has(src) ? "loaded" : "wait";
  const [state, setState] = useState<{ src: string | null; phase: Phase }>({ src, phase: known });
  const phase: Phase = state.src === src ? state.phase : known;
  const skeletonAt = useRef<number | null>(null);

  useEffect(() => {
    if (!src || phase !== "wait") return;
    const id = setTimeout(() => {
      skeletonAt.current = Date.now();
      setState((s) => (s.src === src && s.phase === "wait" ? { src, phase: "skeleton" } : s));
    }, SKELETON_DELAY_MS);
    return () => clearTimeout(id);
  }, [src, phase]);

  const box = cn(
    "relative inline-block shrink-0 overflow-hidden rounded-full align-middle",
    notTradeable ? "opacity-[var(--coin-logo-not-tradeable-opacity,0.55)] grayscale outline outline-1 -outline-offset-1 outline-dashed outline-text-tertiary" : "shadow-[inset_0_0_0_1px_var(--coin-logo-ring,rgba(255,255,255,0.12))]",
    className,
  );

  if (!src || phase === "failed") return <Identicon mint={mint} symbol={symbol} px={px} className={box} />;

  const loaded = () => {
    loadedLogos.add(src);
    const shown = skeletonAt.current;
    const wait = shown == null ? 0 : Math.max(0, SKELETON_MIN_MS - (Date.now() - shown));
    const done = () => setState({ src, phase: "loaded" });
    if (wait) setTimeout(done, wait);
    else done();
  };
  const failed = () => {
    failedLogos.add(src);
    setState({ src, phase: "failed" });
  };
  return (
    <span className={box} style={{ width: px, height: px, backgroundColor: phase === "skeleton" ? "var(--color-skeleton-base)" : undefined }} data-testid="coin-avatar" data-kind={phase === "loaded" ? "logo" : phase === "skeleton" ? "skeleton" : "pending"}>
      {/* eslint-disable-next-line @next/next/no-img-element -- same-origin proxy that already sizes/validates; next/image would add a second proxy hop */}
      <img
        src={src}
        srcSet={src2x && src2x !== src ? `${src} 1x, ${src2x} 2x` : undefined}
        alt=""
        aria-hidden
        width={px}
        height={px}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "low"}
        referrerPolicy="no-referrer"
        draggable={false}
        onLoad={loaded}
        onError={failed}
        // SSR'd <img> can finish before hydration attaches handlers: read its state on mount.
        ref={(el) => {
          if (!el || !el.complete || phase !== "wait") return;
          if (el.naturalWidth > 0) loaded();
          else if (el.currentSrc) failed();
        }}
        className={cn("block h-full w-full rounded-full motion-safe:transition-opacity motion-safe:duration-150", phase === "loaded" ? "opacity-100" : "opacity-0")}
      />
    </span>
  );
}

function Identicon({ mint, symbol, px, className }: { mint: string; symbol?: string | null; px: number; className: string }) {
  const i = identicon(mint, symbol);
  return (
    <span
      aria-hidden
      className={cn(className, identiconFont.className, "grid place-items-center leading-none select-none")}
      style={{ width: px, height: px, backgroundColor: i.bgVar, color: i.fgVar, fontSize: Math.round((px * i.fontPct) / 100), fontWeight: 700 }}
      data-testid="coin-avatar"
      data-kind="identicon"
      data-palette={i.index}
    >
      {i.text}
    </span>
  );
}
