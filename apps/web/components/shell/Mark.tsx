/** Original Centurion mark: a faceted crest. Uses theme tokens, not a third-party logo. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--color-brand-primary)" />
      <path d="M16 6.5 25 12.2v7.6L16 25.5 7 19.8v-7.6L16 6.5Z" fill="var(--color-text-onAccent)" fillOpacity="0.92" />
      <path d="M16 6.5 25 12.2 16 16.2 7 12.2 16 6.5Z" fill="var(--color-brand-primaryContainer)" />
      <path d="M16 16.2 25 12.2v7.6L16 25.5V16.2Z" fill="var(--color-text-onAccent)" fillOpacity="0.55" />
    </svg>
  );
}
