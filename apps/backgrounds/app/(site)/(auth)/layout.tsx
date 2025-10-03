import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { checkUserAuth } from "@/lib/actions/auth-actions";

export const metadata: Metadata = {
  metadataBase: new URL("https://background.webcules.com"),
  title:
    "Webcules Backgrounds | High-Quality Midjourney Design Backdrops for Creatives",
  description:
    "Explore Webcules Backgrounds, your source for high-quality design backdrops. Enhance your projects with a variety of stunning backgrounds, from ethereal fluid art to modern textures and beyond. Whether you're designing websites, presentations, or digital art, find the perfect backdrop to elevate your creativity. Discover the convenience of ready-to-use backgrounds and streamline your design process. Join today and access a wealth of inspiring visuals at background.webcules.com.",
  applicationName: "Webcules Inc.",
  twitter: {
    card: "summary_large_image",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await checkUserAuth();
  if (user.isAuthenticated) redirect("/dashboard");
  return (
    <div className="h-screen w-screen bg-[url('/lumina-9.jpg')] bg-black bg-cover">
      <div className="bg-black/50 backdrop-blur-sm absolute h-screen w-screen" />
      <div className="w-full h-full px-8 pb-16 pt-32 lg:px-16 xl:px-24 z-10 absolute ">
        <div className="h-full bg-zinc-900 lg:grid lg:grid-cols-4 rounded-3xl overflow-clip">
          <div className="flex items-center justify-center">{children}</div>
          <div className="hidden bg-muted lg:col-span-3 lg:grid  max-h-svh w-full relative">
            <Image
              src={"/lumina-9.jpg"}
              alt="login background ai generated"
              fill
              style={{ objectFit: "cover" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
