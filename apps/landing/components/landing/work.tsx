"use client";
import Image from "next/image";
import { Righteous } from "next/font/google";
import { OurWorkBento } from "@/components/shared/our-work-bento";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });
gsap.registerPlugin(ScrollTrigger);

export default function Work() {
  useEffect(() => {
    const anims = document.querySelectorAll(".anim");
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
  }, []);

  return (
    <div className="bg-darkest relative pb-10">
      <div className="absolute h-[15vh] lg:max-w-[85rem] w-full -top-[1px] z-20 left-1/2 transform -translate-x-1/2">
        <Image
          src="/imgs/section-seperator.svg"
          alt="section-seperator"
          fill
          style={{
            objectPosition: "top",
            objectFit: "contain",
          }}
        />
      </div>
      <div className="pt-32 overflow-x-hidden relative flex flex-col items-center bg-darkest bg-radial-[at_top_center] from-fuchsia-600/40 via-transparent to-transparent">
        <div className="lg:max-w-[85rem] h-fit w-full overflow-hidden rounded-3xl px-4 py-10">
          <div className="anim text-center">
            <span className="whitespace-nowrap rounded-3xl bg-black px-2.5 py-1.5 text-sm text-gray-50 border-gray-50 border">
              Our work
            </span>
          </div>
          <div
            className={`anim flex flex-col mx-auto justify-end text-center bg-radial from-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[40px] sm:w-3/5 leading-tight my-4 ${righteous.className}`}
          >
            <div>Work that speaks for itself</div>
            <p className="mt-4 text-sm sm:text-base font-sans text-slate-400">
              A selection of products we have designed, built and shipped for
              our clients.
            </p>
          </div>
          <OurWorkBento />
        </div>
      </div>
    </div>
  );
}
