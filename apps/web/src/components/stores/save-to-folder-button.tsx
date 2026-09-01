"use client";

import { Bookmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Placeholder until Phase 4 wires folders and saved items. Keeps the store
 * page layout final so only the handler changes later.
 */
export function SaveToFolderButton({
  itemType,
  itemId,
}: {
  itemType: "STORE" | "AD";
  itemId: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button variant="outline" disabled data-item-type={itemType} data-item-id={itemId}>
            <Bookmark />
            Save to folder
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Folders arrive in Phase 4</TooltipContent>
    </Tooltip>
  );
}
