type ProgressProps = {
  value: number;
};

export function Progress({ value }: ProgressProps) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-zinc-200" aria-label="진행도">
      <div
        className="h-2 rounded-full bg-zinc-900 transition-all"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
