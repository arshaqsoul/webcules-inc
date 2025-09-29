import { Geist, Geist_Mono } from "next/font/google";

import "@webcules/ui/globals.css";
import { Providers } from "@/components/providers";
import { type Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://webcules.com"),
  title: "Webcules | Custom Software Dev, Design & Data Engineering",
  description:
    "Discover comprehensive digital solutions at Webcules. We specialize in custom software development, data engineering, and UI/UX design. Our expert team delivers innovative and scalable solutions tailored to your business needs. Turn your digital vision into reality with Webcules. Contact us today to elevate your business with cutting-edge technology.",
  applicationName: "Webcules Inc.",
  twitter: {
    card: "summary_large_image",
  },
};

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased `}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
