"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useModeStore } from "@multiverse/engine/app/modeStore";
import { TranscriptPage } from "@multiverse/engine/modes/transcript/TranscriptPage";

const AGENTIS_REPO_URL = "https://github.com/gpu-cli/agentis";

/**
 * Whether the in-app transcript upload is enabled.
 * When disabled, /transcript redirects to the home page.
 */
const transcriptUploadEnabled =
  process.env.NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT === "true";

/** Whether local session discovery APIs are available */
const isLocalMode = process.env.NEXT_PUBLIC_AGENTIS_LOCAL === "true";

/**
 * Shell that auto-sets transcript mode and renders the TranscriptPage.
 * Used by the /transcript route so E2E tests and direct links work.
 *
 * When transcript upload is disabled (hosted app without env flag),
 * shows a redirect message pointing users to the local install.
 */
export default function TranscriptShellInner() {
  const mode = useModeStore((s) => s.mode);
  const setMode = useModeStore((s) => s.setMode);

  useEffect(() => {
    if (!transcriptUploadEnabled) return;
    if (mode !== "transcript") {
      setMode("transcript");
    }
  }, [mode, setMode]);

  if (!transcriptUploadEnabled) {
    return (
      <div className="w-dvw h-dvh bg-gradient-to-b from-background to-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="text-4xl mb-4">🏃</div>
          <h1 className="font-pixel text-lg text-secondary mb-4">
            Run Locally
          </h1>
          <p className="text-sm text-foreground/80 mb-6">
            Transcript import runs entirely on your machine.
            Run Agentis locally and your data never leaves your device.
          </p>
          <div className="bg-background/80 border border-border/40 rounded-lg px-4 py-3 mb-4">
            <code className="text-sm text-green-400 font-mono">
              npx @gpu-cli/agentis
            </code>
          </div>
          <p className="text-xs text-muted-foreground/70 mb-6">
            Or from source:{" "}
            <code className="text-muted-foreground font-mono">
              cd ~/Development/agentis && pnpm dev
            </code>
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Back to Home
            </Link>
            <Link
              href="/install"
              className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
            >
              Install Guide
            </Link>
            <a
              href={AGENTIS_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
            >
              View Source
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-dvw h-dvh relative overflow-hidden">
      <TranscriptPage
        isLocalEnabled={isLocalMode}
        localInstallUrl={isLocalMode ? undefined : "/install"}
      />
    </div>
  );
}
