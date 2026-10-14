export interface BarListItem {
  key: string;
  label: string;
  value: number;
  /** The value as read, e.g. "€27,100" or "12 bookings". */
  display: string;
}

/**
 * A single-series horizontal bar list: one hue (primary 600), each bar named
 * by its label and value in text, so identity never rests on colour. Bars are
 * scaled to the largest value and end in a 4 px rounded cap.
 */
export function BarList({
  items,
  label,
}: {
  items: readonly BarListItem[];
  label: string;
}) {
  const largest = Math.max(0, ...items.map((item) => item.value));
  return (
    <ul aria-label={label} className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li
          key={item.key}
          title={`${item.label}: ${item.display}`}
          className="flex flex-col gap-1"
        >
          <div className="flex items-baseline justify-between gap-3 text-body-sm">
            <span className="min-w-0 truncate text-default">{item.label}</span>
            <span className="shrink-0 font-mono text-secondary">{item.display}</span>
          </div>
          <span aria-hidden="true" className="block h-2 rounded-r-sm bg-neutral-100">
            <span
              className="block h-full rounded-r-sm bg-primary-600"
              style={{ width: largest > 0 ? `${(item.value / largest) * 100}%` : '0%' }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
