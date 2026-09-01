import { AdsTableSkeleton } from "@/components/ads/ads-table";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
      </div>
      <AdsTableSkeleton />
    </div>
  );
}
