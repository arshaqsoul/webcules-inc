import AiConsulting from "@/components/landing/ai-consulting";
import { FlyingRobot } from "@/components/landing/flying-robot";
import Hero from "@/components/landing/hero";
import { Marquee } from "@/components/landing/marquee";
import Pricing from "@/components/landing/pricing";
import Process from "@/components/landing/process";
import Services from "@/components/landing/services";
import Work from "@/components/landing/work";
import { CallToAction } from "@/components/shared/call-to-action";

export default function LandingPage() {
  return (
    <main>
      <FlyingRobot />
      <Hero />
      <Marquee />
      <Services />
      <AiConsulting />
      <Work />
      <Process />
      <Pricing />
      <CallToAction />
    </main>
  );
}
