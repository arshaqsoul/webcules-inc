"use client";
import { cn } from "@webcules/ui/lib/utils";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "grid md:auto-rows-[26rem] grid-cols-1 md:grid-cols-3 gap-4 w-full mx-auto ",
        className
      )}
    >
      {children}
    </div>
  );
};
gsap.registerPlugin(ScrollTrigger);
export const BentoGridItem = ({
  fontClassName,
  descriptionClassName,
  className,
  title,
  description,
  header,
  icon,
}: {
  fontClassName?: string;
  descriptionClassName?: string;
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
}) => {
  useEffect(() => {
    const works = document.querySelectorAll(".work");
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: works[0],
        start: "top 100%",
        end: "top 60%",
        scrub: 1,
      },
    });
    works.forEach((slin, index) => {
      tl.fromTo(
        slin,
        {
          y: 30,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          ease: "power2",
        },
        index * 0.1
      );
    });
  }, []);
  return (
    <div
      className={cn(
        "work row-span-1 group/bento transition duration-200 shadow-input dark:shadow-none p-2 dark:bg-black dark:border-white/[0.2] bg-conic-[at_top_right] from-black/50 via-black/50 to-indigo-700/30 rounded-3xl border-[0.5px] border-gray-700 justify-between flex flex-col space-y-4",
        className
      )}
    >
      {header}
      <div
        className={`group-hover/bento:translate-x-2 transition duration-200 p-2 bg-conic-[at_top_right] from-transparent via-indigo-100 to-white text-transparent bg-clip-text + ${fontClassName}`}
      >
        {icon}
        <div className="my-2 text-[20px] sm:text-2xl">{title}</div>
        <div className={`text-sm text-gray-400 + ${descriptionClassName}`}>
          {description}
        </div>
      </div>
    </div>
  );
};
