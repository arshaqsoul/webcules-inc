import { FloatingNav } from "@webcules/ui/components/ui/floating-navbar";
import { CTAButton } from "./cta-button";
import { Righteous } from "next/font/google";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });

export const WebculesFloatingNav = () => {
  const navItems = [
    { name: "Home", link: "/" },
    { name: "Services", link: "/#services" },
    { name: "Pricing", link: "/#pricing" },
    { name: "Blog", link: "/blog" },
    { name: "Contact", link: "/contact" },
  ];

  return (
    <FloatingNav
      navItems={navItems}
      customButton={<CTAButton pricing={false} />}
      fontClassName={righteous.className}
    />
  );
};
