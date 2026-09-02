"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { Bookmark, FolderInput, GripVertical, Loader2, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { SavedItemWithRef } from "@synergilon/db/services";

import { PlatformBadge } from "@/components/ads/platform-badge";
import { EmptyState } from "@/components/empty-state";
import type { FolderTreeNode } from "@/components/folders/folder-tree";
import { StoreLogo } from "@/components/stores/store-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Serialized } from "@/lib/serialize";
import { cn } from "@/lib/utils";

export type SavedItemData = Serialized<SavedItemWithRef>;

type FlatFolder = { id: string; name: string; depth: number };
function flatten(nodes: FolderTreeNode[], depth = 0): FlatFolder[] {
  return nodes.flatMap((n) => [
    { id: n.id, name: n.name, depth },
    ...flatten(n.children, depth + 1),
  ]);
}

function itemLabel(item: SavedItemData): string {
  if (!item.item) return item.itemType === "STORE" ? "Deleted store" : "Deleted ad";
  return item.itemType === "STORE" ? item.item.name : item.item.headline;
}

export function SavedItems({
  items,
  folders,
}: {
  items: SavedItemData[];
  folders: FolderTreeNode[];
}) {
  const flat = React.useMemo(() => flatten(folders), [folders]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title="Nothing saved here yet"
        description="Use “Save to folder” on any store or ad, or drag saved items onto a folder in the sidebar."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/discover">Browse stores</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <SavedCard key={item.id} item={item} folders={flat} />
      ))}
    </div>
  );
}

function SavedCard({ item, folders }: { item: SavedItemData; folders: FlatFolder[] }) {
  const router = useRouter();
  const label = itemLabel(item);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `saved:${item.id}`,
    data: { savedId: item.id, folderId: item.folderId, label },
  });
  const [busy, setBusy] = React.useState(false);
  const [notesOpen, setNotesOpen] = React.useState(false);

  async function move(folderId: string) {
    if (folderId === item.folderId) return;
    setBusy(true);
    try {
      await api(`/api/saved/${item.id}`, { method: "PATCH", json: { folderId } });
      toast.success(`Moved "${label}"`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/saved/${item.id}`, { method: "DELETE" });
      toast.success(`Removed "${label}"`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
      setBusy(false);
    }
  }

  return (
    <Card
      ref={setNodeRef}
      className={cn("gap-3 px-4 py-4", isDragging && "opacity-40")}
      data-testid="saved-item"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`Drag "${label}" to a folder`}
          className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <ItemBody item={item} />
      </div>
      {item.notes ? (
        <p className="border-l-2 pl-3 text-sm whitespace-pre-wrap text-muted-foreground">
          {item.notes}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Select onValueChange={move} disabled={busy}>
          <SelectTrigger size="sm" className="w-40" aria-label="Move to folder">
            <FolderInput className="size-3.5" />
            <SelectValue placeholder="Move to…" />
          </SelectTrigger>
          <SelectContent>
            {folders.map((f) => (
              <SelectItem key={f.id} value={f.id} disabled={f.id === item.folderId}>
                <span style={{ paddingLeft: f.depth * 10 }}>{f.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setNotesOpen(true)} disabled={busy}>
          <StickyNote />
          {item.notes ? "Edit note" : "Add note"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-destructive"
          onClick={remove}
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Remove
        </Button>
        <span className="w-full text-xs text-muted-foreground">
          Saved {formatDate(item.createdAt)}
        </span>
      </div>
      <NotesDialog item={item} open={notesOpen} onOpenChange={setNotesOpen} />
    </Card>
  );
}

function ItemBody({ item }: { item: SavedItemData }) {
  if (!item.item) {
    return (
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">
          This {item.itemType === "STORE" ? "store" : "ad"} is no longer available.
        </p>
      </div>
    );
  }
  if (item.itemType === "STORE") {
    const s = item.item;
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <StoreLogo src={s.logo} name={s.name} size={36} />
        <div className="min-w-0">
          <Link
            href={`/store/${encodeURIComponent(s.shopifyDomain)}`}
            className="block truncate font-medium hover:underline"
          >
            {s.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {s.shopifyDomain} · {formatCurrency(s.monthlyRevenue)}/mo
          </p>
          <Badge variant="secondary" className="mt-1">
            {s.category}
          </Badge>
        </div>
      </div>
    );
  }
  const a = item.item;
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
        <Image src={a.creativeUrl} alt="" fill sizes="48px" className="object-cover" unoptimized />
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 font-medium">{a.headline}</p>
        <p className="truncate text-xs text-muted-foreground">
          <Link
            href={`/store/${encodeURIComponent(a.store.shopifyDomain)}`}
            className="hover:underline"
          >
            {a.store.name}
          </Link>{" "}
          · {a.engagementRate.toFixed(1)}% eng · {formatCurrency(a.spendEstimate)}
        </p>
        <PlatformBadge platform={a.platform} className="mt-1" />
      </div>
    </div>
  );
}

function NotesDialog({
  item,
  open,
  onOpenChange,
}: {
  item: SavedItemData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(item.notes ?? "");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      await api(`/api/saved/${item.id}`, {
        method: "PATCH",
        json: { notes: value.trim() || null },
      });
      toast.success("Note saved");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notes</DialogTitle>
          <DialogDescription className="truncate">{itemLabel(item)}</DialogDescription>
        </DialogHeader>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={5}
          maxLength={2000}
          autoFocus
          aria-label="Notes"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          placeholder="Why is this worth tracking?"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
