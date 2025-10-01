import Image from "next/image";
import { Righteous } from "next/font/google";
import Link from "next/link";
import { CTAButton } from "./cta-button";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });

export const Footer = () => {
  const navItems = [
    { name: "Home", link: "/" },
    { name: "Services", link: "/#services" },
    { name: "Pricing", link: "/#pricing" },
    { name: "Blog", link: "/blog" },
    { name: "Contact", link: "/contact" },
  ];
  const navServices = [
    { name: "Web", link: "/#services" },
    { name: "Mobile", link: "/#services" },
    { name: "Design", link: "/#services" },
    { name: "Data", link: "/#services" },
    { name: "Deploy", link: "/#services" },
  ];
  const navLegal = [
    { name: "Privacy Policy", link: "/#services" },
    { name: "Terms and Conditions", link: "/#services" },
    { name: "Refund Policy", link: "/#services" },
  ];
  const navUsecases = [
    { name: "E-commerce", link: "/#services" },
    { name: "Custom ERP", link: "/#services" },
    { name: "SaaS apps", link: "/#services" },
    { name: "Internal Tools", link: "/#services" },
    { name: "AI apps", link: "/#services" },
    { name: "Data Ingestion", link: "/#services" },
    { name: "Data Analytics/Dashboards", link: "/#services" },
  ];
  return (
    <div className="relative flex flex-col items-center justify-between bg-darkest -mt-16 z-[1]">
      <div className="lg:max-w-[85rem] h-fit w-full relative overflow-hidden rounded-3xl px-4 py-20 flex justify-center">
        <div
          className={`grid grid-cols-2 sm:grid-cols-6 gap-y-8 gap-x-2 my-20 + ${righteous.className}`}
        >
          <div className="flex flex-col text-slate-400 gap-y-2">
            <div className="flex flex-row items-center gap-x-2">
              <div className="h-8 w-16 relative">
                <Image
                  src="/imgs/logo.png"
                  alt="footer logo"
                  fill
                  style={{
                    objectFit: "contain",
                  }}
                />
              </div>
              <p className="text-white text-xl">Webcules</p>
            </div>
            <div>
              <p>© 2024 Webcules Inc.</p>
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
            <CTAButton pricing={true} />
          </div>
          <div></div>
          <div className="flex flex-col text-slate-400 gap-y-2">
            <p className="text-white font-bold text-xl">Company</p>
            {navItems.map((item, index) => (
              <Link key={"n-" + index} href={item.link}>
                {item.name}
              </Link>
            ))}
          </div>
          <div className="flex flex-col text-slate-400 gap-y-2">
            <p className="text-white font-bold text-xl">Services</p>
            {navServices.map((item, index) => (
              <Link key={"s-" + index} href={item.link}>
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
          <div className="flex flex-col text-slate-400 gap-y-2">
            <p className="text-white font-bold text-xl">Use Cases</p>
            {navUsecases.map((item, index) => (
              <Link key={"u-" + index} href={item.link}>
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
