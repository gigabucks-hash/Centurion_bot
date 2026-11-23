/** Helmet, or the helmet with Centurion and a readable TRADE line. */
export function BrandLockup({ mark = 24, word = true }: { mark?: number; word?: boolean }) {
  const name = Math.max(14, Math.round(mark * 0.62));
  const trade = Math.max(9, Math.round(mark * 0.38));
  return (
    <span className="brand-lockup">
      <img src="/brand/mark-on-dark.svg" alt="" className="brand-lockup-dark" style={{ height: mark }} />
      <img src="/brand/mark-on-light.svg" alt="" className="brand-lockup-light" style={{ height: mark }} />
      {word && (
        <span className="brand-lockup-type">
          <span className="brand-lockup-name" style={{ fontSize: name }}>Centurion</span>
          <span className="brand-lockup-trade" style={{ fontSize: trade }}>TRADE</span>
        </span>
      )}
    </span>
  );
}
