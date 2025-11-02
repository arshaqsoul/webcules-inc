import { checkUserAuth } from "@/lib/actions/auth-actions";
import {
  fetchCollectionImageId,
  ImagePageData,
} from "@/lib/actions/bg-image-actions";
import { createStripeCheckoutSession } from "@/lib/actions/checkout-actions";
import { fetchCollectionId } from "@/lib/actions/collection-actions";
import { BackgroundCollection } from "@webcules/payload/payload-types";
import { redirect } from "next/navigation";

type CheckoutType = "subscription" | "backgroundCollection" | "backgroundImage";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: CheckoutType }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const { item: itemId } = await searchParams;
  const { type } = await params;

  // Data containers for fetched item details
  let itemDoc: ImagePageData | BackgroundCollection | undefined;
  let title = "Checkout";
  let description = "Complete your purchase to unlock exclusive content.";
  let price = 0;

  if (type === "backgroundCollection" && itemId) {
    const collectionDoc = await fetchCollectionId(itemId);
    itemDoc = collectionDoc;
    title = collectionDoc
      ? `Purchase: ${collectionDoc.title}`
      : "Collection Not Found";
    description = collectionDoc
      ? `You are purchasing the entire collection for $${collectionDoc.collectionPrice.toFixed(2)}.`
      : "The collection ID provided is invalid or missing.";
    price = collectionDoc?.collectionPrice || 0;
  } else if (type === "backgroundImage" && itemId) {
    const imageDoc = await fetchCollectionImageId(itemId);
    itemDoc = imageDoc;
    title = imageDoc ? `Purchase: ${imageDoc.filename}` : "Image Not Found";
    description = imageDoc
      ? `You are purchasing this single image for $${imageDoc.singleImagePrice.toFixed(2)}.`
      : "The image ID provided is invalid or missing.";
    price = imageDoc?.singleImagePrice || 0;
  } else if (type === "subscription") {
    title = "All Access Subscription";
    description =
      "Gain unlimited access to all current and future content for a low monthly fee.";
    price = 9.99;
  }

  const { user } = await checkUserAuth();
  if (!user) {
    redirect(`/signin`);
  }
  const checkoutResult = await createStripeCheckoutSession(type, itemDoc, user);

  if (checkoutResult.error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Error: {checkoutResult.error}</p>
      </div>
    );
  }

  if (checkoutResult.url) {
    redirect(checkoutResult.url);
  }

  return (
    <div className="text-center py-12">
      <p className="text-destructive">
        Error: Failed to get Stripe checkout URL.
      </p>
    </div>
  );
}
