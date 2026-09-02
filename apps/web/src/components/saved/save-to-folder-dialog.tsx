"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Check, Folder, FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { FolderTreeNode } from "@/components/folders/folder-tree";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";

type FlatFolder = { id: string; name: string; depth: number };

function flatten(nodes: FolderTreeNode[], depth = 0): FlatFolder[] {
  return nodes.flatMap((n) => [
    { id: n.id, name: n.name, depth },
    ...flatten(n.children, depth + 1),
  ]);
}

/**
 * "Save to folder" — fetches the user's tree on open, lets them pick a
 * folder (or create one inline), add a note, and POSTs /api/saved.
 */
export function SaveToFolderButton({
  itemType,
  itemId,
  label,
  size = "default",
  variant = "outline",
}: {
  itemType: "STORE" | "AD";
  itemId: string;
  /** Display name used in toasts. */
  label: string;
  size?: "default" | "sm";
  variant?: "outline" | "secondary" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [folders, setFolders] = React.useState<FlatFolder[] | null>(null);
  const [savedIn, setSavedIn] = React.useState<Set<string>>(new Set());
  const [unauthorized, setUnauthorized] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const [newFolder, setNewFolder] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function load() {
    try {
      const [tree, saved] = await Promise.all([
        api<FolderTreeNode[]>("/api/folders/tree"),
        api<{ folderId: string }[]>(
          `/api/saved?itemType=${itemType}&itemId=${encodeURIComponent(itemId)}`,
        ),
      ]);
      const flat = flatten(tree);
      setFolders(flat);
      setSavedIn(new Set(saved.map((s) => s.folderId)));
      setSelected(
        (prev) => prev ?? flat.find((f) => !saved.some((s) => s.folderId === f.id))?.id ?? null,
      );
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 401) setUnauthorized(true);
      else toast.error(err instanceof Error ? err.message : "Could not load folders");
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && folders === null) void load();
  }

  async function createFolder() {
    const name = newFolder.trim();
    if (!name) return;
    setCreating(true);
    try {
      const folder = await api<{ id: string; name: string }>("/api/folders", {
        method: "POST",
        json: { name },
      });
      setFolders((prev) => [...(prev ?? []), { id: folder.id, name: folder.name, depth: 0 }]);
      setSelected(folder.id);
      setNewFolder("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create folder");
    } finally {
      setCreating(false);
    }
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await api("/api/saved", {
        method: "POST",
        json: { itemType, itemId, folderId: selected, notes: notes.trim() || null },
      });
      const folderName = folders?.find((f) => f.id === selected)?.name ?? "folder";
      toast.success(`Saved "${label}" to ${folderName}`);
      setSavedIn((prev) => new Set(prev).add(selected));
      setOpen(false);
      setNotes("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const alreadySaved = savedIn.size > 0;

  return (
    <>
      <Button variant={variant} size={size} onClick={() => onOpenChange(true)}>
        {alreadySaved ? <BookmarkCheck /> : <Bookmark />}
        {alreadySaved ? "Saved" : "Save to folder"}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save to folder</DialogTitle>
            <DialogDescription className="truncate">{label}</DialogDescription>
          </DialogHeader>

          {unauthorized ? (
            <div className="flex flex-col items-start gap-3 text-sm">
              <p className="text-muted-foreground">Sign in to save stores and ads into folders.</p>
              <Button asChild size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          ) : folders === null ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div
                role="radiogroup"
                aria-label="Folder"
                className="max-h-56 overflow-y-auto rounded-md border p-1"
              >
                {folders.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    No folders yet. Create one below.
                  </p>
                ) : (
                  folders.map((f) => {
                    const inFolder = savedIn.has(f.id);
                    const isSelected = selected === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        disabled={inFolder}
                        onClick={() => setSelected(f.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60",
                          isSelected && "bg-accent",
                        )}
                        style={{ paddingLeft: 8 + f.depth * 14 }}
                      >
                        <Folder className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{f.name}</span>
                        {inFolder ? (
                          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                            <Check className="size-3.5" /> saved
                          </span>
                        ) : isSelected ? (
                          <Check className="ml-auto size-4" />
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createFolder();
                }}
              >
                <Input
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  placeholder="New folder name"
                  aria-label="New folder name"
                  maxLength={80}
                />
                <Button type="submit" variant="secondary" disabled={!newFolder.trim() || creating}>
                  {creating ? <Loader2 className="animate-spin" /> : <FolderPlus />}
                  Create
                </Button>
              </form>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                aria-label="Notes"
                maxLength={2000}
                rows={2}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>
          )}

          {!unauthorized ? (
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!selected || saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Bookmark />}
                Save
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
