/**
 * `metadataBase` must be a real URL. An unset build arg is `undefined`, but a Docker `ARG` left empty
 * arrives as `""` — `??` would then keep it and `new URL("")` throws "Invalid URL" during the build
 * (`/_not-found` page). Treat blank as unset.
 */
export function siteUrl(raw: string | undefined | null): string {
  const v = raw?.trim();
  return v ? v : "http://localhost:3100";
}
