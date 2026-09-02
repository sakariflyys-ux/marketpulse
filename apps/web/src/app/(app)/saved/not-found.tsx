import Link from "next/link";
import { FolderX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function FolderNotFound() {
  return (
    <EmptyState icon={FolderX} title="Folder not found" description="It may have been deleted.">
      <Button asChild variant="outline" size="sm">
        <Link href="/saved">All saved items</Link>
      </Button>
    </EmptyState>
  );
}
