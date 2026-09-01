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
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/ads", label: "Ad Library", icon: Megaphone },
  { href: "/saved", label: "Saved", icon: Bookmark, phase: 4 },
  { href: "/chat", label: "Chat", icon: MessageSquare, phase: 5 },
];
