"use client";

import dynamic from "next/dynamic";

const TranscriptShellInner = dynamic(
  () => import("./transcript-shell-inner"),
  { ssr: false }
);

export function TranscriptShell() {
  return <TranscriptShellInner />;
}
