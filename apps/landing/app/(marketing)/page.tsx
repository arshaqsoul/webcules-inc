import DevScroll from "@/components/landing/dev-scroll";
import Hero from "@/components/landing/hero";
import Process from "@/components/landing/process";
import Services from "@/components/landing/services";
import Work from "@/components/landing/work";
import { CallToAction } from "@/components/shared/call-to-action";
import { InfiniteMovingText } from "@webcules/ui/components/ui/infinite-moving-text";

export default function LandingPage() {
  return (
    <>
      <Hero />;
      <div className="relative border-y border-white/10 bg-darkest py-8 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <InfiniteMovingText
          text="Web Design Data Deploy"
          speed="slow"
          className="text-indigo-200/40"
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
