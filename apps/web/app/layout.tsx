import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import "./globals.css";

// next/font/google downloads & self-hosts at build time — no runtime requests
const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Multiverse",
  description: "PixiJS game visualizing code repositories as pixel-art worlds",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={pixelFont.variable}>
      <body className="bg-gray-900 text-white overflow-hidden">{children}</body>
    </html>
  );
}
