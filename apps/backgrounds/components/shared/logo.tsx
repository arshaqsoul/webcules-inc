import React from "react";

import Lottie from "react-lottie-player";

import lottieJson from "../../public/WebculesLogo.json";
import Link from "next/link";

export default function Logo() {
  return (
    <Link
      href={"/"}
      className="flex flex-row items-center justify-center text-white"
    >
      <Lottie
        loop
        animationData={lottieJson}
        play
        style={{ width: 150, height: 60 }}
      />
    </Link>
  );
}
