/** Helmet, or the helmet with the Centurion wordmark. Dark and light files swap with the theme. */
export function BrandLockup({ height = 28, word = true }: { height?: number; word?: boolean }) {
  const kind = word ? "wordmark" : "mark";
  return (
    <span className="brand-lockup" style={{ height }}>
      <img src={`/brand/${kind}-on-dark.svg`} alt={word ? "Centurion Trade" : ""} className="brand-lockup-dark" />
      <img src={`/brand/${kind}-on-light.svg`} alt="" className="brand-lockup-light" />
    </span>
  );
}
