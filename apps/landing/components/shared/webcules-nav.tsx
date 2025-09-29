"use client";
import { cn } from "@webcules/ui/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { JSX, useState } from "react";
import { CTAButton } from "./cta-button";
import Logo from "./logo";
import Link from "next/link";

export const WebculesNav = () => {
  const navItems = [
    { name: "Home", link: "/" },
    { name: "Services", link: "/#services" },
    { name: "Pricing", link: "/#pricing" },
    { name: "Blog", link: "/blog" },
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
            <Link
              key={`link=${idx}`}
              href={navItem.link}
              className={cn(
                "relative dark:text-neutral-50 items-center flex space-x-1 text-neutral-600 dark:hover:text-neutral-300 hover:text-neutral-500"
              )}
            >
              <span className="block sm:hidden">{navItem.icon}</span>
              <span className="hidden sm:block text-sm">{navItem.name}</span>
            </Link>
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
            <div className="flex flex-grow justify-center py-2">
              <CTAButton pricing={true} />
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
