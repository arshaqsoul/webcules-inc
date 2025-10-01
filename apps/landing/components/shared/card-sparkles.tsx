"use client";
import React from "react";
import { SparklesCore } from "@webcules/ui/components/ui/sparkles";
import { Righteous, Inter } from "next/font/google";
import Image from "next/image";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });
const inter = Inter({ subsets: ["latin"] });

type CardSparklesProps = {
  title: string;
  subTitle: string;
  id: string;
  img: string;
};

export const CardSparkles = (props: CardSparklesProps) => {
  const { title, subTitle, id, img } = props;
  return (
    <div
      key={id}
      className="work bg-radial from-black via-black to-indigo-700/30 overflow-hidden rounded-3xl border-[0.5px] border-gray-700"
    >
      <div className="w-full h-fit relative p-4">
        {/* Gradients */}
        <div className="absolute inset-x-20 top-0 bg-gradient-to-r from-transparent via-violet-500 to-transparent h-[2px] w-3/4 blur-sm" />
        <div className="absolute inset-x-20 top-0 bg-gradient-to-r from-transparent via-violet-500 to-transparent h-px w-3/4" />
        <div className="absolute inset-x-60 top-0 bg-gradient-to-r from-transparent via-pink-500 to-transparent h-[5px] w-1/4 blur-sm" />
        <div className="absolute inset-x-60 top-0 bg-gradient-to-r from-transparent via-pink-500 to-transparent h-px w-1/4" />
        {/* Core component */}
        <SparklesCore
          background="transparent"
          minSize={1}
          maxSize={1.5}
          particleDensity={100}
          className="h-full absolute float-end"
          particleColor="#8b5cf6"
          id={id}
        />
        <div
          className={`row-span-1 bg-radial from-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[30px] leading-tight my-4 + ${righteous.className}`}
        >
          <div className="w-full h-[10rem] relative">
            <Image
              src={img}
              className="h-1/2"
              alt="web skeleton"
              fill
              style={{
                objectPosition: "top",
                objectFit: "contain",
              }}
            />
          </div>
          <div className="w-4/5 my-2 text-[20px] sm:text-2xl">{title}</div>
          <div className={`text-sm text-gray-400 + ${inter.className}`}>
            {subTitle}
          </div>
        </div>
      </div>
    </div>
  );
};
