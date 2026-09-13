type ProgressProps = {
  value: number;
};

export function Progress({ value }: ProgressProps) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={safeValue} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="h-2 rounded-full bg-[#1e3a5f] transition-[width] duration-200 ease-out"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
