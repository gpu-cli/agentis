"use client";

import dynamic from "next/dynamic";

const ModeShell = dynamic(() => import("./mode-shell"), { ssr: false });

export function HomeContent() {
  return <ModeShell />;
}
