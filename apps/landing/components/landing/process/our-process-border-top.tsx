"use client";

import { useEffect } from "react";
import Tween from "gsap/gsap-core";
export const OurProcessBorderTop = () => {
  useEffect(() => {
    Tween.to(".paint0", {
      repeat: -1,
      stopOpacity: 0,
      duration: 1,
      delay: 0.2,
    });
    Tween.to(".paint1", {
      repeat: -1,
      stopOpacity: 0,
      duration: 1,
      delay: 0.4,
    });
    Tween.to(".paint2", {
      repeat: -1,
      stopOpacity: 0,
      duration: 1,
      delay: 0.6,
    });
    Tween.to(".paint3", {
      repeat: -1,
      stopOpacity: 0,
      duration: 1,
      delay: 0.8,
    });
  }, []);
  return (
    <>
      <svg
        width="1312"
        height="652"
        viewBox="0 0 1312 652"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g clipPath="url(#clip0_2104_421)">
          <g filter="url(#filter0_d_2104_421)">
            <path
              d="M1021.77 522.164L863.476 752.387C854.158 765.94 838.763 774.037 822.316 774.037H489.365C472.917 774.037 457.523 765.94 448.204 752.387L289.913 522.164C278.192 505.117 278.192 482.61 289.913 465.563L448.205 235.34C457.523 221.787 472.917 213.689 489.365 213.689H822.316C838.763 213.689 854.158 221.787 863.477 235.34L1021.77 465.563C1033.49 482.61 1033.49 505.117 1021.77 522.164Z"
              stroke="url(#paint0_linear_2104_421)"
            />
          </g>
          <g filter="url(#filter1_f_2104_421)">
            <path
              d="M242.866 391.851L443.954 169.534H892.665L1087.11 391.851"
              stroke="#31D5F8"
              strokeWidth="53"
            />
          </g>
          <path
            d="M1089.08 526.998L902.638 782.617C891.921 797.309 874.821 806 856.625 806H458.375C440.179 806 423.079 797.309 412.362 782.617L225.921 526.998C211.36 507.035 211.36 479.965 225.921 460.002L412.362 204.383C423.079 189.691 440.179 181 458.375 181H856.625C874.821 181 891.921 189.691 902.638 204.383L1089.08 460.002C1103.64 479.965 1103.64 507.035 1089.08 526.998Z"
            stroke="url(#paint1_linear_2104_421)"
          />
          <path
            d="M1141.03 528.152L927.697 820.59C916.965 835.302 899.86 844 881.66 844H429.34C411.14 844 394.035 835.302 383.303 820.59L169.968 528.152C155.344 508.105 155.344 480.895 169.968 460.848L383.303 168.41C394.035 153.698 411.14 145 429.34 145H881.66C899.86 145 916.965 153.698 927.697 168.41L1141.03 460.848C1155.66 480.895 1155.66 508.105 1141.03 528.152Z"
            stroke="url(#paint2_linear_2104_421)"
          />
          <path
            d="M1183.04 524.081L948.939 844.617C938.207 859.312 921.097 868 902.894 868H409.106C390.903 868 373.794 859.312 363.062 844.617L128.959 524.08C114.347 504.074 114.347 476.926 128.959 456.92L363.062 136.383C373.794 121.688 390.903 113 409.106 113H902.894C921.097 113 938.207 121.688 948.939 136.383L1183.04 456.92C1197.65 476.926 1197.65 504.074 1183.04 524.081Z"
            stroke="url(#paint3_linear_2104_421)"
          />
        </g>
        <defs>
          <filter
            id="filter0_d_2104_421"
            x="239.622"
            y="167.189"
            width="872.437"
            height="683.348"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dx="20" dy="15" />
            <feGaussianBlur stdDeviation="30.5" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.25 0"
            />
            <feBlend
              mode="normal"
              in2="BackgroundImageFix"
              result="effect1_dropShadow_2104_421"
            />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="effect1_dropShadow_2104_421"
              result="shape"
            />
          </filter>
          <filter
            id="filter1_f_2104_421"
            x="61.213"
            y="-18.9661"
            width="1207.84"
            height="590.593"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="81"
              result="effect1_foregroundBlur_2104_421"
            />
          </filter>
          <linearGradient
            id="paint0_linear_2104_421"
            x1="641.266"
            y1="124.508"
            x2="627.389"
            y2="382.069"
            gradientUnits="userSpaceOnUse"
          >
            <stop className="paint0" stopColor="#0073FA" />
            <stop
              className="paint0"
              offset="1"
              stopColor="#177B7A"
              stopOpacity="0"
            />
          </linearGradient>
          <linearGradient
            id="paint1_linear_2104_421"
            x1="656.797"
            y1="186.621"
            x2="633.845"
            y2="644.725"
            gradientUnits="userSpaceOnUse"
          >
            <stop className="paint1" offset="0.342465" stopColor="#0073FA" />
            <stop
              className="paint1"
              offset="1"
              stopColor="#177B7A"
              stopOpacity="0"
            />
          </linearGradient>
          <linearGradient
            id="paint2_linear_2104_421"
            x1="654.715"
            y1="151.364"
            x2="649.499"
            y2="575.161"
            gradientUnits="userSpaceOnUse"
          >
            <stop
              className="paint2"
              offset="0.342465"
              stopColor="#0073FA"
              stopOpacity="0.48"
            />
            <stop
              className="paint2"
              offset="1"
              stopColor="#177B7A"
              stopOpacity="0"
            />
          </linearGradient>
          <linearGradient
            id="paint3_linear_2104_421"
            x1="655.15"
            y1="119.931"
            x2="649.524"
            y2="577.609"
            gradientUnits="userSpaceOnUse"
          >
            <stop
              className="paint3"
              offset="0.342465"
              stopColor="#0073FA"
              stopOpacity="0.16"
            />
            <stop
              className="paint3"
              offset="1"
              stopColor="#177B7A"
              stopOpacity="0"
            />
          </linearGradient>
          <clipPath id="clip0_2104_421">
            <rect width="1312" height="652" fill="white" />
          </clipPath>
        </defs>
      </svg>
    </>
  );
};
