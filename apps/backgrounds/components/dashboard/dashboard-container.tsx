"use client";

import { useState } from "react";
import {
  User,
  DownloadHistory,
  Purchase,
} from "@webcules/payload/payload-types";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@webcules/ui/components/tabs";
import { ProfileTab } from "./profile-tab";
import { PurchasesTab } from "./purchases-tab";

interface DashboardContainerProps {
  user: User;
  purchases: Purchase[];
  downloadHistory: DownloadHistory[];
  onCancelSubscription: () => Promise<{
    success: boolean;
    error: string | null;
  }>;
}

export function DashboardContainer({
  user,
  purchases,
  onCancelSubscription,
}: DashboardContainerProps) {
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    try {
      await onCancelSubscription();
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="w-full gap-6">
      <Tabs
        defaultValue="profile"
        orientation="vertical"
        className="flex-row gap-4"
      >
        <TabsList className="h-full flex-col gap-2 bg-white/10 border-none">
          <TabsTrigger
            value="profile"
            className="justify-start w-full data-[state=inactive]:text-white"
          >
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="purchases"
            className="justify-start data-[state=inactive]:text-white"
          >
            Purchases
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="ml-6">
          <ProfileTab
            user={user}
            onCancelSubscription={handleCancelSubscription}
            isCancelling={isCancelling}
          />
        </TabsContent>

        <TabsContent value="purchases" className="ml-6">
          <PurchasesTab purchases={purchases} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
