import { Media } from "@webcules/payload/components/Media";
import type {
  BackgroundCollection,
  BackgroundMedia,
} from "@webcules/payload/payload-types"; // ADJUST THIS PATH
import { ArrowRight, Lock, Download } from "lucide-react";
import Link from "next/link";

// Define a union type for the documents the grid can display
type GridDocument = BackgroundCollection | BackgroundMedia;

export default async function CollectionGrid({
  documents,
}: {
  documents: GridDocument[];
}) {
  return (
    <div className="grid grid-col-1 md:grid-cols-2 lg:grid-cols-3 pt-8 gap-4">
      {documents.map((doc) => {
        // --- Shared Logic ---
        const isCollection = "title" in doc;
        const id = doc.id;

        // --- Collection-Specific Logic ---
        const collectionTitle = isCollection ? doc.title : "";
        const relatedImagesCount = isCollection
          ? Array.isArray(doc.backgrounds.highResFile)
            ? doc.backgrounds.highResFile.length
            : 0
          : 0;
        const lowResPreview = isCollection
          ? Array.isArray(doc.backgrounds.lowResPreview)
            ? doc.backgrounds.lowResPreview
            : undefined
          : undefined;
        // The cover image is the first low-res preview for a collection.
        // For individual media, the cover is the media document itself.
        const coverImageResource = isCollection
          ? lowResPreview && typeof lowResPreview === "object"
            ? lowResPreview[0] // First low-res preview in the array
            : "/placeholder.jpg"
          : doc; // The BackgroundMedia document is the resource itself

        const isPremium = isCollection
          ? (doc.collectionPrice ?? 0) > 0
          : (doc.singleImagePrice ?? 0) > 0;

        const linkUrl = isCollection
          ? `/collection/${doc.id}`
          : `/image/${doc.id}`; // Assuming a different link for individual images

        // --- Image-Specific Logic ---
        const imageAltText = !isCollection
          ? doc.alt || doc.filename
          : collectionTitle;

        return (
          <Link
            key={id}
            href={linkUrl}
            className="group" // Add a group class for hover effects
          >
            <div className="flex flex-col relative items-start justify-end h-64 w-full rounded-xl border-white/20 border-[0.25px] hover:border-white/40 hover:border-1 hover:brightness-[.8] overflow-clip transition-all duration-300">
              <div className="z-20 p-6 w-full flex flex-row items-center justify-between">
                <div className="flex flex-col">
                  {/* Title/Filename */}
                  <p className="text-xl md:text-2xl text-white line-clamp-1">
                    {isCollection
                      ? collectionTitle
                      : doc.filename?.split(".")[0]}
                  </p>

                  {/* Subtext */}
                  {isCollection && relatedImagesCount > 0 ? (
                    <p className="text-md text-gray-400">
                      {relatedImagesCount} images in collection
                    </p>
                  ) : !isCollection ? (
                    <p className="text-md text-gray-400">
                      {doc.singleImagePrice === 0
                        ? "Free Image"
                        : `$ ${doc.singleImagePrice} (USD)`}
                    </p>
                  ) : null}
                </div>

                {/* Icon for Action */}
                {isCollection ? (
                  <ArrowRight
                    size={40}
                    className="text-gray-400 bg-black/40 rounded-full border border-gray-400 group-hover:text-white group-hover:border-white p-2 transition-all duration-300"
                  />
                ) : (
                  <Download
                    size={36}
                    className="text-gray-400 bg-black/40 rounded-full border border-gray-400 group-hover:text-white group-hover:border-white p-2 transition-all duration-300"
                  />
                )}
              </div>

              <div className="bg-gradient-to-t from-black/80 to-transparent absolute w-full h-full z-10 flex items-start">
                {/* Show the lock icon if the document is premium/paid */}
                {isPremium && (
                  <Lock size={16} className="mx-4 my-4 text-white" />
                )}
              </div>

              {/* Image Component */}
              {coverImageResource && (
                <Media
                  resource={coverImageResource}
                  alt={isCollection ? collectionTitle : "" + imageAltText}
                  fill
                  size="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  imgClassName="bg-black object-cover transition-transform duration-500 group-hover:scale-105" // Added zoom effect
                  quality={50}
                />
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
