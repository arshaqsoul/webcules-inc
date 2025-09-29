import { FloatingNav } from "@webcules/ui/components/ui/floating-navbar";

export const WebculesFloatingNav = () => {
  const navItems = [
    { name: "Home", link: "/" },
    { name: "Services", link: "/#services" },
    { name: "Pricing", link: "/#pricing" },
    { name: "Blog", link: "/blog" },
    { name: "Contact", link: "/contact" },
  ];
  return <FloatingNav navItems={navItems} />;
};
