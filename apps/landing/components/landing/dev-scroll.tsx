"use client";
import Image from "next/image";
import { Righteous } from "next/font/google";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useLayoutEffect, useRef } from "react";
import React from "react";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });
gsap.registerPlugin(ScrollTrigger);

export default function DevScroll() {
  const videoRef = useRef<HTMLVideoElement>(null);

  // The source video is large - only load/play it once the section is close
  // to the viewport instead of on page load.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          video.preload = "auto";
          video.play().catch(() => {});
          observer.disconnect();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: ".dev-scroll",
        start: "top top",
        endTrigger: ".bottom-end",
        end: "top top",
        pin: ".sticky-img",
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <div className="overflow-hidden relative justify-center items-center bg-darkest pb-8">
      <div className="anim h-fit w-full flex flex-col justify-center items-center overflow-hidden rounded-3xl px-4 lg:px-44 py-10">
        <span className="whitespace-nowrap rounded-3xl bg-black px-2.5 py-1.5 text-sm text-gray-50 border-gray-50 border">
          About Us
        </span>
        <div
          className={`flex flex-col justify-end text-center bg-radial from-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[40px] sm:w-3/5 leading-tight my-4 + ${righteous.className}`}
        >
          <div>We strive to provide the best</div>
          <p className="mt-4 text-sm sm:text-base leading-relaxed text-slate-400 font-sans">
            A compact team of engineers and designers. We design, build and run
            web, design and data products end to end — no hand-offs, no
            hand-waving.
          </p>
        </div>
      </div>
      <div className="dev-scroll flex flex-col gap-y-1 lg:gap-y-4 items-center pb-8">
        <div className="sticky-img w-full h-full flex items-start justify-center mx-auto absolute z-10">
          <div className="w-36 border-2 border-indigo-600 bg-darkest lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] relative rounded-3xl lg:rounded-[3rem] overflow-clip">
            <video
              ref={videoRef}
              className="absolute right-0 bottom-0 min-h-[100%] min-w-[100%] overflow-hidden object-cover"
              muted
              playsInline
              loop
              preload="none"
              poster="/imgs/video-poster.webp"
            >
              <source src="/imgs/video.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
        <div className="flex flex-row gap-1 sm:gap-1 list-none h-fit">
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] hidden sm:block relative">
            <Image
              src={"/imgs/grid/molecule_one.webp"}
              alt="molecule_one"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] relative">
            <Image
              src={"/imgs/grid/travel_app.webp"}
              alt="travel_app"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
          <div className="sticky-img w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] relative">
            {/* <Image src={'/imgs/grid/pyramid.webp'} alt="travel_app" fill style={{
              objectPosition: "top",
              objectFit: "contain"
            }}/> */}
          </div>
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] hidden sm:block relative">
            <Image
              src={"/imgs/grid/robot.webp"}
              alt="robot"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] relative">
            <Image
              src={"/imgs/grid/molecule_two.webp"}
              alt="molecule_two"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
        </div>
        <div className="flex flex-row gap-1 sm:gap-1 list-none h-fit">
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] hidden sm:block relative">
            <Image
              src={"/imgs/grid/nano.webp"}
              alt="nano"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] relative">
            <Image
              src={"/imgs/grid/location_app.webp"}
              alt="location_app"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] relative">
            {/* <Image src={'/imgs/grid/pyramid.webp'} alt="travel_app" fill style={{
              objectPosition: "top",
              objectFit: "contain"
            }}/> */}
          </div>
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] hidden sm:block relative">
            <Image
              src={"/imgs/grid/meditation_app.webp"}
              alt="meditation_app"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] relative">
            <Image
              src={"/imgs/grid/molecule_three.webp"}
              alt="molecule_three"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
        </div>
        <div className="flex flex-row gap-1 sm:gap-1 list-none h-fit">
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] hidden sm:block relative">
            <Image
              src={"/imgs/grid/pyramid.webp"}
              alt="pyramid"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] relative">
            <Image
              src={"/imgs/grid/food_app.webp"}
              alt="food_app"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] relative">
            {/* <Image src={'/imgs/grid/pyramid.webp'} alt="travel_app" fill style={{
              objectPosition: "top",
              objectFit: "contain"
            }}/> */}
          </div>
          <div className="w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] hidden sm:block relative">
            <Image
              src={"/imgs/grid/money_ex_app.webp"}
              alt="money_ex_app"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
          <div className="bottom-end w-36 lg:w-96 md:w-64 sm:w-56 h-80 sm:h-[28em] md:h-[36em] lg:h-[50em] relative">
            <Image
              src={"/imgs/grid/robot_two.webp"}
              alt="robot_two"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
