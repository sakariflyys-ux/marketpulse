import { MISSING_REASON, type MissingReason } from "@/lib/metrics";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Renders "—" for a value that is genuinely unavailable, with the reason on
 * hover. Never substitute a number for a missing metric.
 */
export function Missing({ reason, className }: { reason: MissingReason; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`Not available. ${MISSING_REASON[reason]}`}
          className={className ?? "text-muted-foreground"}
        >
          —
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{MISSING_REASON[reason]}</TooltipContent>
    </Tooltip>
  );
}

/** `value` formatted with `format`, or "—" with the reason when null. */
export function Metric({
  value,
  format,
  reason,
  className,
}: {
  value: number | null;
  format: (n: number) => string;
  reason: MissingReason;
  className?: string;
}) {
  if (value === null) return <Missing reason={reason} className={className} />;
  return <>{format(value)}</>;
}
