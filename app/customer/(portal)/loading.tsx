export default function CustomerPortalLoading() {
  return (
    <div role="status" aria-label="Loading portal content" className="space-y-6">
      {/* Top Banner / Header Skeleton */}
      <div className="h-20 animate-pulse rounded-2xl border border-gold/20 bg-white/70 shadow-xs" />

      {/* Grid of Cards Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-2xl border border-gold/15 bg-white/60 p-5 space-y-3 shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gold/15" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded-md bg-gold/20" />
                <div className="h-3 w-1/2 rounded-md bg-gold/10" />
              </div>
            </div>
            <div className="h-3 w-full rounded-md bg-gold/10" />
            <div className="h-3 w-5/6 rounded-md bg-gold/10" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}

