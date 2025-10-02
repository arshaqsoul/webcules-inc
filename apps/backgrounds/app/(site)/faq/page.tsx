import { FAQAccordion } from "./faq-accordion";

export default async function FAQsPage() {
  return (
    <div className="overflow-x-hidden relative flex flex-col items-center justify-between">
      <div className="lg:max-w-[85rem] h-fit lg:px-16 w-full flex flex-col px-4 py-20 mt-10">
        <h1 className="text-2xl md:text-5xl text-white text-center">
          Questions & Answers
        </h1>
        <h2 className="text-[2.5vw] md:text-[1.5vw] py-4 text-gray-500 text-center">
          More questions, reach us on our email and we'll get in touch in a
          jiffy
        </h2>
        <FAQAccordion />
      </div>
    </div>
  );
}
