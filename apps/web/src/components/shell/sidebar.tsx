"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { NAV_ITEMS } from "./nav-items";

export const SIDEBAR_COOKIE = "mp:sidebar";
export const SIDEBAR_WIDTH = 280;
export const SIDEBAR_WIDTH_COLLAPSED = 64;

type SidebarContextValue = { collapsed: boolean; toggle: () => void };
const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within <SidebarProvider>");
  return ctx;
}

export function SidebarProvider({
  defaultCollapsed,
  children,
}: {
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      // Persisted in a cookie (not localStorage) so the server can render the
      // correct width on first paint and avoid a layout shift.
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ collapsed, toggle }), [collapsed, toggle]);

  return (
    <SidebarContext.Provider value={value}>
      <div
        className="flex min-h-svh w-full"
        style={
          {
            "--sidebar-width": `${collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH}px`,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();

  return (
    <aside
      data-collapsed={collapsed}
      className="sticky top-0 hidden h-svh w-(--sidebar-width) shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out md:flex"
    >
      <div className={cn("flex h-14 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold"
          aria-label="MarketPulse home"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Activity className="size-4" />
          </span>
          {!collapsed ? <span className="truncate text-base">MarketPulse</span> : null}
        </Link>
      </div>
      <Separator className="bg-sidebar-border" />

      <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const link = (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent text-sidebar-accent-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed ? (
                <>
                  <span className="truncate">{item.label}</span>
                  {item.phase ? (
                    <span className="ml-auto text-[10px] tracking-wide text-muted-foreground uppercase">
                      Phase {item.phase}
                    </span>
                  ) : null}
                </>
              ) : null}
            </Link>
          );

          if (!collapsed) return link;
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <Separator className="bg-sidebar-border" />
      <div className={cn("flex p-2", collapsed ? "justify-center" : "justify-end")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? "Expand" : "Collapse"}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
