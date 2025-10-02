import { Input } from "@webcules/ui/components/input";
import SubmitButton from "./submit-button";

export const NewsLetterForm = ({ inUpdates }: { inUpdates?: boolean }) => {
  return (
    <div
      className={`flex flex-col justify-center gap-y-2 z-10 + ${
        inUpdates
          ? "w-full sm:w-4/5 text-center py-4 items-center"
          : "items-start"
      }`}
    >
      <h1
        className={`text-white + ${
          inUpdates ? "text-2xl md:text-5xl text-center" : "text-lg md:text-2xl"
        }`}
      >
        Get notified when new backgrounds drop
      </h1>
      <h3
        className={`text-gray-500 + ${
          inUpdates ? "text-[2.5vw] md:text-[1.5vw]" : "text-sm md:text-lg"
        }`}
      >
        We publish new curated backgrounds bi-weekly and often with freebies, so
        let us keep you posted for free
      </h3>
      <form action="" className="flex flex-row w-2/3 gap-x-1">
        <Input
          className="basis-3/4 bg-darkest border-[0.25px] border-white/50 text-white"
          key={"email"}
          name={"email"}
          type="email"
          placeholder="m@example.com"
        />
        <SubmitButton text="Notify Me" id="notify" />
      </form>
    </div>
  );
};
