"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDroppable } from "@dnd-kit/core";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { FolderNode } from "@marketpulse/db/services";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import type { Serialized } from "@/lib/serialize";
import { cn } from "@/lib/utils";

export type FolderTreeNode = Serialized<FolderNode>;

type Editing = { kind: "rename"; id: string } | { kind: "create"; parentId: string | null } | null;

const EXPANDED_KEY = "mp:folders:expanded";

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Notion-style folder tree for the sidebar: expand/collapse, inline rename,
 * nested create, delete, and drop targets for saved items.
 */
export function FolderTree({
  folders,
  collapsed,
}: {
  folders: FolderTreeNode[];
  collapsed: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [editing, setEditing] = React.useState<Editing>(null);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    // Expansion state is a per-browser convenience; localStorage is fine.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpanded(loadExpanded());
    setHydrated(true);
  }, []);

  const toggle = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const expand = React.useCallback((id: string) => {
    setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  async function commit(kind: Editing, value: string) {
    const name = value.trim();
    if (!kind) return;
    try {
      if (kind.kind === "rename") {
        if (!name) return;
        await api(`/api/folders/${kind.id}`, { method: "PATCH", json: { name } });
      } else {
        if (!name) return;
        await api("/api/folders", { method: "POST", json: { name, parentId: kind.parentId } });
        if (kind.parentId) expand(kind.parentId);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEditing(null);
    }
  }

  async function remove(node: FolderTreeNode) {
    const total = countItems(node);
    const ok = window.confirm(
      `Delete "${node.name}"${node.children.length ? ", its subfolders" : ""}${total ? ` and ${total} saved item${total === 1 ? "" : "s"}` : ""}?`,
    );
    if (!ok) return;
    try {
      await api(`/api/folders/${node.id}`, { method: "DELETE" });
      toast.success(`Deleted "${node.name}"`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete folder");
    }
  }

  if (collapsed) return null;

  return (
    <div className="flex flex-col gap-0.5 px-2" data-hydrated={hydrated}>
      <div className="flex items-center justify-between px-1 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <span>Folders</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label="New folder"
          onClick={() => setEditing({ kind: "create", parentId: null })}
        >
          <FolderPlus className="size-3.5" />
        </Button>
      </div>
      {folders.length === 0 && editing?.kind !== "create" ? (
        <p className="px-1 py-1 text-xs text-muted-foreground">No folders yet.</p>
      ) : null}
      {folders.map((node) => (
        <FolderRow
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          editing={editing}
          onToggle={toggle}
          onEdit={setEditing}
          onCommit={commit}
          onDelete={remove}
        />
      ))}
      {editing?.kind === "create" && editing.parentId === null ? (
        <InlineInput
          depth={0}
          placeholder="Folder name"
          onCommit={(v) => commit(editing, v)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function countItems(node: FolderTreeNode): number {
  return node.savedCount + node.children.reduce((n, c) => n + countItems(c), 0);
}

function FolderRow({
  node,
  depth,
  expanded,
  editing,
  onToggle,
  onEdit,
  onCommit,
  onDelete,
}: {
  node: FolderTreeNode;
  depth: number;
  expanded: Set<string>;
  editing: Editing;
  onToggle: (id: string) => void;
  onEdit: (e: Editing) => void;
  onCommit: (e: Editing, value: string) => void;
  onDelete: (node: FolderTreeNode) => void;
}) {
  const params = useSearchParams();
  const isActive = params.get("folder") === node.id;
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const { isOver, setNodeRef } = useDroppable({
    id: `folder:${node.id}`,
    data: { folderId: node.id },
  });
  const [menuOpen, setMenuOpen] = React.useState(false);

  if (editing?.kind === "rename" && editing.id === node.id) {
    return (
      <InlineInput
        depth={depth}
        defaultValue={node.name}
        onCommit={(v) => onCommit(editing, v)}
        onCancel={() => onEdit(null)}
      />
    );
  }

  return (
    <>
      <div
        ref={setNodeRef}
        className={cn(
          "group/row flex h-8 items-center gap-1 rounded-md pr-1 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
          isOver && "bg-sidebar-accent ring-2 ring-ring/60",
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          aria-label={isOpen ? "Collapse" : "Expand"}
          aria-expanded={isOpen}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground",
            !hasChildren && "invisible",
          )}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
        </button>
        <Link
          href={`/saved?folder=${node.id}`}
          onDoubleClick={(e) => {
            e.preventDefault();
            onEdit({ kind: "rename", id: node.id });
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5"
          aria-current={isActive ? "page" : undefined}
        >
          {isOpen && hasChildren ? (
            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{node.name}</span>
          {node.savedCount > 0 ? (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {node.savedCount}
            </span>
          ) : null}
        </Link>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${node.name}`}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100",
                menuOpen && "opacity-100",
              )}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem
              onSelect={() => {
                onEdit({ kind: "create", parentId: node.id });
                onToggle(node.id);
              }}
            >
              <FolderPlus />
              New subfolder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEdit({ kind: "rename", id: node.id })}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(node)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {editing?.kind === "create" && editing.parentId === node.id ? (
        <InlineInput
          depth={depth + 1}
          placeholder="Subfolder name"
          onCommit={(v) => onCommit(editing, v)}
          onCancel={() => onEdit(null)}
        />
      ) : null}
      {(isOpen || (editing?.kind === "create" && editing.parentId === node.id)) &&
        node.children.map((child) => (
          <FolderRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            editing={editing}
            onToggle={onToggle}
            onEdit={onEdit}
            onCommit={onCommit}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

function InlineInput({
  depth,
  defaultValue = "",
  placeholder,
  onCommit,
  onCancel,
}: {
  depth: number;
  defaultValue?: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState(defaultValue);
  const committed = React.useRef(false);
  const finish = () => {
    if (committed.current) return;
    committed.current = true;
    if (value.trim() && value.trim() !== defaultValue) onCommit(value);
    else onCancel();
  };
  return (
    <div className="py-0.5" style={{ paddingLeft: 4 + depth * 14 + 20 }}>
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        maxLength={80}
        aria-label={placeholder ?? "Folder name"}
        onChange={(e) => setValue(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish();
          if (e.key === "Escape") {
            committed.current = true;
            onCancel();
          }
        }}
        className="h-7 text-sm"
      />
    </div>
  );
}
