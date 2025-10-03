"use client";
import { Button } from "@webcules/ui/components/button";
import { LoaderCircle } from "lucide-react";
import { JSX } from "react";

export default function SubmitButton({
  text,
  icon,
  id,
  disabled = false,
}: {
  text: string;
  icon?: JSX.Element;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="default"
      type="submit"
      disabled={disabled}
      className={`w-full ${
        id === "notify"
          ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white basis-1/4"
          : "bg-black"
      }`}
    >
      {!disabled && (
        <span className="flex items-center justify-between gap-x-2">
          {icon}
          {text}
        </span>
      )}
      {disabled && (
        <span className="flex items-center justify-between">
          <LoaderCircle className="animate-spin mr-3 text-white" size={12} />
          Processing...
        </span>
      )}
    </Button>
  );
}
