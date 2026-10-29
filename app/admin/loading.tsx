export default function ConsultantAdminLoading() {
  return (
    <div role="status" aria-label="Loading consultant workspace" className="space-y-6 rise-in">
      {/* Header Banner Skeleton */}
      <div className="rounded-2xl border border-gold/30 bg-midnight/90 p-6 shadow-xl animate-pulse space-y-3">
        <div className="h-4 w-40 rounded-full bg-gold/25" />
        <div className="h-7 w-64 rounded-md bg-gold/30" />
        <div className="h-3 w-96 max-w-full rounded bg-gold/15" />
      </div>

      {/* Metrics Row Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-sm space-y-3 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 rounded bg-gold/20" />
              <div className="h-8 w-8 rounded-xl bg-gold/15" />
            </div>
            <div className="h-6 w-16 rounded bg-midnight/30" />
          </div>
        ))}
      </div>

      {/* Main Table / Workload Card Skeleton */}
      <div className="h-64 rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-sm space-y-4 animate-pulse">
        <div className="h-5 w-48 rounded bg-gold/25" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-10 w-full rounded-xl bg-gold/10" />
          ))}
        </div>
      </div>

      <span className="sr-only">Loading consultant workspace…</span>
    </div>
  );
}

