import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
      <Icon className="size-8" />
      <p className="font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-md text-sm">{description}</p> : null}
      {children}
    </div>
  );
}
