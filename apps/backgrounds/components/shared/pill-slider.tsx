"use client";
import { cn } from "@webcules/ui/lib/utils";
import { motion, AnimatePresence, Variants } from "framer-motion";
import React, { useState, useRef, useCallback } from "react";

export const PillSlider = ({
  images,
  children,
  overlay = true,
  overlayClassName,
  className,
  autoplay = true,
  direction = "up",
}: {
  images: string[];
  children: React.ReactNode;
  overlay?: React.ReactNode;
  overlayClassName?: string;
  className?: string;
  autoplay?: boolean;
  direction?: "up" | "down";
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<HTMLImageElement[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Preload images only on client side
  const preloadImages = useCallback(() => {
    if (typeof window === "undefined") return; // Skip during SSR
    const imageObjects = images.map((src) => {
      const img = new window.Image(); // Use window.Image for clarity
      img.src = src;
      return img;
    });
    setLoadedImages(imageObjects);
  }, [images]);

  // Run preload only on client side
  if (
    loadedImages.length === 0 &&
    images.length > 0 &&
    typeof window !== "undefined"
  ) {
    preloadImages();
  }

  // Handle next slide
  const handleNext = useCallback(() => {
    setCurrentIndex((prevIndex) =>
      prevIndex + 1 === images.length ? 0 : prevIndex + 1
    );
  }, [images.length]);

  // Handle previous slide
  const handlePrevious = useCallback(() => {
    setCurrentIndex((prevIndex) =>
      prevIndex - 1 < 0 ? images.length - 1 : prevIndex - 1
    );
  }, [images.length]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        handleNext();
      } else if (event.key === "ArrowLeft") {
        handlePrevious();
      }
    },
    [handleNext, handlePrevious]
  );

  // Autoplay logic
  const startAutoplay = useCallback(() => {
    if (autoplay && !intervalRef.current && typeof window !== "undefined") {
      intervalRef.current = setInterval(handleNext, 5000);
    }
  }, [autoplay, handleNext]);

  const stopAutoplay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Attach keyboard listener only on client side
  if (typeof window !== "undefined" && !window.onkeydown) {
    window.addEventListener("keydown", handleKeyDown);
  }

  // Start autoplay if enabled and on client
  if (autoplay && loadedImages.length > 0 && typeof window !== "undefined") {
    startAutoplay();
  }

  const slideVariants: Variants = {
    hidden: {
      scale: 0,
      opacity: 0,
      rotateX: 45,
    },
    visible: {
      scale: 1,
      rotateX: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
        ease: [0.645, 0.045, 0.355, 1.0],
      },
    },
    upExit: {
      opacity: 1,
      y: "-150%",
      transition: {
        duration: 1,
      },
    },
    downExit: {
      opacity: 1,
      y: "150%",
      transition: {
        duration: 1,
      },
    },
  };

  const areImagesLoaded = loadedImages.length > 0;

  return (
    <div
      className={cn(
        "overflow-hidden h-full w-full relative flex items-center justify-center",
        className
      )}
      style={{
        perspective: "1000px",
      }}
      onMouseEnter={stopAutoplay}
      onMouseLeave={startAutoplay}
    >
      {areImagesLoaded && children}
      {areImagesLoaded && overlay && (
        <div
          className={cn("absolute inset-0 bg-black/60 z-40", overlayClassName)}
        />
      )}

      {areImagesLoaded && (
        <AnimatePresence>
          <motion.img
            key={currentIndex}
            src={loadedImages[currentIndex]?.src || images[currentIndex] || ""}
            initial="hidden"
            animate="visible"
            exit={direction === "up" ? "upExit" : "downExit"}
            variants={slideVariants}
            className="image h-full w-full absolute inset-0 object-cover object-center"
          />
        </AnimatePresence>
      )}
    </div>
  );
};
