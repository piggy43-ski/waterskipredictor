interface Point {
  amount: number;
  created_at: string;
}

/** Rising price line across the life of the auction. Purely decorative momentum. */
export const PriceSparkline = ({ bids }: { bids: Point[] }) => {
  const pts = [...bids].reverse();
  if (pts.length < 2) return null;

  const w = 320;
  const h = 48;
  const t0 = new Date(pts[0].created_at).getTime();
  const t1 = new Date(pts[pts.length - 1].created_at).getTime();
  const span = Math.max(1, t1 - t0);
  const min = Math.min(...pts.map((p) => Number(p.amount)));
  const max = Math.max(...pts.map((p) => Number(p.amount)));
  const range = Math.max(1, max - min);

  const d = pts
    .map((p, i) => {
      const x = ((new Date(p.created_at).getTime() - t0) / span) * w;
      const y = h - ((Number(p.amount) - min) / range) * (h - 6) - 3;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-12 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Bid price over time"
    >
      <path d={`${d} L${w},${h} L0,${h} Z`} className="fill-primary/10" />
      <path d={d} className="stroke-primary" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};