export default function PortalLoading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="h-36 animate-pulse rounded-2xl bg-midnight/90" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-parchment" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-parchment" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
