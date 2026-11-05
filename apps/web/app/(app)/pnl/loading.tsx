export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="h-10 w-56 animate-pulse rounded-md bg-bg-sunken" />
      <div className="h-[118px] animate-pulse rounded-lg bg-bg-surface" />
      <div className="h-[118px] animate-pulse rounded-lg bg-bg-surface" />
      <div className="h-72 animate-pulse rounded-lg bg-bg-surface" />
    </div>
  );
}