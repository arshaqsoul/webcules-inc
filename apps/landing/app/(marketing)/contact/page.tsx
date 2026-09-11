import type { Metadata } from "next/types";
import Link from "next/link";
import { Calendar, Mail, MessageCircle } from "lucide-react";

import { CTAButton } from "@/components/shared/cta-button";

export const metadata: Metadata = {
  title: "Contact | Webcules",
  description:
    "Tell us about your project — book a discovery call, email us, or message us on WhatsApp.",
};

const channels = [
  {
    icon: Calendar,
    title: "Book a discovery call",
    description:
      "A free 30-minute call to scope your project, timeline and budget.",
    action: <CTAButton pricing={false} />,
  },
  {
    icon: Mail,
    title: "Email us",
    description: "Send us the details and we will reply within one business day.",
    action: (
      <Link
        href="mailto:business@webcules.com?subject=Project%20inquiry"
        className="inline-flex items-center gap-x-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
      >
        business@webcules.com
      </Link>
    ),
  },
  {
    icon: MessageCircle,
    title: "WhatsApp",
    description: "Prefer to chat? Message us any time and we will respond quickly.",
    action: (
      <Link
        href="https://wa.me/16399986044?text=I%27m%20interested%20in%20your%20services%2C%20let%27s%20talk"
        className="inline-flex items-center gap-x-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
        target="_blank"
        rel="noopener noreferrer"
      >
        +1 639 998 6044
      </Link>
    ),
  },
];

export default function ContactPage() {
  return (
    <div className="relative flex flex-col items-center bg-darkest pt-40 pb-32 min-h-[80vh]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(99,102,241,0.35) 0%, transparent 70%)",
        }}
      />
      <div className="relative z-10 w-full max-w-5xl px-6">
        <div className="text-center">
          <span className="whitespace-nowrap rounded-3xl bg-black px-2.5 py-1.5 text-sm text-gray-50 border border-gray-500">
            Contact
          </span>
          <h1 className="mt-6 text-4xl sm:text-5xl font-medium leading-tight text-white">
            Let&apos;s build something together
          </h1>
          <p className="mt-4 text-base text-slate-400 max-w-xl mx-auto">
            Tell us where you want to go — we will map the fastest route from
            concept to creation.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {channels.map((channel) => (
            <div
              key={channel.title}
              className="flex flex-col gap-y-4 rounded-3xl border-[0.5px] border-gray-700 bg-black/40 p-8 transition-colors hover:border-indigo-500/50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500">
                <channel.icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg text-white">{channel.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                  {channel.description}
                </p>
              </div>
              <div className="mt-auto pt-2">{channel.action}</div>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <Link
            href="https://arshaq.webcules.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mx-auto flex max-w-xl items-center gap-x-4 rounded-3xl border-[0.5px] border-gray-700 bg-black/40 p-6 text-left transition-colors hover:border-indigo-500/50"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 text-base font-semibold text-white">
              A
            </div>
            <div className="flex-1">
              <p className="text-sm text-white">
                Who you&apos;ll be working with — Arshaq Hisham
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                Product judgment with real engineering depth: platforms, search and
                applied AI. Full profile, projects and experience →
              </p>
            </div>
            <span aria-hidden className="text-sm text-slate-400">
              →
            </span>
          </Link>
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Based in Saskatoon, Canada — working with clients worldwide.
        </p>
      </div>
    </div>
  );
}
