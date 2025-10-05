import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import CollectionGrid from "../collections-grid";
import { Button } from "@webcules/ui/components/button";
import { fetchCollectionId } from "@/lib/actions/collection-actions";
import { BackgroundMedia } from "@webcules/payload/payload-types";
import { Metadata } from "next";
import { generateMeta } from "@webcules/payload/utilities/generateMeta";

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
  const { id: collectionId } = await params;
  const collection = await fetchCollectionId(collectionId);
  const imagesToDisplay: BackgroundMedia[] = Array.isArray(
    collection.backgrounds.highResFile
  )
    ? (collection.backgrounds.highResFile as BackgroundMedia[])
    : [];
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
            <Button className="p-[3px] relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />
              <div
                className={`px-4 py-2 text-sm rounded-full relative group transition duration-200 bg-black text-white hover:text-white/50 hover:bg-transparent'
        }`}
              >
                Buy whole collection for ${collection.collectionPrice ?? "0"}
              </div>
            </Button>
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
