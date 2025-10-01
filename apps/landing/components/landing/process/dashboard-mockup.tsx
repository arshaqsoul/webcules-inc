"use client";
import Image from "next/image";

import gsap from "gsap";
import { Righteous } from "next/font/google";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect } from "react";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });
gsap.registerPlugin(ScrollTrigger);

export default function DashboardMock() {
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      let mm = gsap.matchMedia();
      mm.add(
        // Settings for mobile screens
        "(max-width: 768px)",
        function () {
          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: ".dashboard",
              start: "top top",
              end: "+=2000",
              pin: ".dashboard",
              scrub: 0,
            },
          });
          tl.to(".dash-img", { ease: "none", filter: "blur(24px)" }, "<");
          tl.to(".step-three", { opacity: 1 }, "<");
        }
      );
      mm.add("all and (min-width: 768px)", function () {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: ".dash-container",
            start: "top top",
            end: "+=2000",
            pin: ".dash-container",
            scrub: 0,
          },
        });
        tl.to(".dash-img", { ease: "none", filter: "blur(24px)" }, "<");
        tl.to(".step-three", { opacity: 1 }, "<");
      });
    });
    return () => ctx.revert();
  }, []);
  return (
    <div className="dashboard h-[200vh] sm:min-h-screen w-full flex flex-col justify-start items-center">
      <div className="h-fit w-4/5 flex flex-col justify-center items-center overflow-hidden rounded-3xl px-4 pt-10">
        <span className="anim whitespace-nowrap rounded-3xl bg-black px-2.5 py-1.5 text-sm text-gray-50 border-gray-500 border">
          Step 2
        </span>
        <div
          className={`anim flex flex-col justify-end text-center bg-radial from-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[40px] sm:w-3/5 leading-tight my-4 + ${righteous.className}`}
        >
          <div>Build first iteration in weeks</div>
          <p className="text-sm">
            Building the initial iteration in weeks lays the groundwork for
            iterative improvements driven by data insights.
          </p>
        </div>
      </div>
      <div className="dash-container h-screen w-[200%] sm:w-full relative flex items-center justify-center">
        <Image
          src={"imgs/dashboard-border.svg"}
          alt="our process border"
          className="dash-img"
          fill
          style={{
            objectPosition: "top",
            objectFit: "contain",
          }}
        />
        <div className="step-three absolute h-fit sm:min-h-screen w-[80%] sm:w-full flex justify-center items-center top-[20%] sm:top-0 opacity-0">
          <div className="w-3/5 sm:w-4/5 flex flex-col justify-center items-center overflow-hidden rounded-3xl px-4 pt-10">
            <span className="whitespace-nowrap rounded-3xl bg-black px-2.5 py-1.5 text-sm text-gray-50 border-gray-500 border">
              Step 3
            </span>
            <div
              className={`flex flex-col justify-end text-center bg-radial from-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[40px] sm:w-3/5 leading-tight my-4 + ${righteous.className}`}
            >
              <div>
                Continuous feedback loop and iterations. Release every 2 weeks
              </div>
              <p className="text-sm">
                Truly agile means of iterating using feedback and releasing
                features continuously
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
