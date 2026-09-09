import { MascotSVG } from "@/components/shared/mascot-svg";
import { ScrollIndicatorButton } from "@/components/shared/scroll-indicator-button";
import { Boxes } from "@webcules/ui/components/ui/background-boxes";
import { TypewriterEffectSmooth } from "@webcules/ui/components/ui/typewriter-effect";
import Image from "next/image";
import { Righteous, Inter } from "next/font/google";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });
const inter = Inter({ subsets: ["latin"] });

export default function Hero() {
  const words = [
    {
      text: "WEB,",
    },
    {
      text: "DESIGN",
    },
    {
      text: "and",
    },
    {
      text: "DATA",
      className: "text-indigo-500",
    },
  ];
  return (
    <div className="p-2 overflow-x-hidden flex items-center justify-between">
      <div className="flex items-center justify-center h-[97vh] w-full relative overflow-hidden rounded-3xl">
        <Image
          src={"/imgs/galaxy.webp"}
          alt="Stylized deep space background"
          className="-z-10"
          fill
          priority
          sizes="100vw"
          style={{
            objectFit: "cover",
          }}
        />
        <Image
          src={"/imgs/planets.webp"}
          alt="Webcules background space galaxy"
          className="-z-10"
          fill
          style={{
            objectFit: "cover",
          }}
        />
        <div className="absolute bg-gradient-to-r from-indigo-950 via-transparent to-indigo-950 w-full h-full flex flex-col items-center justify-center rounded-lg">
          <div className="inset-0 w-full h-full [mask-image:radial-gradient(transparent,white)] pointer-events-none" />
          <Boxes rowCount={30} colCount={30} />
        </div>
        <div className="flex flex-col justify-center items-center h-[85vh] px-4 lg:px-44 mt-24 pb-4 gap-4 z-10">
          <div
            className={`flex flex-col justify-center items-center text-center text-white text-[8vw] sm:text-[5vw] uppercase leading-none + ${righteous.className}`}
          >
            <div>Concept to creation</div>
            <div className="font-black flex flex-row text-[6vw] sm:text-[4vw] mt-4 sm:mt-0">
              <ScrollIndicatorButton />
              for <br className="block sm:hidden" /> anything
            </div>
            <TypewriterEffectSmooth words={words} />
            <div className="sm:hidden [filter:drop-shadow(0_0_45px_rgba(129,140,248,0.55))]">
              <MascotSVG size="medium" />
            </div>
            <div className="hidden sm:block [filter:drop-shadow(0_0_70px_rgba(129,140,248,0.5))]">
              <MascotSVG size="large" />
            </div>
            <hr className="mb-4 text-white" />
            <div
              className={`flex flex-col sm:flex-row text-xs items-center justify-start gap-y-3 sm:gap-x-3 + ${inter.className}`}
            >
              <div className="rounded-full bg-white text-black p-1 px-4">
                Data first
              </div>
              <div className="uppercase tracking-wider text-gray-400">
                Tech enthusiasts
              </div>
              <div className="text-gray-300">
                The human touch behind AI-powered web, design and data.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
