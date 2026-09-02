import { Database, FlaskConical, Globe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SOURCES: Record<
  string,
  { label: string; detail: string; icon: typeof Globe; className: string }
> = {
  mock: {
    label: "Sample data",
    detail:
      "Generated locally by the seed script. Revenue, traffic, spend and engagement are synthetic.",
    icon: FlaskConical,
    className: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  },
  meta_ad_library: {
    label: "Live · Meta Ad Library",
    detail:
      "Real ad from Meta's public Ad Library (EU/UK delivery). Meta does not publish spend or engagement for commercial ads.",
    icon: Globe,
    className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  },
  shopify_storefront: {
    label: "Live · Storefront",
    detail:
      "Observed from the store's public storefront (products.json, theme, apps). Revenue and traffic are not exposed publicly; any figure shown is a labelled estimate.",
    icon: Globe,
    className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  },
};

/** Explicit provenance on every store and ad card. */
export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const meta = SOURCES[source] ?? {
    label: source,
    detail: "Unknown data source.",
    icon: Database,
    className: "text-muted-foreground",
  };
  const Icon = meta.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn("gap-1 font-medium", meta.className, className)}>
          <Icon className="size-3" />
          {meta.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{meta.detail}</TooltipContent>
    </Tooltip>
  );
}
