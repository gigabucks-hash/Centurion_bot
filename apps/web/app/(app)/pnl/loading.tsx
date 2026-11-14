export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="skeleton h-8 w-56" />
      <div className="skeleton h-[118px]" />
      <div className="skeleton h-[118px]" />
      <div className="skeleton h-72" />
    </div>
  );
}