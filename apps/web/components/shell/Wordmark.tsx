/**
 * Approved Centurion Trade lockup. Dark and light files differ only in the
 * TRADE line so it stays readable. The helmet and CENTURION stay gold.
 */
/** Static SVGs swapped by theme. The image optimizer does not apply. */
export function Wordmark({ height = 36 }: { height?: number }) {
  return (
    <span className="brand-wordmark" style={{ height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/wordmark-on-dark.svg" alt="Centurion Trade" className="brand-wordmark-dark" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/wordmark-on-light.svg" alt="" className="brand-wordmark-light" />
    </span>
  );
}
