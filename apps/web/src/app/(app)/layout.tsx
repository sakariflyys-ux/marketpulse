import { cookies } from "next/headers";

import { auth } from "@/auth";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar, SIDEBAR_COOKIE, SidebarProvider } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const defaultCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <SidebarProvider defaultCollapsed={defaultCollapsed}>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <Topbar session={session} />
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
      <MobileNav />
    </SidebarProvider>
  );
}
