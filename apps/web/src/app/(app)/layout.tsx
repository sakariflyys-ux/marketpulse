import { cookies } from "next/headers";
import { getFolderTree } from "@marketpulse/db/services";

import { auth } from "@/auth";
import { SavedDndProvider } from "@/components/saved/dnd-provider";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar, SIDEBAR_COOKIE, SidebarProvider } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { serialize } from "@/lib/serialize";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const defaultCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";
  const userId = session?.user?.id;
  // The folder tree is small and per-user; rendering it from the layout keeps
  // the sidebar in sync after every mutation via router.refresh().
  const folders = userId ? serialize(await getFolderTree(userId)) : null;

  return (
    <SidebarProvider defaultCollapsed={defaultCollapsed}>
      <SavedDndProvider>
        <Sidebar folders={folders} />
        <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
          <Topbar session={session} />
          <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
        </div>
        <MobileNav />
      </SavedDndProvider>
    </SidebarProvider>
  );
}
