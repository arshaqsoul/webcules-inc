import { FloatingNav } from "@webcules/ui/components/ui/floating-navbar";
import { CTAButton } from "./cta-button";
import { Righteous } from "next/font/google";
import { Newspaper, User } from "lucide-react";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });

export const WebculesFloatingNav = () => {
  const navItems = [
    { name: "Collections", link: "/collection", icon: undefined },
    {
      name: "Updates",
      link: "/updates",
      icon: <Newspaper className="" size={16} />,
    },
    { name: "FAQs", link: "/faq", icon: undefined },
    {
      name: "Sign In",
      link: "/signin",
      icon: <User className="" size={16} />,
    },
  ];

  return (
    <FloatingNav
      navItems={navItems}
      customButton={<CTAButton />}
      fontClassName={righteous.className}
    />
  );
};
