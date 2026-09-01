import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/** 7-snapshot revenue growth as a signed percentage with an icon (never colour alone). */
export function GrowthIndicator({
  growth,
  className,
}: {
  growth: number | null;
  className?: string;
}) {
  if (growth === null) {
    return (
      <span
        className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}
      >
        <Minus className="size-3.5" />
        n/a
      </span>
    );
  }
  const pct = growth * 100;
  const flat = Math.abs(pct) < 0.5;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        flat ? "text-muted-foreground" : pct > 0 ? "text-emerald-500" : "text-rose-500",
        className,
      )}
      title="Revenue growth over the last 7 snapshots"
    >
      <Icon className="size-3.5" />
      {pct > 0 ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}
