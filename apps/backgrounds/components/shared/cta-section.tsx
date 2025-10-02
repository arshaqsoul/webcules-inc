import Image from "next/image";
import { NewsLetterForm } from "./newsletter-form";

export const CTASection = () => {
  return (
    <div className="overflow-x-hidden relative flex items-center justify-center">
      <div className="lg:max-w-[85rem] lg:px-16 h-fit w-full px-4 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 rounded-xl overflow-clip relative">
          <div className="absolute h-full w-full bg-gradient-to-r from-transparent via-black to-black z-10"></div>
          <div className="h-52 w-full relative rotate-180 z-0">
            <Image
              src={"/lumina-12.jpg"}
              alt="ai generated image fo liquid gradient background perfect for new project hero landing pages"
              fill
              style={{ objectFit: "cover" }}
            />
          </div>
          <NewsLetterForm />
        </div>
      </div>
    </div>
  );
};
