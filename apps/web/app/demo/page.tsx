import type { Metadata } from "next";
import { DemoContent } from "./demo-content";

export const metadata: Metadata = {
  title: "Demo — Agentis",
  description: "Explore UI components from the @multiverse/ui library",
};

export default function DemoPage() {
  return <DemoContent />;
}
