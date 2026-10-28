export default function CustomerPortalLoading() {
  return (
    <div role="status" aria-label="Loading portal content" className="space-y-5">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="h-6 w-52 rounded-md bg-gold/20 animate-pulse" />
          <div className="h-3 w-80 max-w-full rounded-md bg-gold/10 animate-pulse" />
        </div>
        <div className="h-9 w-36 rounded-xl bg-gold/15 animate-pulse shrink-0 hidden sm:block" />
      </div>

      {/* Grid of Cards Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-44 rounded-2xl border border-gold/15 bg-white/80 p-5 space-y-3.5 shadow-xs animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gold/15 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded-md bg-gold/20" />
                <div className="h-3 w-1/2 rounded-md bg-gold/10" />
              </div>
            </div>
            <div className="h-3 w-full rounded-md bg-gold/10" />
            <div className="h-3 w-4/5 rounded-md bg-gold/10" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading content…</span>
    </div>
  );
}
