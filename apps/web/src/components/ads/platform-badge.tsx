import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  META: "border-sky-500/40 text-sky-600 dark:text-sky-400",
  TIKTOK: "border-fuchsia-500/40 text-fuchsia-600 dark:text-fuchsia-400",
  GOOGLE: "border-amber-500/40 text-amber-600 dark:text-amber-400",
};

const LABELS: Record<string, string> = { META: "Meta", TIKTOK: "TikTok", GOOGLE: "Google" };

export function PlatformBadge({ platform, className }: { platform: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", STYLES[platform], className)}>
      {LABELS[platform] ?? platform}
    </Badge>
  );
}
