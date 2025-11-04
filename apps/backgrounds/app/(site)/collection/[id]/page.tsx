import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import CollectionGrid from "../collections-grid";
import { fetchCollectionId } from "@/lib/actions/collection-actions";
import { getUserPurchases } from "@/lib/actions/purchase-actions";
import {
  BackgroundCollection,
  BackgroundMedia,
} from "@webcules/payload/payload-types";
import { Metadata } from "next";
import { generateMeta } from "@webcules/payload/utilities/generateMeta";
import { CTAButton } from "@/components/shared/cta-button";
import { DownloadButton } from "@/components/shared/download-button";
import { checkUserAuth } from "@/lib/actions/auth-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: collectionId } = await params;
  const collection = await fetchCollectionId(collectionId);

  return generateMeta({ doc: collection });
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const authStatus = await checkUserAuth();
  const { id: collectionId } = await params;
  const collection = await fetchCollectionId(collectionId);
  const imagesToDisplay: BackgroundMedia[] = Array.isArray(
    collection.backgrounds.highResFile
  )
    ? (collection.backgrounds.highResFile as BackgroundMedia[])
    : [];

  // Check user's purchases and access
  let userPurchases = null;
  let canDownloadCollection = false;

  if (authStatus.user?.id) {
    userPurchases = await getUserPurchases(authStatus.user.id.toString());

    // User can download if they have active subscription OR purchased this collection
    // Purchased items remain accessible even after subscription ends
    canDownloadCollection =
      userPurchases.isPaid ||
      userPurchases.purchases.some(
        (purchase) =>
          purchase.itemType === "collection" &&
          purchase.item?.relationTo === "backgroundCollections" &&
          (purchase.item?.value as BackgroundCollection)?.id ===
            parseInt(collectionId)
      );
  }
  return (
    <div className="overflow-x-hidden relative flex flex-col items-center justify-between">
      <div className="lg:max-w-[85rem] h-fit lg:px-16 w-full flex flex-col px-4 py-20 mt-10">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="flex flex-row gap-x-4">
            <Link
              href={"/collection"}
              className="flex flex-row items-center whitespace-nowrap rounded-3xl bg-darkest text-sm text-gray-50 border-gray-700 hover:border-white/20 border px-4 py-2"
            >
              <ArrowLeft />
              Back
            </Link>
            {canDownloadCollection ? (
              <DownloadButton
                type="collection"
                filename={collection.title}
                userId={authStatus.user?.id.toString()}
                itemId={collectionId}
              />
            ) : (
              !authStatus.user?.isPaid && (
                <CTAButton
                  type="backgroundCollection"
                  price={collection.collectionPrice}
                  item={collection}
                />
              )
            )}
          </div>
          <h1 className="text-2xl md:text-5xl text-white">
            Collection/{collection.title}
          </h1>
        </div>
        <CollectionGrid documents={imagesToDisplay} />
      </div>
    </div>
  );
}
