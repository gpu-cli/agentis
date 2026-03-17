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
  title: "Agentis",
  description: "PixiJS game visualizing code repositories as pixel-art worlds",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${pixelFont.variable} dark`} style={{ colorScheme: "dark" }}>
      <head>
        <meta name="theme-color" content="#030712" />
      </head>
      <body className="bg-background text-foreground overflow-hidden">{children}</body>
    </html>
  );
}
