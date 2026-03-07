import type { Metadata } from "next";
import { DemoContent } from "./demo-content";

export const metadata: Metadata = {
  title: "Demo — Multiverse",
  description: "Explore UI components from the @multiverse/ui library",
};

export default function DemoPage() {
  return <DemoContent />;
}
