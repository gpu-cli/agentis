"use client"

// ============================================================================
// Install Page — docs/install content for hosted app
//
// Shows why to run locally, install steps, requirements, transcript
// locations, and links to the GitHub repo. Matches Multiverse UI aesthetic.
//
// Typography system (consistent across Multiverse):
//   App title (toolbar):   text-xs  text-green-400  font-pixel
//   Page heading:          text-sm  text-green-400  font-pixel
//   Section heading:       text-xs  text-blue-400   font-pixel
//   Body:                  text-sm  text-gray-400
//   Body emphasis:         text-sm  text-gray-200
//   Caption/helper:        text-xs  text-gray-500
//   Code inline:           text-xs  text-gray-300   font-mono
//   Code block:            text-sm  text-green-400  font-mono
//   Badge (toolbar):       text-xs  varies          font-pixel
//   Link:                  text-sm  text-blue-400
//   Footer:                text-xs  text-gray-600
// ============================================================================

import { useState } from "react"
import { ScrollArea } from "@multiverse/ui"
import { Copy, Check } from "lucide-react"

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
    <button
      onClick={handleCopy}
      className="cursor-pointer text-gray-500 hover:text-gray-300 transition-colors ml-2 shrink-0"
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="bg-gray-950/80 border border-gray-700/40 rounded-lg px-4 py-3 flex items-center justify-between">
      <code className="text-sm text-green-400 font-mono">{children}</code>
      <CopyButton text={children} />
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-8">
      <h2 className="font-pixel text-xs text-blue-400 mb-3">{title}</h2>
      {children}
    </div>
  )
}

export function InstallContent() {
  return (
    <div className="w-full h-screen flex flex-col bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100">
      {/* Toolbar — matches DemoPage header pattern */}
      <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-3 shrink-0">
        <a
          href="/"
          className="text-gray-400 hover:text-white text-sm mr-1 transition-colors"
          title="Back to mode selection"
        >
          ←
        </a>
        <h1 className="font-pixel text-xs text-green-400">Multiverse</h1>
        <div className="flex-1" />
        <span className="text-xs text-blue-400 font-pixel">INSTALL</span>
      </header>

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="w-full max-w-3xl mx-auto p-6 md:p-10">
          {/* Page intro */}
          <div className="mb-8">
            <h2 className="font-pixel text-sm text-green-400 mb-2 drop-shadow-[0_0_24px_rgba(74,222,128,0.35)]">
              Run Locally
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Visualize your AI coding sessions on your own machine. No server, no
              cloud — everything runs in your browser.
            </p>
          </div>

          {/* Why Local */}
          <Section title="Why Local?">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  icon: "🔒",
                  label: "Private",
                  desc: "Transcripts never leave your machine",
                },
                {
                  icon: "⚡",
                  label: "Fast",
                  desc: "All processing happens in-browser",
                },
                {
                  icon: "🌐",
                  label: "Offline",
                  desc: "Works without an internet connection",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-gray-950/70 border border-gray-700/40 rounded-lg p-4 text-center"
                >
                  <div className="text-xl mb-2">{item.icon}</div>
                  <div className="text-sm font-medium text-gray-200 mb-1">
                    {item.label}
                  </div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Install */}
          <Section title="Get Started">
            <div className="space-y-2">
              <CodeBlock>{`git clone ${AGENTIS_REPO_URL}.git`}</CodeBlock>
              <CodeBlock>{"cd agentis && pnpm install && pnpm dev"}</CodeBlock>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Opens on{" "}
              <code className="text-gray-300 font-mono bg-gray-800 px-1.5 py-0.5 rounded">
                http://localhost:3000
              </code>
              . Upload your transcripts and explore.
            </p>
          </Section>

          {/* Requirements */}
          <Section title="Requirements">
            <ul className="text-sm text-gray-400 space-y-2">
              <li>
                •{" "}
                <a
                  href="https://nodejs.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
                >
                  Node.js 18+
                </a>{" "}
                — check with{" "}
                <code className="text-xs text-gray-300 font-mono bg-gray-800 px-1.5 py-0.5 rounded">
                  node --version
                </code>
              </li>
              <li>
                •{" "}
                <a
                  href="https://pnpm.io/installation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
                >
                  pnpm
                </a>{" "}
                — enable with{" "}
                <code className="text-xs text-gray-300 font-mono bg-gray-800 px-1.5 py-0.5 rounded">
                  corepack enable
                </code>
              </li>
              <li>
                • A modern browser with WebGL2 (Chrome, Firefox, Edge, Safari
                15+)
              </li>
            </ul>
          </Section>

          {/* Transcript Locations */}
          <Section title="Where Are My Transcripts?">
            <div className="bg-gray-950/70 border border-gray-700/40 rounded-lg p-4 space-y-3">
              <div>
                <div className="text-sm text-gray-200 font-medium mb-1">
                  Claude Code
                </div>
                <div className="text-sm text-gray-400">
                  <code className="text-xs text-gray-300 font-mono bg-gray-800 px-1.5 py-0.5 rounded">
                    ~/.claude/projects/
                  </code>{" "}
                  — JSONL files in session directories
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              More transcript formats coming soon (Cursor, Copilot, Codex).
            </p>
          </Section>

          {/* Links */}
          <Section title="Learn More">
            <div className="flex flex-wrap gap-4">
              <a
                href={AGENTIS_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                GitHub Repository
              </a>
              <a
                href={`${AGENTIS_REPO_URL}/blob/main/docs/quickstart.md`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                Quickstart Guide
              </a>
              <a
                href={`${AGENTIS_REPO_URL}/blob/main/docs/troubleshooting.md`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                Troubleshooting
              </a>
            </div>
          </Section>

          {/* Footer */}
          <div className="text-center text-xs text-gray-600 mt-12 pb-8">
            Open source &middot; MIT License &middot;{" "}
            <a
              href={AGENTIS_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-400 transition-colors"
            >
              gpu-cli/agentis
            </a>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
