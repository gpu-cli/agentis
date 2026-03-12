"use client";

import { useEffect } from "react";
import { useModeStore } from "@multiverse/engine/app/modeStore";
import { TranscriptPage } from "@multiverse/engine/modes/transcript/TranscriptPage";

const AGENTIS_REPO_URL = "https://github.com/gpu-cli/agentis";

/**
 * Whether the in-app transcript upload is enabled.
 * When disabled, /transcript redirects to the home page.
 */
const transcriptUploadEnabled =
  process.env.NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT === "true";

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
      <div className="w-dvw h-dvh bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="font-pixel text-lg text-blue-400 mb-4">
            Local-Only Import
          </h1>
          <p className="text-sm text-gray-300 mb-6">
            Transcript import runs entirely on your machine.
            Clone the repo and run locally — your data never leaves your device.
          </p>
          <div className="bg-gray-900/80 border border-gray-700/40 rounded-lg px-4 py-3 mb-4">
            <code className="text-sm text-green-400 font-mono">
              git clone {AGENTIS_REPO_URL}.git && cd agentis && pnpm dev
            </code>
          </div>
          <div className="flex gap-3 justify-center">
            <a
              href="/"
              className="text-sm text-gray-400 hover:text-gray-200 underline underline-offset-2 transition-colors"
            >
              Back to Home
            </a>
            <a
              href="/install"
              className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
            >
              Install Guide
            </a>
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
      <TranscriptPage />
    </div>
  );
}
