import { getCachedGlobal } from "@webcules/payload/utilities/getGlobals";
import Link from "next/link";
import React from "react";

import type { Footer } from "@webcules/payload/payload-types";

import { ThemeSelector } from "@webcules/payload/providers/Theme/ThemeSelector";
import { CMSLink } from "@webcules/payload/components/Link";
import { Logo } from "@webcules/payload/components/Logo/Logo";

export async function Footer() {
  const footerData: Footer = await getCachedGlobal("footer", 1)();

  const navItems = footerData?.navItems || [];

  return (
    <footer className="mt-auto border-t border-border bg-black dark:bg-card text-white">
      <div className="container py-8 gap-8 flex flex-col md:flex-row md:justify-between">
        <Link className="flex items-center" href="/">
          <Logo />
        </Link>

        <div className="flex flex-col-reverse items-start md:flex-row gap-4 md:items-center">
          <ThemeSelector />
          <nav className="flex flex-col md:flex-row gap-4">
            {navItems.map(({ link }, i) => {
              return <CMSLink className="text-white" key={i} {...link} />;
            })}
          </nav>
        </div>
      </div>
    </footer>
  );
}
