import {
  BackgroundCollection,
  BackgroundMedia,
  Purchase,
} from "@webcules/payload/payload-types";
import { Card, CardContent } from "@webcules/ui/components/card";
import { Badge } from "@webcules/ui/components/badge";
import { ShoppingBag, Calendar, CreditCard } from "lucide-react";
import { Media } from "@webcules/payload/components/Media";
import Link from "next/link";

interface PurchasesTabProps {
  purchases: Purchase[];
}

export function PurchasesTab({ purchases }: PurchasesTabProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)}`;
  };

  return (
    <div className="space-y-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <ShoppingBag className="h-6 w-6" />
          Your Purchases
        </h2>
        <Badge>{purchases.length} items</Badge>
      </div>

      {purchases.length === 0 ? (
        <Card className="bg-white/10 text-white border-none">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShoppingBag className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2 text-white">
              No purchases yet
            </h3>
            <p className="text-gray-500 text-center">
              When you purchase images or collections, they will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {purchases.map((purchase) => (
            <Link
              href={
                purchase.itemType === "media"
                  ? `/image/${(purchase.item?.value as BackgroundMedia).id}`
                  : `/collection/${(purchase.item?.value as BackgroundCollection)?.id}`
              }
              key={purchase.id}
            >
              <Card className="bg-white/10 text-white border-none">
                <CardContent className="px-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="size-18 bg-blue-100 rounded-lg">
                        <Media
                          fill
                          className="relative size-18 object-cover"
                          resource={
                            purchase.itemType === "media"
                              ? (purchase.item?.value as BackgroundMedia)
                              : (purchase.item?.value as BackgroundCollection)
                                  ?.backgrounds.lowResPreview[0]
                          }
                        />
                      </div>
                      <div>
                        <h3 className="font-medium">
                          {purchase.itemType === "media"
                            ? (purchase.item?.value as BackgroundMedia)
                                ?.filename
                            : (purchase.item?.value as BackgroundCollection)
                                ?.title}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {purchase.itemType === "media"
                            ? "Single Image"
                            : "Collection"}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(purchase.createdAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <CreditCard className="h-3 w-3" />
                            {formatPrice(purchase.price)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge>
                      {purchase.itemType === "media" ? "Image" : "Collection"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
