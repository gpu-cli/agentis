import type { Metadata } from "next";
import { HomeContent } from "./home-content";

export const metadata: Metadata = {
  title: "Agentis",
  description: "Visualize coding sessions as an interactive pixel-art world",
};

export default function Home() {
  return <HomeContent />;
}
