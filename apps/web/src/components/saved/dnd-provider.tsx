"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";

import { api } from "@/lib/client-api";

export type DragSavedItem = { savedId: string; folderId: string; label: string };
export type DropFolder = { folderId: string };

/**
 * App-wide drag-and-drop context so a saved item on /saved can be dropped on
 * a folder in the sidebar. Draggables carry `{ savedId, folderId }`;
 * droppables carry `{ folderId }`. The drop issues PATCH /api/saved/:id.
 */
export function SavedDndProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [active, setActive] = React.useState<DragSavedItem | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  async function onDragEnd(event: DragEndEvent) {
    setActive(null);
    const item = event.active.data.current as DragSavedItem | undefined;
    const target = event.over?.data.current as DropFolder | undefined;
    if (!item || !target || target.folderId === item.folderId) return;
    try {
      await api(`/api/saved/${item.savedId}`, {
        method: "PATCH",
        json: { folderId: target.folderId },
      });
      toast.success(`Moved "${item.label}"`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move item");
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) =>
        setActive((e.active.data.current as DragSavedItem) ?? null)
      }
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg">
            {active.label}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
