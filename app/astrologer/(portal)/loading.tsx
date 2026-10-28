export default function AstrologerPortalLoading() {
  return (
    <div role="status" aria-label="Loading portal content" className="space-y-5 max-w-5xl mx-auto">
      {/* Header Skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl border border-gold/20 bg-white/60 animate-pulse shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="h-5 w-44 rounded-md bg-gold/20 animate-pulse" />
          <div className="h-3 w-72 rounded-md bg-gold/10 animate-pulse" />
        </div>
      </div>

      {/* Metric / Stat Cards Shimmer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-24 rounded-2xl border border-gold/15 bg-white/80 p-4 shadow-xs flex items-center gap-3.5 animate-pulse"
          >
            <div className="h-11 w-11 rounded-xl bg-gold/15 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-3 w-16 rounded bg-gold/15" />
              <div className="h-6 w-12 rounded bg-gold/25" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Area Shimmer */}
      <div className="rounded-2xl border border-gold/15 bg-white/80 p-6 shadow-xs space-y-4 animate-pulse">
        <div className="h-5 w-36 rounded bg-gold/20" />
        <div className="space-y-3 pt-1">
          <div className="h-14 rounded-xl border border-gold/10 bg-parchment/40" />
          <div className="h-14 rounded-xl border border-gold/10 bg-parchment/40" />
          <div className="h-14 rounded-xl border border-gold/10 bg-parchment/40" />
        </div>
      </div>

      <span className="sr-only">Loading content…</span>
    </div>
  );
}
