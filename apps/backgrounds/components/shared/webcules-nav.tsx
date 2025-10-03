import { checkUserAuth } from "@/lib/actions/auth-actions";
import { FileQuestion, Newspaper, User } from "lucide-react";
import { Navbar } from "./navbar";

export default async function WebculesNav() {
  const authStatus = await checkUserAuth();
  const navItems = [
    { name: "Collections", link: "/collection", icon: undefined },
    {
      name: "Updates",
      link: "/updates",
      icon: <Newspaper className="" size={16} />,
    },
    {
      name: "FAQs",
      link: "/faq",
      icon: <FileQuestion className="" size={16} />,
    },
    ...(authStatus.isAuthenticated
      ? [
          {
            name: authStatus.user?.name ?? "profile",
            link: "/dashboard",
            icon: <User className="" size={16} />,
          },
        ]
      : [
          {
            name: "Sign In",
            link: "/signin",
            icon: <User className="" size={16} />,
          },
        ]),
  ];
  return <Navbar navItems={navItems} />;
}
