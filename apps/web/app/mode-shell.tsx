"use client";

import { ModeShell } from "@multiverse/engine/app/ModeShell";

export default function ModeShellWrapper() {
  return (
    <div className="w-dvw h-dvh relative overflow-hidden">
      <ModeShell />
    </div>
  );
}
