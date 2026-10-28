export default function SuperAdminLoading() {
  return (
    <div role="status" aria-label="Loading administrative console" className="space-y-6">
      {/* Metrics Banner Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-24 rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2.5 animate-pulse"
          >
            <div className="h-3.5 w-1/2 rounded bg-white/15" />
            <div className="h-7 w-2/3 rounded bg-gold/30" />
          </div>
        ))}
      </div>

      {/* Main Table / Management Grid Skeleton */}
      <div className="h-72 rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4 animate-pulse">
        <div className="h-5 w-40 rounded bg-white/20" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-11 w-full rounded-xl bg-white/10" />
          ))}
        </div>
      </div>

      <span className="sr-only">Loading console…</span>
    </div>
  );
}
