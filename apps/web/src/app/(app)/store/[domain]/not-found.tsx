import Link from "next/link";
import { Store } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function StoreNotFound() {
  return (
    <EmptyState
      icon={Store}
      title="Store not found"
      description="We don't track a store with that domain."
    >
      <Button asChild variant="outline" size="sm">
        <Link href="/discover">Back to Discover</Link>
      </Button>
    </EmptyState>
  );
}
