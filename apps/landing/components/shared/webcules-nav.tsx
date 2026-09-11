"use client";
import { cn } from "@webcules/ui/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import { Fragment, JSX, useState } from "react";
import { CTAButton } from "./cta-button";
import Logo from "./logo";
import Link from "next/link";

const apps = [
  {
    name: "Backgrounds",
    link: "https://backgrounds.webcules.com",
    description: "High-quality AI-crafted design backdrops for creatives.",
  },
  {
    name: "tru",
    link: "https://tru.webcules.com",
    description: "Workflow automation on the edge — pay per run, no subscription.",
  },
];

const AppsMenu = () => (
  <div className="group relative flex items-center">
    <button
      type="button"
      className={cn(
        "flex items-center gap-x-1 text-sm text-neutral-600 group-hover:text-neutral-500 dark:text-neutral-50 dark:group-hover:text-neutral-300"
      )}
    >
      Apps
      <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180" />
    </button>
    <div className="invisible absolute left-1/2 top-full z-30 w-72 -translate-x-1/2 translate-y-1 pt-3 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0px_16px_40px_-8px_rgba(0,0,0,0.25)] dark:border-white/10 dark:bg-black">
        {apps.map((app) => (
          <a
            key={app.name}
            href={app.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl p-3 transition-colors hover:bg-neutral-100 dark:hover:bg-white/5"
          >
            <span className="flex items-center gap-x-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-50">
              {app.name}
              <ArrowUpRight className="h-3.5 w-3.5 text-neutral-400" />
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {app.description}
            </span>
          </a>
        ))}
      </div>
    </div>
  </div>
);

export const WebculesNav = () => {
  const navItems = [
    { name: "Home", link: "/" },
    { name: "Services", link: "/#services" },
    { name: "Pricing", link: "/#pricing" },
    { name: "Blog", link: "/posts" },
    { name: "Contact", link: "/contact" },
  ];
  return <Navbar navItems={navItems} />;
};

const Navbar = ({
  navItems,
  className,
}: {
  navItems: {
    name: string;
    link: string;
    icon?: JSX.Element;
  }[];
  className?: string;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        transition={{
          duration: 0.2,
        }}
        className={cn(`flex flex-row px-12 sm:relative z-20 sticky`, className)}
      >
        <div className="flex justify-center rounded-full absolute top-8 left-1 lg:left-48">
          <Logo />
        </div>
        <div className="sm:hidden absolute top-10 right-10">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-neutral-600 dark:text-neutral-50"
          >
            {menuOpen ? (
              <X className="h-6 w-6 text-white" />
            ) : (
              <Menu className="h-6 w-6 text-white" />
            )}
          </button>
        </div>

        <div className="hidden sm:flex max-w-fit rounded-full absolute top-10 inset-x-0 mx-auto border border-transparent dark:border-white/[0.2] dark:bg-black bg-white shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)] px-4 py-2  items-center justify-center space-x-4">
          {navItems.map((navItem: any, idx: number) => (
            <Fragment key={`link=${idx}`}>
              <Link
                href={navItem.link}
                className={cn(
                  "relative dark:text-neutral-50 items-center flex space-x-1 text-neutral-600 dark:hover:text-neutral-300 hover:text-neutral-500"
                )}
              >
                <span className="block sm:hidden">{navItem.icon}</span>
                <span className="hidden sm:block text-sm">{navItem.name}</span>
              </Link>
              {idx === 0 && <AppsMenu />}
            </Fragment>
          ))}
        </div>
        <div className="hidden sm:flex justify-center rounded-full absolute top-10 right-4 lg:right-48">
          <CTAButton pricing={false} />
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
            className="sm:hidden absolute top-24 left-0 right-0 bg-darkest dark:bg-darkest shadow-md mx-2 p-4"
          >
            {navItems.map((navItem, idx) => (
              <Link
                key={`mobile-link=${idx}`}
                href={navItem.link}
                className="block py-2 px-4 text-neutral-300 dark:text-neutral-50 dark:hover:text-neutral-300 hover:text-white"
              >
                <span>{navItem.name}</span>
              </Link>
            ))}
            <p className="mt-2 px-4 pt-2 text-xs uppercase tracking-wider text-neutral-400">
              Apps
            </p>
            {apps.map((app, idx) => (
              <a
                key={`mobile-app=${idx}`}
                href={app.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block py-2 px-4 text-neutral-300 dark:text-neutral-50 hover:text-white"
              >
                <span className="flex items-center gap-x-1.5 text-sm">
                  {app.name}
                  <ArrowUpRight className="h-3.5 w-3.5 text-neutral-500" />
                </span>
                <span className="block text-xs text-neutral-500">{app.description}</span>
              </a>
            ))}
            <div className="flex flex-grow justify-center py-2">
              <CTAButton pricing={true} />
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
