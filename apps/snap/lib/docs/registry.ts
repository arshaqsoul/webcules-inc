/* Snap docs — content registry (server only).
 * Maps every slug in lib/docs/nav.ts to its content module. The docs route
 * imports just the one page it renders; the search + markdown APIs import
 * the whole map on demand. Content modules are sync server components so
 * lib/docs/extract.tsx can walk their element tree for TOC/search/markdown. */
import type { ComponentType } from "react";

import StartGuide from "./content/start-guide";
import Concepts from "./content/concepts";
import Security from "./content/security";
import Notifications from "./content/notifications";
import Leads from "./content/leads";
import BookingPage from "./content/booking-page";
import Calendar from "./content/calendar";
import Bookings from "./content/bookings";
import Projects from "./content/projects";
import ProjectHub from "./content/project-hub";
import Contracts from "./content/contracts";
import GalleryDelivery from "./content/gallery-delivery";
import GalleryDesign from "./content/gallery-design";
import Video from "./content/video";
import Protection from "./content/protection";
import BillingPlans from "./content/billing-plans";
import Billing from "./content/billing";
import Payments from "./content/payments";
import Transactions from "./content/transactions";
import Payouts from "./content/payouts";
import ClientPortal from "./content/client-portal";
import Brand from "./content/brand";
import Domains from "./content/domains";
import Embeds from "./content/embeds";
import RawVault from "./content/raw-vault";
import Storage from "./content/storage";
import Templates from "./content/templates";
import Releases from "./content/releases";

export const DOC_CONTENT: Record<string, ComponentType> = {
  "start-guide": StartGuide,
  concepts: Concepts,
  security: Security,
  notifications: Notifications,
  leads: Leads,
  "booking-page": BookingPage,
  calendar: Calendar,
  bookings: Bookings,
  projects: Projects,
  "project-hub": ProjectHub,
  contracts: Contracts,
  "gallery-delivery": GalleryDelivery,
  "gallery-design": GalleryDesign,
  video: Video,
  protection: Protection,
  "billing-plans": BillingPlans,
  billing: Billing,
  payments: Payments,
  transactions: Transactions,
  payouts: Payouts,
  "client-portal": ClientPortal,
  brand: Brand,
  domains: Domains,
  embeds: Embeds,
  "raw-vault": RawVault,
  storage: Storage,
  templates: Templates,
  releases: Releases,
};

export function getDocContent(slug: string): ComponentType | null {
  return DOC_CONTENT[slug] ?? null;
}
