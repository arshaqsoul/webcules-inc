import React from "react";
import {
  BentoGrid,
  BentoGridItem,
} from "@webcules/ui/components/ui/bento-grid";
import { Book, AppWindow, Bot, Forklift, Camera } from "lucide-react";
import Image from "next/image";

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
          className={i === 3 || i === 6 ? "md:col-span-2" : ""}
        />
      ))}
    </BentoGrid>
  );
}
const Skeleton = ({ src }: { src: string }) => (
  <div className="flex flex-1 w-full h-full min-h-[12rem] relative rounded-3xl bg-radial-[at_top_right] from-fuchsia-600/40 via-transparent to-transparent">
    <Image
      src={src}
      fill
      alt="construction site"
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
    title: "Back in the day website development",
    description: "Explore the birth of groundbreaking ideas and inventions.",
    header: <Skeleton src={"/imgs/work/construction_site.png"} />,
    icon: <AppWindow className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Co prompting AI app",
    description:
      "Dive into the transformative power of technology. From isolated chat threads with AI to group AI chats for research and development with colleagues",
    header: <Skeleton src={"/imgs/work/coprompt.png"} />,
    icon: <Bot className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Lazyfor portfolio site",
    description: "So much to show but stuck with launching the portfolio.",
    header: <Skeleton src={"/imgs/work/portfolio_site.png"} />,
    icon: <Camera className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Tuition platform",
    description:
      "An application to manage your individual tuition class schedules, students and payments",
    header: <Skeleton src={"/imgs/work/tution_course_mgt.png"} />,
    icon: <Book className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "JesminPrints Warehouse Management System",
    description:
      "A custom built WMS for JesminPrint to handle the collection and baling of waste paper for exports",
    header: <Skeleton src={"/imgs/work/warehouse_mgt.png"} />,
    icon: <Forklift className="h-4 w-4 text-neutral-500" />,
  },
];
