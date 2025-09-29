import type { Metadata } from "next";
import { WebculesFloatingNav } from "@/components/shared/webcules-floating-navbar";
import { WebculesNav } from "@/components/shared/webcules-nav";
import { Footer } from "@/components/shared/footer";

export const metadata: Metadata = {
  title: {
    default: "Webcules | Custom Software Dev, Design & Data Engineering",
    template: "%s - Webcules",
  },
  description:
    "Discover comprehensive digital solutions at Webcules. We specialize in custom software development, data engineering, and UI/UX design. Our expert team delivers innovative and scalable solutions tailored to your business needs. Turn your digital vision into reality with Webcules. Contact us today to elevate your business with cutting-edge technology.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <WebculesFloatingNav />
      <WebculesNav />
      {children}
      <Footer />
    </>
  );
}
