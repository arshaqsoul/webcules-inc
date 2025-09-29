"use client";
import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@webcules/ui/lib/utils";

export const LeftHexa = ({ className }: { className?: string }) => {
  return (
    <motion.div
      className={cn("", className)}
      animate={{
        transition: { duration: 2 },
      }}
    >
      <Image
        src={"imgs/left-hexa.svg"}
        alt="left-hexa"
        width={200}
        height={100}
        style={{
          objectFit: "cover",
        }}
      />
    </motion.div>
  );
};

export const RightHexa = ({ className }: { className?: string }) => {
  return (
    <motion.div
      className={cn("", className)}
      animate={{
        transition: { duration: 2 },
      }}
    >
      <Image
        src={"imgs/right-hexa.svg"}
        alt="right-hexa"
        width={200}
        height={100}
        style={{
          objectFit: "cover",
        }}
      />
    </motion.div>
  );
};
