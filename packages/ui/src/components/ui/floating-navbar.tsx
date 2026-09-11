"use client";
import { useState, ReactNode, Fragment } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import { cn } from "@webcules/ui/lib/utils";
import { IconArrowUpRight, IconChevronDown, IconMenu, IconX } from "@tabler/icons-react";

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
    apps?: {
      name: string;
      link: string;
      description: string;
    }[];
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
            {navItems.map((navItem, idx) =>
              navItem.apps ? (
                <Fragment key={`mobile-link=${idx}`}>
                  <p className="mt-2 px-4 pt-2 text-xs uppercase tracking-wider text-neutral-400">
                    {navItem.name}
                  </p>
                  {navItem.apps.map((app) => (
                    <a
                      key={`mobile-app=${app.name}`}
                      href={app.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block py-2 px-4 text-neutral-600 dark:text-neutral-50 hover:text-black dark:hover:text-neutral-300"
                    >
                      <span className="block text-sm">{app.name}</span>
                      <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                        {app.description}
                      </span>
                    </a>
                  ))}
                </Fragment>
              ) : (
                <a
                  key={`mobile-link=${idx}`}
                  href={navItem.link}
                  className="block py-2 px-4 text-neutral-600 dark:text-neutral-50 dark:hover:text-neutral-300 hover:text-black"
                >
                  <span>{navItem.name}</span>
                </a>
              )
            )}
            {mobileCustomButton && (
              <div className="flex flex-grow justify-center py-2">
                {mobileCustomButton}
              </div>
            )}
          </motion.div>
        )}
        {navItems.map((navItem, idx) =>
          navItem.apps ? (
            <div key={`link=${idx}`} className="group relative hidden sm:flex items-center">
              <button
                type="button"
                className="flex items-center gap-x-1 text-sm text-neutral-600 group-hover:text-neutral-500 dark:text-neutral-50 dark:group-hover:text-neutral-300"
              >
                {navItem.name}
                <IconChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180" />
              </button>
              <div className="invisible absolute left-1/2 top-full z-30 w-72 -translate-x-1/2 translate-y-2 pt-3 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white p-2 font-sans shadow-[0px_16px_40px_-8px_rgba(0,0,0,0.25)] dark:border-white/10 dark:bg-black">
                  {navItem.apps.map((app) => (
                    <a
                      key={app.name}
                      href={app.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl p-3 transition-colors hover:bg-neutral-100 dark:hover:bg-white/5"
                    >
                      <span className="flex items-center gap-x-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-50">
                        {app.name}
                        <IconArrowUpRight className="h-3.5 w-3.5 text-neutral-400" />
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                        {app.description}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ) : (
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
          )
        )}
        {customButton}
      </motion.div>
    </AnimatePresence>
  );
};
