"use client";
import { Button } from "@webcules/ui/components/button";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { JSX } from "react";

export default function SubmitButton({
  text,
  icon,
  id,
}: {
  text: string;
  icon?: JSX.Element;
  id?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      variant="default"
      type="submit"
      disabled={pending}
      className={`w-full ${
        id === "notify"
          ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white basis-1/4"
          : "bg-black"
      }`}
    >
      {!pending && (
        <span className="flex items-center justify-between gap-x-2">
          {icon}
          {text}
        </span>
      )}
      {pending && (
        <span className="flex items-center justify-between">
          <LoaderCircle className="animate-spin mr-3 text-white" size={12} />
          Processing...
        </span>
      )}
    </Button>
  );
}
