"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "@webcules/ui/lib/utils";

interface BoxesCoreProps extends React.ComponentPropsWithoutRef<"div"> {
  className?: string;
  colors?: string[];
  rowCount?: number;
  colCount?: number;
}

const defaultColors = [
  "--sky-500",
  "--pink-300",
  "--purple-300",
  "--indigo-300",
  "--violet-300",
];

export const BoxesCore = ({
  className,
  colors,
  rowCount = 150,
  colCount = 100,
  ...rest
}: BoxesCoreProps) => {
  const rows = new Array(rowCount).fill(1);
  const cols = new Array(colCount).fill(1);

  const finalColors = colors && colors.length > 0 ? colors : defaultColors;

  const getRandomColor = () => {
    return finalColors[Math.floor(Math.random() * finalColors.length)];
  };

  return (
    <div
      style={{
        transform: `translate(40%,-30%) skewX(-48deg) skewY(14deg) scale(1) rotate(0deg) translateZ(0)`,
      }}
      className={cn(
        "absolute -top-1/4 left-1/4 z-0 flex h-full w-full -translate-x-1/2 -translate-y-1/2 p-4",
        className
      )}
      {...rest}
    >
      {rows.map((_, i) => (
        <motion.div
          key={`row` + i}
          className="relative w-32 h-16 border-l border-slate-700"
        >
          {cols.map((_, j) => (
            <motion.div
              whileHover={{
                backgroundColor: `var(${getRandomColor()})`,
                transition: { duration: 0 },
              }}
              animate={{
                transition: { duration: 2 },
              }}
              key={`col` + j}
              className="relative w-32 h-16 border-t border-r border-slate-700"
            ></motion.div>
          ))}
        </motion.div>
      ))}
    </div>
  );
};

export const Boxes = React.memo(BoxesCore);
