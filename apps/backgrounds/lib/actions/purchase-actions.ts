import { getPayload } from "payload";
import config from "@webcules/payload/payload-config";
import type { Purchase, User } from "@webcules/payload/payload-types";

export async function getUserPurchases(userId: string): Promise<{
  purchases: Purchase[];
  isPaid: boolean;
  subscriptionStatus: string;
}> {
  const payload = await getPayload({ config });

  try {
    // Get user info first
    const userQuery = await payload.find({
      collection: "users",
      where: {
        id: { equals: userId },
      },
      depth: 0,
    });

    const user = userQuery.docs[0] as User;

    // Get user's purchases
    const { docs } = await payload.find({
      collection: "purchases",
      where: {
        user: { equals: userId },
      },
      depth: 2, // Get related item data
      sort: "-createdAt",
    });

    return {
      purchases: docs as Purchase[],
      isPaid: user?.isPaid || false,
      subscriptionStatus: user?.subscriptionStatus || "none",
    };
  } catch (error) {
    console.error("Error fetching user purchases:", error);
    return {
      purchases: [],
      isPaid: false,
      subscriptionStatus: "none",
    };
  }
}
