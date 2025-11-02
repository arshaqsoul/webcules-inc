import { cn } from "@webcules/ui/lib/utils";
import {
  BackgroundCollection,
  BackgroundMedia,
} from "@webcules/payload/payload-types";
import Link from "next/link";

interface CTAButtonProps {
  type: "backgroundCollection" | "backgroundImage" | "subscription";
  item?: BackgroundCollection | BackgroundMedia;
  price?: number | string;
  className?: string;
  children?: React.ReactNode;
}

export const CTAButton: React.FC<CTAButtonProps> = ({
  type,
  item,
  price,
  className,
  children,
  ...props
}) => {
  const config = {
    subscription: {
      classes:
        "bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:brightness-110 shadow-indigo-500/50",
      defaultText: "Unlock with all access",
    },
    backgroundImage: {
      classes:
        "bg-white/20 text-white hover:bg-white/30 border border-white/20 backdrop-blur-sm",
      defaultText: `Buy now ${price ? `$${price}` : ""}`,
    },
    backgroundCollection: {
      classes:
        "bg-white/20 text-white hover:bg-white/30 border border-white/20 backdrop-blur-sm",
      defaultText: `Buy whole collection for ${price ? `$${price}` : ""}`,
    },
  }[type];

  const finalClassName = cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive h-9 px-4 py-2 rounded-full w-full sm:flex-1 transition-all duration-200 shadow-lg",
    config.classes,
    className
  );
  const checkoutPath =
    item && item.id ? `/checkout/${type}?item=${item.id}` : `/checkout/${type}`;

  return (
    <Link className={finalClassName} {...props} href={checkoutPath}>
      {children || config.defaultText}
    </Link>
  );
};
