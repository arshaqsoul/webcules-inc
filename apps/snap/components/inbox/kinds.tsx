"use client";

/* Shared inbox kind metadata (WEB-306) — the icon map and type used by the
 * list rows, filter menu and command surfaces alike. */
import {
  Banknote,
  CalendarDays,
  FileText,
  Images,
  Mail,
  PackageCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type InboxKind = "email" | "booking" | "contract" | "invoice" | "gallery" | "order" | "lead";

export const KIND_ICON: Record<InboxKind, LucideIcon> = {
  email: Mail,
  booking: CalendarDays,
  contract: FileText,
  invoice: Banknote,
  gallery: Images,
  order: PackageCheck,
  lead: Users,
};
