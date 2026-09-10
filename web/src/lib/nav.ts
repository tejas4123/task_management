import {
  Building2,
  LayoutDashboard,
  Layers,
  ListChecks,
  Briefcase,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/api/types";
import { canSeeAllTasks, isAdmin } from "./roles";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Omitted means everyone sees it. */
  visible?: (role: Role) => boolean;
  /** Match the path exactly rather than by prefix. */
  exact?: boolean;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

/**
 * The navigation, filtered by role.
 *
 * "Clients" and "Services" are visible to everyone because every role may read
 * them - only writing is restricted, and that is handled on the page. "Users"
 * is the exception: the whole page is administration.
 */
export const NAV: NavSection[] = [
  {
    heading: "Work",
    items: [
      { label: "Dashboard", to: "/", icon: LayoutDashboard, exact: true },
      { label: "My tasks", to: "/tasks?mine=true", icon: ListChecks },
      {
        label: "All tasks",
        to: "/tasks",
        icon: Layers,
        visible: canSeeAllTasks,
      },
    ],
  },
  {
    heading: "Practice",
    items: [
      { label: "Engagements", to: "/engagements", icon: Briefcase },
      { label: "Clients", to: "/clients", icon: Building2 },
      { label: "Services", to: "/services", icon: Layers },
    ],
  },
  {
    heading: "Administration",
    items: [{ label: "Users", to: "/users", icon: Users, visible: isAdmin }],
  },
];

export function sectionsFor(role: Role): NavSection[] {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.visible?.(role) ?? true),
  })).filter((section) => section.items.length > 0);
}
