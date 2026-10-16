export function Ornament({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex items-center gap-2 ${className}`}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/60" />
      <svg viewBox="0 0 24 12" className="h-3 w-6 text-gold" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M12 1 L16 6 L12 11 L8 6 Z" fill="currentColor" fillOpacity="0.35" />
        <circle cx="3" cy="6" r="1.2" fill="currentColor" />
        <circle cx="21" cy="6" r="1.2" fill="currentColor" />
      </svg>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/60" />
    </div>
  );
}
