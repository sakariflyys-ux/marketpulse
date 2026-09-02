import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Folder, LogIn } from "lucide-react";
import { folderPath, getFolderTree, listSaved, type FolderNode } from "@synergilon/db/services";

import { auth } from "@/auth";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SavedItems } from "@/components/saved/saved-items";
import { Button } from "@/components/ui/button";
import { serialize } from "@/lib/serialize";

export const metadata = { title: "Saved" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ folder?: string }>;

function findNode(tree: FolderNode[], id: string): FolderNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    const inner = findNode(n.children, id);
    if (inner) return inner;
  }
  return null;
}

export default async function SavedPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <>
        <PageHeader title="Saved" description="Your folders of stores and ads." />
        <EmptyState
          icon={LogIn}
          title="Sign in to see your saved items"
          description="Folders and saved items are tied to your account."
        >
          <Button asChild size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  const { folder: folderId } = await searchParams;
  const tree = await getFolderTree(userId);
  const current = folderId ? findNode(tree, folderId) : null;
  if (folderId && !current) notFound();

  const items = await listSaved(userId, { folderId: current?.id });
  const path = current ? (folderPath(tree, current.id) ?? []) : [];
  const subfolders = current ? current.children : tree;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={current ? current.name : "All saved items"}
        description={
          current
            ? `${items.length} item${items.length === 1 ? "" : "s"} in this folder`
            : `${items.length} item${items.length === 1 ? "" : "s"} across ${countFolders(tree)} folder${countFolders(tree) === 1 ? "" : "s"}`
        }
      />

      {current ? (
        <nav
          aria-label="Breadcrumb"
          className="-mt-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        >
          <Link href="/saved" className="hover:text-foreground">
            All
          </Link>
          {path.map((name, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-3.5" />
              <span className={i === path.length - 1 ? "text-foreground" : undefined}>{name}</span>
            </span>
          ))}
        </nav>
      ) : null}

      {subfolders.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {subfolders.map((f) => (
            <Button key={f.id} asChild variant="outline" size="sm">
              <Link href={`/saved?folder=${f.id}`}>
                <Folder />
                {f.name}
                <span className="text-muted-foreground tabular-nums">{f.savedCount}</span>
              </Link>
            </Button>
          ))}
        </div>
      ) : null}

      <SavedItems items={serialize(items)} folders={serialize(tree)} />
    </div>
  );
}

function countFolders(tree: FolderNode[]): number {
  return tree.reduce((n, f) => n + 1 + countFolders(f.children), 0);
}
