import type { Metadata } from "next";

import { SavedConfigs } from "@/components/dashboard/saved-configs";

export const metadata: Metadata = {
  title: "Your components — Webcules",
  description:
    "Your saved playground configs — every save keeps its exact prop values.",
};

export default function DashboardPage() {
  return (
    <div className="dark mx-auto w-full max-w-[85rem] px-4 pb-28 pt-24 sm:px-6 lg:px-8">
      <SavedConfigs />
    </div>
  );
}
