export function Tags({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-muted">Not set</span>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item} className="rounded-full bg-parchment px-3 py-1 text-xs font-medium text-gold-deep">
          {item}
        </li>
      ))}
    </ul>
  );
}
