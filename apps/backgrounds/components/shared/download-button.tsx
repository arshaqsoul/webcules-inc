"use client";

import { useState } from "react";
import { Download, Loader2, Archive } from "lucide-react";
import { Button } from "@webcules/ui/components/button";
import {
  createCollectionZip,
  getImageDownloadData,
} from "@/lib/actions/zip-download-actions";

interface DownloadButtonProps {
  downloadUrl?: string;
  filename: string;
  fileSize?: string;
  className?: string;
  type?: "single" | "collection";
  itemId?: string;
  userId?: string;
}

export function DownloadButton({
  downloadUrl,
  filename,
  fileSize,
  className = "",
  type = "single",
  itemId,
  userId,
}: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!userId || !itemId) return;

    setIsDownloading(true);

    try {
      if (type === "collection") {
        // Handle collection download (ZIP file) via server action
        const {
          zipBuffer,
          error,
          filename: zipFilename,
        } = await createCollectionZip(itemId, userId);

        if (error || !zipBuffer) {
          throw new Error(error || "Failed to create ZIP file");
        }

        // Create blob from buffer
        const blob = new Blob([zipBuffer], { type: "application/zip" });

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = zipFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        // Handle single image download - use server action to fetch file content
        if (!itemId || !userId) return;

        const {
          fileBuffer,
          error,
          filename: serverFilename,
        } = await getImageDownloadData(itemId, userId);

        if (error || !fileBuffer) {
          throw new Error(error || "Failed to get image data");
        }

        const blob = new Blob([fileBuffer]);
        const url = window.URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = serverFilename || filename;
        link.style.display = "none";

        // Trigger the download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      className={`rounded-lg text-white bg-white/20 w-full hover:border hover:border-black px-4 py-2 ${className}`}
      size={"lg"}
      onClick={handleDownload}
      disabled={
        isDownloading ||
        (!downloadUrl && type === "single") ||
        !userId ||
        !itemId
      }
    >
      <div className="flex flex-row w-full items-center justify-between">
        <div className="text-left">
          <span>
            {isDownloading
              ? "Downloading..."
              : type === "collection"
                ? "Download Collection"
                : "Download"}
          </span>
          {fileSize && <span className="text-gray-400 pl-2">{fileSize}</span>}
          {type === "collection" && (
            <span className="text-gray-400 text-xs pl-2">
              ZIP file with all images
            </span>
          )}
        </div>
        {isDownloading ? (
          <Loader2 className="animate-spin" />
        ) : type === "collection" ? (
          <Archive />
        ) : (
          <Download />
        )}
      </div>
    </Button>
  );
}
