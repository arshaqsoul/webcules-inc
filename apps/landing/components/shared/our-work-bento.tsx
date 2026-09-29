import React from "react";
import {
  BentoGrid,
  BentoGridItem,
} from "@webcules/ui/components/ui/bento-grid";
import {
  Book,
  AppWindow,
  Bot,
  Forklift,
  Camera,
  Palette,
  Workflow,
  Aperture,
} from "lucide-react";
import Image from "next/image";
import { Righteous, Inter } from "next/font/google";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });
const inter = Inter({ subsets: ["latin"] });

export function OurWorkBento() {
  return (
    <BentoGrid className="w-full mx-auto">
      {items.map((item, i) => (
        <BentoGridItem
          key={i}
          title={item.title}
          description={item.description}
          header={item.header}
          icon={item.icon}
          className={i === 6 ? "md:col-span-2" : ""}
          fontClassName={righteous.className}
          descriptionClassName={inter.className}
        />
      ))}
    </BentoGrid>
  );
}
const Skeleton = ({ src, alt }: { src: string; alt: string }) => (
  <div className="flex flex-1 w-full h-full min-h-[12rem] relative rounded-3xl bg-radial-[at_top_right] from-fuchsia-600/40 via-transparent to-transparent">
    <Image
      src={src}
      fill
      alt={alt}
      className="mt-8 transition-all duration-500 scale-95 hover:scale-100"
      style={{
        objectFit: "contain",
        objectPosition: "top center",
      }}
    />
  </div>
);
const items = [
  {
    title: "Backgrounds — AI-generated backdrops",
    description:
      "A curated library of AI-crafted design backdrops for creatives — high-quality, ready-to-use visuals, unlockable per collection.",
    header: (
      <Skeleton
        src={"/imgs/work/backgrounds.webp"}
        alt="Backgrounds app by Webcules"
      />
    ),
    icon: <Palette className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "tru — workflow automation",
    description:
      "Connect the apps a business already runs on and let tru handle the tedious stuff — pay per run, no subscription, no per-seat fees.",
    header: (
      <Skeleton src={"/imgs/work/tru.webp"} alt="tru workflow automation app" />
    ),
    icon: <Workflow className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "snap — studio platform for photographers",
    description:
      "Branded booking, a pipeline that mirrors the shoot, vault-grade client galleries and payments that pay out straight to the photographer.",
    header: (
      <Skeleton src={"/imgs/work/snap.webp"} alt="snap photographer studio platform" />
    ),
    icon: <Aperture className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Back in the day website development",
    description: "Explore the birth of groundbreaking ideas and inventions.",
    header: (
      <Skeleton
        src={"/imgs/work/construction_site.webp"}
        alt="Back in the day website development"
      />
    ),
    icon: <AppWindow className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Co prompting AI app",
    description:
      "Dive into the transformative power of technology. From isolated chat threads with AI to group AI chats for research and development with colleagues",
    header: (
      <Skeleton src={"/imgs/work/coprompt.webp"} alt="Co prompting AI app" />
    ),
    icon: <Bot className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Lazyfor portfolio site",
    description: "So much to show but stuck with launching the portfolio.",
    header: (
      <Skeleton
        src={"/imgs/work/portfolio_site.webp"}
        alt="Lazyfor portfolio site"
      />
    ),
    icon: <Camera className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Tuition platform",
    description:
      "An application to manage your individual tuition class schedules, students and payments",
    header: (
      <Skeleton
        src={"/imgs/work/tution_course_mgt.webp"}
        alt="Tuition platform"
      />
    ),
    icon: <Book className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "JesminPrints Warehouse Management System",
    description:
      "A custom built WMS for JesminPrint to handle the collection and baling of waste paper for exports",
    header: (
      <Skeleton
        src={"/imgs/work/warehouse_mgt.webp"}
        alt="JesminPrints Warehouse Management System"
      />
    ),
    icon: <Forklift className="h-4 w-4 text-neutral-500" />,
  },
];
