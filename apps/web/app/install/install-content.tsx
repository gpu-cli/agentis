"use client"

// ============================================================================
// Install Page - Setup guide for running Agentis locally
// ============================================================================

import { useState } from "react"
import Link from "next/link"
import {
  Button,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@multiverse/ui"
import { Copy, Check } from "lucide-react"
import { Section } from "../components/Section"

const AGENTIS_REPO_URL = "https://github.com/gpu-cli/agentis"

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // Fallback: silent fail
      })
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          className="ml-2 h-7 w-7 shrink-0 text-muted-foreground/70 hover:text-foreground/80"
          aria-label={copied ? "Copied" : "Copy to clipboard"}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied!" : "Copy to clipboard"}</TooltipContent>
    </Tooltip>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="bg-background/80 border border-border/40 rounded-lg px-4 py-3 flex items-center justify-between">
      <code className="text-sm text-green-400 font-mono">{children}</code>
      <CopyButton text={children} />
    </div>
  )
}

export function InstallContent() {
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
          <span className="text-xs text-secondary font-pixel">INSTALL</span>
        </header>

        {/* Scrollable content */}
        <ScrollArea className="flex-1">
          <div className="w-full max-w-5xl mx-auto p-6 md:p-10">
          {/* Page intro */}
          <div className="mb-8">
            <h2 className="font-pixel text-sm text-green-400 mb-2 drop-shadow-[0_0_24px_rgba(74,222,128,0.35)]">
              Run Agentis Locally
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Visualize your coding sessions as an interactive pixel-art world.
              Everything runs on your machine. No data leaves your device.
            </p>
          </div>

          {/* npx quick start */}
          <Section title="Quick Start">
            <p className="text-sm text-muted-foreground mb-3">
              Run a single command:
            </p>
            <CodeBlock>npx @gpu-cli/agentis</CodeBlock>
            <p className="text-xs text-muted-foreground/70 mt-3">
              Auto-discovers Claude Code sessions from{" "}
              <code className="text-foreground/80 font-mono bg-muted px-1.5 py-0.5 rounded">
                ~/.claude/projects/
              </code>{" "}
              and opens at{" "}
              <code className="text-foreground/80 font-mono bg-muted px-1.5 py-0.5 rounded">
                http://127.0.0.1:3456
              </code>
              .
            </p>

            <h3 className="text-xs uppercase tracking-wide text-muted-foreground mt-5 mb-2">Options</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>
                <code className="text-foreground/80 font-mono bg-muted px-1.5 py-0.5 rounded">
                  --port &lt;number&gt;
                </code>{" "}
                &mdash; Run on a custom port
              </li>
              <li>
                <code className="text-foreground/80 font-mono bg-muted px-1.5 py-0.5 rounded">
                  --no-open
                </code>{" "}
                &mdash; Don&apos;t open the browser automatically
              </li>
            </ul>
          </Section>

          {/* Requirements */}
          <Section title="Requirements">
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>
                &bull;{" "}
                <a
                  href="https://nodejs.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
                >
                  Node.js 18+
                </a>{" "}
                (check with{" "}
                <code className="text-xs text-foreground/80 font-mono bg-muted px-1.5 py-0.5 rounded">
                  node --version
                </code>
                )
              </li>
              <li>
                &bull; Modern browser with WebGL2 (Chrome, Firefox, Edge, Safari
                15+)
              </li>
            </ul>
          </Section>

          {/* Links */}
          <Section title="Links">
            <div className="flex flex-wrap gap-4">
              <Link
                href="/troubleshooting"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                Troubleshooting
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
