import type { Metadata } from "next";
import { getServerSideURL } from "./getURL";

const defaultOpenGraph: Metadata["openGraph"] = {
  type: "website",
  description:
    "Discover comprehensive digital solutions at Webcules. We specialize in custom software development, data engineering, and UI/UX design. Our expert team delivers innovative and scalable solutions tailored to your business needs. Turn your digital vision into reality with Webcules. Contact us today to elevate your business with cutting-edge technology.",
  images: [
    {
      url: `${getServerSideURL()}/opengraph-image.png`,
    },
  ],
  siteName: "Webcules",
  title: "Webcules | Custom Software Dev, Design & Data Engineering",
};

export const mergeOpenGraph = (
  og?: Metadata["openGraph"]
): Metadata["openGraph"] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  };
};
