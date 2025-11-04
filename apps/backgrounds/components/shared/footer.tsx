import Image from "next/image";
import { Righteous } from "next/font/google";
import Link from "next/link";
import { CTAButton } from "./cta-button";
import { checkUserAuth } from "@/lib/actions/auth-actions";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });

export const Footer = async () => {
  const authStatus = await checkUserAuth();
  const navItems = [
    { name: "Collections", link: "/collection" },
    {
      name: "Updates",
      link: "/updates",
    },
    { name: "FAQs", link: "/faq" },
    { name: "About Us", link: "/about" },
    {
      name: "Sign In",
      link: "/signin",
    },
  ];
  const navLegal = [
    { name: "Privacy Policy", link: "/privacy-policy" },
    { name: "Terms and Conditions", link: "/terms" },
    { name: "Refund Policy", link: "/refund" },
  ];
  return (
    <div className="relative flex flex-col items-center justify-between bg-darkest">
      <div className="lg:max-w-[85rem] lg:px-16 h-fit w-full relative overflow-hidden rounded-3xl px-4 py-20">
        <div
          className={`grid grid-cols-2 sm:grid-cols-4 gap-y-8 gap-x-2 my-20 + ${righteous.className}`}
        >
          <div className="flex flex-col items-start text-slate-400 gap-y-2 col-span-2">
            <div className="flex flex-row items-center gap-x-2">
              <div className="h-8 w-16 relative">
                <Image
                  src="/logo.png"
                  alt="footer logo"
                  fill
                  style={{
                    objectFit: "contain",
                  }}
                />
              </div>
              <p className="text-white text-xl">
                <a href="https://webcules.com">Webcules</a>
              </p>
            </div>
            <div>
              <p>© 2025 Webcules Inc.</p>
              <p>All rights reserved.</p>
            </div>
            <p className="underline">
              <a href="mailto:business@webcules.com?subject=Footer%20Contact">
                business@webcules.com
              </a>
            </p>
            <p className="underline">
              <a href="https://wa.me/16399986044?text=I'm%20interested%20in%20your%20services,%20let's%20talk">
                +1 639 998 6044
              </a>
            </p>
            {authStatus.user?.subscriptionStatus != "active" && (
              <CTAButton type="subscription" className="w-fit" />
            )}
          </div>
          <div className="flex flex-col text-slate-400 gap-y-2">
            <p className="text-white font-bold text-xl">Company</p>
            {navItems.map((item, index) => (
              <Link key={"n-" + index} href={item.link}>
                {item.name}
              </Link>
            ))}
          </div>
          <div className="flex flex-col text-slate-400 gap-y-2">
            <p className="text-white font-bold text-xl">Legal</p>
            {navLegal.map((item, index) => (
              <Link key={"l-" + index} href={item.link}>
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
