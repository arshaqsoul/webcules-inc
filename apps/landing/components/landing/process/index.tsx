"use client";
import { Righteous } from "next/font/google";
import Image from "next/image";
import DashboardMock from "./dashboard-mockup";
import { OurProcessBorderTop } from "./our-process-border-top";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";
import PriceTable from "./price-table";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });
gsap.registerPlugin(ScrollTrigger);

export default function Process() {
  useEffect(() => {
    const anims = document.querySelectorAll(".anim");
    const tasks = document.querySelectorAll(".task");
    anims.forEach((slin) => {
      const slinElement = slin as HTMLElement;
      gsap.fromTo(
        slinElement,
        {
          x: -30,
          opacity: 0,
        },
        {
          x: 0,
          opacity: 1,
          duration: 0.5,
          ease: "power2",
          scrollTrigger: {
            trigger: slinElement,
            start: "top 100%",
            end: "top 60%",
            scrub: 1,
          },
        }
      );
    });
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: tasks[0],
        start: "top 100%",
        end: "top 60%",
        scrub: 1,
      },
    });
    tasks.forEach((slin, index) => {
      tl.fromTo(
        slin,
        {
          y: 30,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          ease: "power2",
        },
        index * 0.1
      );
    });
  }, []);

  return (
    <>
      <div className="process overflow-x-hidden flex flex-col relative bg-darkest items-center justify-center">
        <div className="absolute h-[15vh] lg:max-w-[85rem] w-full top-[1px] left-1/2 transform -translate-x-1/2">
          <Image
            src={"imgs/section-seperator-green.svg"}
            alt="section-seperator-green"
            fill
            style={{
              objectPosition: "top",
              objectFit: "contain",
            }}
          />
        </div>
        <div className="lg:max-w-[85rem] h-fit w-full relative items-center justify-center overflow-hidden rounded-3xl pb-20">
          <div className="h-[20em] sm:h-[36em] w-full relative flex items-center justify-center">
            <OurProcessBorderTop />
            <div className="absolute bottom-4 sm:bottom-32 h-fit w-2/3 flex flex-col justify-center items-center overflow-hidden rounded-3xl px-4 py-10">
              <span className="anim whitespace-nowrap rounded-3xl bg-black px-2.5 py-1.5 text-sm text-gray-50 border-gray-500 border">
                Our Process
              </span>
              <div
                className={`anim flex flex-col justify-end text-center bg-conic-[at_top_right] from-transparent via-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[40px] sm:w-3/5 leading-tight my-4 + ${righteous.className}`}
              >
                <div>Prompt us and we do the rest</div>
              </div>
            </div>
          </div>
          <div className="w-full bg-gradient-to-t from-transparent to-gray-700 rounded-3xl p-[1px]">
            <div className="h-full bg-gradient-to-b from-darkest via-darkest to-transparent mt-0 relative p-4 sm:px-12 py-12 rounded-3xl">
              <span className="anim whitespace-nowrap rounded-3xl bg-black px-2.5 py-1.5 text-sm text-gray-50 border-gray-500 border">
                Step 1
              </span>
              <div
                className={`anim flex flex-col justify-end bg-conic-[at_top_right] from-transparent via-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[40px] sm:w-3/5 leading-tight my-4 + ${righteous.className}`}
              >
                <div>Brainstorm the Product</div>
                <p className="text-sm">
                  Together we plan the product roadmap. Making sure the highest
                  priority items get done fast.
                </p>
              </div>
              <div className="py-4">
                <hr className="border-t-gray-700" />
              </div>
              <div className="grid grid-cols-3 gap-4 overflow-x-scroll">
                <div className="task flex flex-col gap-y-4">
                  <span className="whitespace-nowrap w-fit rounded-3xl text-gray-300 bg-gray-500/25 px-2.5 py-0.5 text-sm">
                    <div className="flex flex-row justify-center items-center gap-x-1">
                      <div className="h-2 w-2 rounded-full bg-gray-300"></div>
                      Backlog
                    </div>
                  </span>
                  <div className="h-fit w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-400/70 via-transparent to-indigo-700/30 flex flex-col items-center justify-center overflow-hidden rounded-2xl border-[0.5px] border-gray-700">
                    <div className="w-full relative p-4">
                      <div
                        className={`bg-conic-[at_top_right] from-transparent via-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[30px] leading-tight my-4 + ${righteous.className}`}
                      >
                        <div>List Products</div>
                        <span className="whitespace-nowrap rounded-3xl bg-black px-1.5 py-0.5 text-sm font-normal text-gray-50 border-gray-50 border">
                          Feature
                        </span>
                        <div className="flex flex-row text-base font-normal items-center gap-x-1 pt-2">
                          <div className="h-4 w-4 rounded-full bg-green-300"></div>
                          Low
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="task flex flex-col gap-y-4">
                  <span className="whitespace-nowrap w-fit rounded-3xl text-orange-300/50 bg-orange-500/15 px-2.5 py-0.5 text-sm">
                    <div className="flex flex-row justify-center items-center gap-x-1">
                      <div className="h-2 w-2 rounded-full bg-orange-300"></div>
                      In Progress
                    </div>
                  </span>
                  <div className="h-fit w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-400/70 via-transparent to-indigo-700/30 flex flex-col items-center justify-center overflow-hidden rounded-2xl border-[0.5px] border-gray-700">
                    <div className="w-full relative p-4">
                      <div
                        className={`bg-conic-[at_top_right] from-transparent via-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[30px] leading-tight my-4 + ${righteous.className}`}
                      >
                        <div>Sales Overview</div>
                        <span className="whitespace-nowrap rounded-3xl bg-black px-1.5 py-0.5 text-sm font-normal text-gray-50 border-gray-50 border">
                          Feature
                        </span>
                        <div className="flex flex-row text-base font-normal items-center gap-x-1 pt-2">
                          <div className="h-4 w-4 rounded-full bg-orange-300"></div>
                          Medium
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="task flex flex-col gap-y-4">
                  <span className="whitespace-nowrap w-fit rounded-3xl text-green-300 bg-green-500/25 px-2.5 py-0.5 text-sm">
                    <div className="flex flex-row justify-center items-center gap-x-1">
                      <div className="h-2 w-2 rounded-full bg-green-300"></div>
                      Done
                    </div>
                  </span>
                  <div className="h-fit w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-400/70 via-transparent to-indigo-700/30 flex flex-col items-center justify-center overflow-hidden rounded-2xl border-[0.5px] border-gray-700">
                    <div className="w-full relative p-4">
                      <div
                        className={`bg-conic-[at_top_right] from-transparent via-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[30px] leading-tight my-4 + ${righteous.className}`}
                      >
                        <div>Click Analytics</div>
                        <span className="whitespace-nowrap rounded-3xl bg-black px-1.5 py-0.5 text-sm font-normal text-gray-50 border-gray-50 border">
                          Feature
                        </span>
                        <div className="flex flex-row text-base font-thin items-center gap-x-1 pt-2">
                          <div className="h-4 w-4 rounded-full bg-red-500"></div>
                          High
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative">
          <div className="sticky min-h-screen top-0 flex justify-center items-center">
            <DashboardMock />
          </div>
          <div className="min-h-screen flex justify-center items-center">
            <PriceTable />
          </div>
        </div>
      </div>
    </>
  );
}
