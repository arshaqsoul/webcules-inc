import { redirect } from "next/navigation";
import { checkUserAuth } from "@/lib/actions/auth-actions";
import { getUserPurchases } from "@/lib/actions/purchase-actions";
import { cancelSubscription } from "@/lib/actions/checkout-actions";
import { getPayload } from "payload";
import config from "@webcules/payload/payload-config";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardContainer } from "@/components/dashboard/dashboard-container";
import LogoutButton from "@/components/shared/logout-btn";
import { revalidatePath } from "next/cache";

export default async function DashboardPage() {
  const authStatus = await checkUserAuth();
  if (!authStatus.user) redirect("/signin");

  // Get user's purchases
  const { purchases } = await getUserPurchases(authStatus.user.id.toString());

  // Get user's download history
  const payload = await getPayload({ config });
  const downloadHistoryQuery = await payload.find({
    collection: "download-history",
    where: {
      user: { equals: authStatus.user.id },
    },
    sort: "-downloadedAt",
  });
  const downloadHistory = downloadHistoryQuery.docs;

  // Handle subscription cancellation
  async function handleCancelSubscription() {
    "use server";

    if (!authStatus.user) redirect("/signin");

    // Use the checkout action to cancel subscription in Stripe
    const result = await cancelSubscription(authStatus.user).then(
      revalidatePath("/")
    );

    return result;
  }

  return (
    <div className="overflow-x-hidden relative flex flex-col items-center justify-between">
      <div className="lg:max-w-[85rem] h-fit lg:px-16 w-full flex flex-col px-4 py-20 mt-10">
        <div className="flex flex-row items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href={"/"}
              className="flex flex-row items-center whitespace-nowrap rounded-3xl bg-darkest text-sm text-gray-50 border-gray-700 hover:border-white/20 border px-4 py-2"
            >
              <ArrowLeft />
              Back
            </Link>
            <LogoutButton />
          </div>
          <h1 className="text-2xl md:text-5xl text-white">Dashboard</h1>
        </div>

        <DashboardContainer
          user={authStatus.user}
          purchases={purchases}
          downloadHistory={downloadHistory}
          onCancelSubscription={handleCancelSubscription}
        />
      </div>
    </div>
  );
}
