import type { Metadata } from "next";
import { GameContent } from "./game-content";

export const metadata: Metadata = {
  title: "Game — Multiverse",
  description: "Interactive pixel-art world visualizing coding sessions",
};

export default function GamePage() {
  return <GameContent />;
}
