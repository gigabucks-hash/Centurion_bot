/**
 * Loading skeletons (Server Components, no JS). Shapes mirror the real layouts so swapping in content does not
 * shift the page (CLS). `aria-busy` + a visually hidden label announce loading once.
 */
const bar = "animate-pulse rounded-md bg-bg-raised motion-reduce:animate-none";

export function PageSkeleton({ variant = "table", label = "Loading…" }: { variant?: "dashboard" | "table" | "list" | "form" | "detail" | "auth"; label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      {variant !== "auth" && (
        <div className="flex flex-col gap-2">
          <div className={`${bar} h-7 w-48`} />
          <div className={`${bar} h-4 w-80 max-w-full`} />
        </div>
      )}
      {variant === "dashboard" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className={`${bar} h-24`} />)}</div>
          <div className="grid gap-4 xl:grid-cols-3"><div className={`${bar} h-80 xl:col-span-2`} /><div className={`${bar} h-80`} /></div>
        </>
      )}
      {(variant === "table" || variant === "list") && (
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
          {Array.from({ length: variant === "table" ? 8 : 10 }, (_, i) => <div key={i} className={`${bar} mb-3 w-full last:mb-0 ${variant === "table" ? "h-10" : "h-12"}`} />)}
        </div>
      )}
      {variant === "form" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={`${bar} h-16`} />)}</div>
          <div className={`${bar} h-72`} />
        </div>
      )}
      {variant === "detail" && (
        <>
          <div className={`${bar} h-[280px] w-full`} />
          <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className={`${bar} h-20`} />)}</div>
        </>
      )}
      {variant === "auth" && <div className={`${bar} mx-auto mt-24 h-96 w-full max-w-md`} />}
    </div>
  );
}
