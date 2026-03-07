"use client";

import dynamic from "next/dynamic";

const DemoShell = dynamic(() => import("./demo-shell"), { ssr: false });

export function GameContent() {
  return <DemoShell />;
}
