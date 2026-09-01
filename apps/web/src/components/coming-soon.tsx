import { Construction } from "lucide-react";

import { PageHeader } from "@/components/page-header";

export function ComingSoon({
  title,
  phase,
  summary,
}: {
  title: string;
  phase: number;
  summary: string;
}) {
  return (
    <>
      <PageHeader title={title} description={summary} />
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        <Construction className="size-8" />
        <p className="font-medium text-foreground">Coming in Phase {phase}</p>
        <p className="max-w-md text-sm">{summary}</p>
      </div>
    </>
  );
}
