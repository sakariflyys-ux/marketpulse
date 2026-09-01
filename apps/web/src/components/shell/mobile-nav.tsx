"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { NAV_ITEMS } from "./nav-items";

/** Bottom tab bar for small screens; the sidebar is hidden below `md`. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background md:hidden"
      aria-label="Primary"
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground",
              active && "text-foreground",
            )}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
