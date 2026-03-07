"use client";

import { ModeShell } from "@multiverse/engine/app/ModeShell";

/**
 * Whether the in-app transcript upload is enabled.
 *
 * Set NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT=true in the environment
 * to enable the upload flow (internal use / local development).
 *
 * When unset or false, the hosted app shows a "Run Locally" CTA
 * linking to the open-source @agentis/local package instead.
 */
const transcriptUploadEnabled =
  process.env.NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT === "true";

export default function ModeShellWrapper() {
  return (
    <div className="w-dvw h-dvh relative overflow-hidden">
      <ModeShell transcriptUploadEnabled={transcriptUploadEnabled} />
    </div>
  );
}
