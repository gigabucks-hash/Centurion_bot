"use client";
import { useState } from "react";
import { identicon, identiconColors } from "@/lib/identicon";
import { coinLogoSrc, logoSizeFor } from "@/lib/media";
import { cn } from "@/components/ui/cn";

const SIZES = { xs: 16, sm: 20, md: 28, lg: 40 } as const;

/**
 * Coin avatar: the logo through our same-origin image proxy (lib/media.ts), else a deterministic identicon from the
 * mint. Lazy + async decode, fixed intrinsic size (no layout shift), decorative (alt="", the symbol is next to it).
 * Fallback triggers: invalid mint, `logoUrl === null` (known missing), or the image failing to load/decode.
 */
export function CoinAvatar({ mint, logoUrl, size = "sm", className, eager = false }: {
  mint: string;
  /** wire logo_url hint: undefined = unknown (ask the proxy), null = no logo. Its value is never used as src. */
  logoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  /** above-the-fold header (coin trail) */
  eager?: boolean;
}) {
  const px = SIZES[size];
  const src = coinLogoSrc(mint, logoUrl, logoSizeFor(px));
  const src2x = coinLogoSrc(mint, logoUrl, logoSizeFor(px, 2));
  const [failed, setFailed] = useState<string | null>(null);
  const box = cn("inline-block shrink-0 overflow-hidden rounded-full bg-bg-sunken align-middle", className);
  if (src && failed !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- same-origin proxy that already sizes/validates; next/image would add a second proxy hop
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
        onError={() => setFailed(src)}
        // SSR'd <img> can fail before hydration attaches onError: detect an already-broken image on mount.
        ref={(el) => {
          if (el && el.complete && el.naturalWidth === 0 && el.currentSrc) setFailed(src);
        }}
        className={box}
        style={{ width: px, height: px }}
        data-testid="coin-avatar"
        data-kind="logo"
      />
    );
  }
  return <Identicon mint={mint} px={px} className={box} />;
}

function Identicon({ mint, px, className }: { mint: string; px: number; className: string }) {
  const { hue, cells, valid } = identicon(mint);
  const { bg, fg } = identiconColors(hue, valid);
  return (
    <svg width={px} height={px} viewBox="0 0 8 8" aria-hidden className={className} data-testid="coin-avatar" data-kind="identicon">
      <rect width="8" height="8" rx="4" fill={bg} />
      <g fill={fg}>
        {cells.map((on, i) => (on ? <rect key={i} x={(i % 5) + 1.5} y={Math.floor(i / 5) + 1.5} width="1" height="1" /> : null))}
      </g>
    </svg>
  );
}
