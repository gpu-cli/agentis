"use client"

// ============================================================================
// Troubleshooting Page - Common issues and solutions for Agentis
// ============================================================================

import Link from "next/link"
import {
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@multiverse/ui"
import { Section } from "../components/Section"

const AGENTIS_REPO_URL = "https://github.com/gpu-cli/agentis"

function Issue({
  problem,
  children,
  code,
}: {
  problem: string
  children: React.ReactNode
  code?: string
}) {
  return (
    <div className="bg-background/70 border border-border/40 rounded-lg p-4 space-y-2">
      <div>
        <span className="text-xs uppercase tracking-wide text-red-400">
          Problem
        </span>
        <p className="text-sm text-foreground/80 mt-1">{problem}</p>
      </div>
      <div>
        <span className="text-xs uppercase tracking-wide text-green-400">
          Solution
        </span>
        <div className="text-sm text-muted-foreground mt-1">{children}</div>
      </div>
      {code && (
        <div className="bg-background/80 border border-border/40 rounded-lg px-4 py-3 mt-2">
          <code className="text-sm text-green-400 font-mono">{code}</code>
        </div>
      )}
    </div>
  )
}

function InlineCode({ children }: { children: string }) {
  return (
    <code className="text-xs text-foreground/80 font-mono bg-muted px-1.5 py-0.5 rounded">
      {children}
    </code>
  )
}

export function TroubleshootingContent() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-full h-screen flex flex-col bg-gradient-to-b from-background to-background text-foreground">
        {/* Toolbar */}
        <header className="h-14 bg-surface-1 border-b border-border flex items-center px-4 gap-3 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/"
                className="font-pixel text-xs text-orange-400 hover:text-orange-300 transition-colors no-underline"
                aria-label="Back to home"
              >
                HOME
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">Back to home</TooltipContent>
          </Tooltip>
          <div className="flex-1" />
          <span className="text-xs text-secondary font-pixel">
            TROUBLESHOOTING
          </span>
        </header>

        {/* Scrollable content */}
        <ScrollArea className="flex-1">
          <div className="w-full max-w-5xl mx-auto p-6 md:p-10">
          {/* Page intro */}
          <div className="mb-8">
            <h2 className="font-pixel text-sm text-green-400 mb-2 drop-shadow-[0_0_24px_rgba(74,222,128,0.35)]">
              Troubleshooting
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Common issues when running Agentis.
            </p>
          </div>

          {/* Setup & Running */}
          <Section title="Setup & Running">
            <div className="space-y-4">
              <Issue
                problem="Port already in use"
                code="npx @gpu-cli/agentis --port 3001"
              >
                Start on a different port:
              </Issue>
              <Issue
                problem="Browser does not open automatically"
                code="npx @gpu-cli/agentis --no-open"
              >
                Open the URL printed in the terminal manually, or use the{" "}
                <InlineCode>--no-open</InlineCode> flag:
              </Issue>
            </div>
          </Section>

          {/* Session Discovery */}
          <Section title="Session Discovery">
            <div className="space-y-4">
              <Issue problem="No sessions found">
                Check that <InlineCode>~/.claude/projects/</InlineCode> exists
                and contains <InlineCode>.jsonl</InlineCode> files. Run a Claude
                Code session first, then refresh the page. Set{" "}
                <InlineCode>CLAUDE_PROJECTS_PATH</InlineCode> if your
                transcripts are in a non-standard location.
              </Issue>
              <Issue problem="Sessions are stale or missing recent ones">
                The app re-scans when the window gets focus. Switch away and
                back, or click refresh. New sessions appear as soon as Claude
                Code writes transcript files.
              </Issue>
            </div>
          </Section>

          {/* Import & Visualization */}
          <Section title="Import & Visualization">
            <div className="space-y-4">
              <Issue problem="Transcript upload fails">
                Check that the transcript is a valid JSONL file: each line must
                be valid JSON and the file must not be empty. Only{" "}
                <InlineCode>.jsonl</InlineCode>,{" "}
                <InlineCode>.json</InlineCode>, and{" "}
                <InlineCode>.zip</InlineCode> files are accepted.
              </Issue>
              <Issue problem="Slow initial load on large files">
                Files over ~20 MB can take 10-30 seconds to process. Watch the
                progress bar for status.
              </Issue>
              <Issue problem="Blank screen or WebGL error">
                PixiJS v8 requires WebGL2. Use a modern browser (Chrome,
                Firefox, or Edge) and make sure hardware acceleration is enabled.
              </Issue>
            </div>
          </Section>

          {/* Node & Dependencies */}
          <Section title="Node.js & Dependencies">
            <div className="space-y-4">
              <Issue
                problem="Install or build commands fail"
                code="node --version"
              >
                Agentis requires Node.js 18+. Check your version:
              </Issue>
              <Issue problem="pnpm not found" code="corepack enable">
                Enable pnpm via Corepack (bundled with Node.js 16+):
              </Issue>
            </div>
          </Section>

          {/* Links */}
          <Section title="Still Stuck?">
            <div className="flex flex-wrap gap-4">
              <a
                href={`${AGENTIS_REPO_URL}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                Open an Issue
              </a>
              <Link
                href="/install"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                Install Guide
              </Link>
              <a
                href={AGENTIS_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                GitHub Repository
              </a>
            </div>
          </Section>

          </div>
        </ScrollArea>

        {/* Footer — pinned to bottom */}
        <footer className="shrink-0 border-t border-border bg-surface-1/80 px-4 py-3 text-center text-xs text-muted-foreground/50">
          Open source &middot; MIT License &middot;{" "}
          <a
            href={AGENTIS_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
          >
            gpu-cli/agentis
          </a>
        </footer>
      </div>
    </TooltipProvider>
  )
}
