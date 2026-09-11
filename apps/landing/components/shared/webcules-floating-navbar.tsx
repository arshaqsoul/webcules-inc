import { FloatingNav } from "@webcules/ui/components/ui/floating-navbar";
import { CTAButton } from "./cta-button";
import { Righteous } from "next/font/google";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });

export const WebculesFloatingNav = () => {
  const navItems = [
    { name: "Home", link: "/" },
    {
      name: "Apps",
      link: "#",
      apps: [
        {
          name: "Backgrounds",
          link: "https://backgrounds.webcules.com",
          description: "High-quality AI-crafted design backdrops for creatives.",
        },
        {
          name: "tru",
          link: "https://tru.webcules.com",
          description:
            "Workflow automation on the edge — pay per run, no subscription.",
        },
      ],
    },
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
