"use client";
import { useState, ReactNode } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import { cn } from "@webcules/ui/lib/utils";
import { IconMenu, IconX } from "@tabler/icons-react";

export const FloatingNav = ({
  navItems,
  className,
  customButton,
  mobileCustomButton,
  fontClassName,
}: {
  navItems: {
    name: string;
    link: string;
    icon?: ReactNode;
  }[];
  className?: string;
  fontClassName?: string;
  customButton?: ReactNode;
  mobileCustomButton?: ReactNode;
}) => {
  const { scrollYProgress } = useScroll();

  const [visible, setVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useMotionValueEvent(scrollYProgress, "change", (current) => {
    if (typeof current === "number") {
      let direction = current! - scrollYProgress.getPrevious()!;

      if (scrollYProgress.get() < 0.05) {
        setVisible(false);
      } else {
        if (direction < 0) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    }
  });

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{
          opacity: 1,
          y: -100,
        }}
        animate={{
          y: visible ? 0 : -100,
          opacity: visible ? 1 : 0,
        }}
        transition={{
          duration: 0.2,
        }}
        className={cn(
          `flex max-w-fit fixed top-5 inset-x-0 mx-auto border border-transparent dark:border-white/[0.2] dark:bg-black bg-white shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)] z-[5000] pr-2 pl-8 py-1 items-center justify-center space-x-4 ${menuOpen ? "rounded-tr-3xl rounded-tl-3xl" : "rounded-full"} ${fontClassName}`,
          className
        )}
      >
        <div className="sm:hidden">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-neutral-600 dark:text-neutral-50"
          >
            {menuOpen ? (
              <IconX className="h-6 w-6" />
            ) : (
              <IconMenu className="h-6 w-6" />
            )}
          </button>
        </div>
        {menuOpen && (
          <motion.div
            initial={{
              y: -50,
            }}
            animate={{
              y: 0,
            }}
            transition={{
              duration: 0.2,
            }}
            className="sm:hidden absolute rounded-bl-3xl rounded-br-3xl top-12 -left-4 right-0 bg-white dark:bg-black p-4"
          >
            {navItems.map((navItem, idx) => (
              <a
                key={`mobile-link=${idx}`}
                href={navItem.link}
                className="block py-2 px-4 text-neutral-600 dark:text-neutral-50 dark:hover:text-neutral-300 hover:text-black"
              >
                <span>{navItem.name}</span>
              </a>
            ))}
            {mobileCustomButton && (
              <div className="flex flex-grow justify-center py-2">
                {mobileCustomButton}
              </div>
            )}
          </motion.div>
        )}
        {navItems.map((navItem, idx) => (
          <a
            key={`link=${idx}`}
            href={navItem.link}
            className={cn(
              "relative dark:text-neutral-50 items-center flex space-x-1 text-neutral-600 dark:hover:text-neutral-300 hover:text-neutral-500"
            )}
          >
            <span className="block sm:hidden">{navItem.icon}</span>
            <span className="hidden sm:block text-sm">{navItem.name}</span>
          </a>
        ))}
        {customButton}
      </motion.div>
    </AnimatePresence>
  );
};
