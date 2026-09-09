import DevScroll from "@/components/landing/dev-scroll";
import Hero from "@/components/landing/hero";
import Process from "@/components/landing/process";
import Services from "@/components/landing/services";
import Work from "@/components/landing/work";
import { CallToAction } from "@/components/shared/call-to-action";
import { InfiniteMovingText } from "@webcules/ui/components/ui/infinite-moving-text";
import { Righteous } from "next/font/google";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });

export default function LandingPage() {
  return (
    <>
      <Hero />;
      <div className="relative border-y border-white/10 bg-white/[0.04] py-10 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <InfiniteMovingText
          text="Empathize User Customer Focused Inspired Design Data First"
          speed="fast"
          className={`text-indigo-100 + ${righteous.className}`}
        />
      </div>
      <Services />
      <DevScroll />
      <Work />
      <Process />
      <CallToAction />
    </>
  );
}
