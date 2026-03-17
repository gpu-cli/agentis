import type { Metadata } from "next";
import { GameContent } from "./game-content";

export const metadata: Metadata = {
  title: "Game — Agentis",
  description: "Interactive pixel-art world visualizing coding sessions",
};

export default function GamePage() {
  return <GameContent />;
}
