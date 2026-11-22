/**
 * Helmet plus Centurion, with TRADE large enough to read.
 * The mark swaps with the theme. The words are the UI faces, not an image.
 */
export function Wordmark({ mark = 24 }: { mark?: number }) {
  const name = Math.max(14, Math.round(mark * 0.62));
  const trade = Math.max(9, Math.round(mark * 0.38));
  return (
    <span className="brand-wordmark">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark-on-dark.svg" alt="" className="brand-wordmark-dark" style={{ height: mark }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark-on-light.svg" alt="" className="brand-wordmark-light" style={{ height: mark }} />
      <span className="brand-wordmark-type">
        <span className="brand-wordmark-name" style={{ fontSize: name }}>Centurion</span>
        <span className="brand-wordmark-trade" style={{ fontSize: trade }}>TRADE</span>
      </span>
    </span>
  );
}
