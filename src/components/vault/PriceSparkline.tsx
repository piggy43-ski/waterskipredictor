interface Point {
  amount: number;
  created_at: string;
}

/** Rising price line across the life of the auction. A shape, not a data table. */
export const PriceSparkline = ({ bids }: { bids: Point[] }) => {
  const pts = [...bids].reverse();
  if (pts.length < 2) return null;

  const w = 600;
  const h = 160;
  const t0 = new Date(pts[0].created_at).getTime();
  const t1 = new Date(pts[pts.length - 1].created_at).getTime();
  const span = Math.max(1, t1 - t0);
  const min = Math.min(...pts.map((p) => Number(p.amount)));
  const max = Math.max(...pts.map((p) => Number(p.amount)));
  const range = Math.max(1, max - min);

  const d = pts
    .map((p, i) => {
      const x = ((new Date(p.created_at).getTime() - t0) / span) * w;
      const y = h - ((Number(p.amount) - min) / range) * (h - 16) - 8;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-40 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Bid price over time"
    >
      <defs>
        <linearGradient id="vault-price-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A4AF0" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#4A4AF0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="url(#vault-price-fill)" />
      <path d={d} stroke="#4A4AF0" strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
