import { Metadata } from "next";
import About from "./about.mdx";
import { mergeOpenGraph } from "@webcules/payload/utilities/mergeOpenGraph";
export default function AboutPage() {
  return (
    <div className="overflow-x-hidden relative flex flex-col items-center justify-between">
      <div className="prose lg:max-w-[85rem] h-fit lg:px-16 w-full flex flex-col px-4 py-20 mt-20 text-white">
        <About />
      </div>
    </div>
  );
}

export const metadata: Metadata = {
  metadataBase: new URL(`${process.env.NEXT_PUBLIC_APP_URL}`),
  openGraph: mergeOpenGraph({
    title: "About Webcules Backgrounds | Where Creativity Inspires Creativity",
    description:
      "Learn about Webcules Backgrounds—where each backdrop is crafted with care, powered by AI, and curated by real artists. Support originality, empower your creative projects, and discover backgrounds that break the mold. Join a passionate community where your ideas—and visuals—truly stand out.",
    images: [
      {
        url: `${process.env.NEXT_PUBLIC_APP_URL}/opengraph-image.png`,
      },
    ],
  }),
  twitter: {
    card: "summary_large_image",
    creator: "@arshaq",
  },
};
