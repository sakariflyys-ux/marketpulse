import {
  Bookmark,
  Compass,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Phase in which this page becomes functional; shown as a hint until then. */
  phase?: number;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Compass, phase: 3 },
  { href: "/ads", label: "Ad Library", icon: Megaphone, phase: 3 },
  { href: "/saved", label: "Saved", icon: Bookmark, phase: 4 },
  { href: "/chat", label: "Chat", icon: MessageSquare, phase: 5 },
];
