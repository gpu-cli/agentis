import type { Metadata } from "next";
import { TranscriptShell } from "./transcript-shell";

export const metadata: Metadata = {
  title: "Transcript — Multiverse",
  description: "Upload and replay coding session transcripts as pixel-art worlds",
};

export default function TranscriptPage() {
  return <TranscriptShell />;
}
