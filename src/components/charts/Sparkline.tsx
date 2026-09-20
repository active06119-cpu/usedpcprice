type Point = { day: string; mid: number };

export function Sparkline({ points, className = "" }: { points: Point[]; className?: string }) {
  if (points.length < 2) {
    return <p className="py-6 text-center text-sm text-stone-400">그래프를 그릴 실매물이 아직 부족합니다.</p>;
  }

  const vals = points.map((p) => p.mid);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const w = 320;
  const h = 88;
  const pad = 6;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.mid - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-24 w-full ${className}`} role="img" aria-label="시세 추이">
      <polyline fill="none" stroke="#1e3a5f" strokeWidth="2" points={coords.join(" ")} />
      <circle cx={coords.at(-1)?.split(",")[0]} cy={coords.at(-1)?.split(",")[1]} r="3.2" fill="#c2410c" />
    </svg>
  );
}
