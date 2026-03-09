"use client"

// ============================================================================
// Install Page — docs/install content for hosted app
//
// Shows why to run locally, install steps, requirements, transcript
// locations, and links to the GitHub repo. Matches Multiverse UI aesthetic.
// ============================================================================

const AGENTIS_REPO_URL = "https://github.com/gpu-cli/agentis"

function CopyButton({ text }: { text: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback: select the text for manual copy
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="cursor-pointer text-gray-500 hover:text-gray-300 transition-colors text-xs ml-2"
      title="Copy to clipboard"
    >
      📋
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
      <h2 className="font-pixel text-sm text-blue-400 mb-3">{title}</h2>
      {children}
    </div>
  )
}

export function InstallContent() {
  return (
    <div className="w-full h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100 overflow-y-auto">
      <div className="w-full max-w-2xl mx-auto p-6 md:p-10">
        {/* Header */}
        <div className="mb-8">
          <a
            href="/"
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors mb-4 inline-block"
          >
            ← Back
          </a>
          <h1 className="font-pixel text-lg text-green-400 mb-2 drop-shadow-[0_0_24px_rgba(74,222,128,0.35)]">
            Run Locally
          </h1>
          <p className="text-sm text-gray-300">
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
                <div className="text-xs font-medium text-gray-200 mb-1">
                  {item.label}
                </div>
                <div className="text-[11px] text-gray-500">{item.desc}</div>
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
          <p className="text-xs text-gray-500 mt-2">
            Opens on{" "}
            <code className="text-gray-400 bg-gray-800 px-1 rounded">
              http://localhost:3000
            </code>
            . Upload your transcripts and explore.
          </p>
        </Section>

        {/* Requirements */}
        <Section title="Requirements">
          <ul className="text-sm text-gray-400 space-y-1">
            <li>
              •{" "}
              <span className="text-gray-200">Node.js 18+</span> — check with{" "}
              <code className="text-xs text-gray-300 bg-gray-800 px-1 rounded">
                node --version
              </code>
            </li>
            <li>
              •{" "}
              <span className="text-gray-200">pnpm</span> — enable with{" "}
              <code className="text-xs text-gray-300 bg-gray-800 px-1 rounded">
                corepack enable
              </code>
            </li>
            <li>
              • A modern browser with WebGL2 (Chrome, Firefox, Edge, Safari 15+)
            </li>
          </ul>
        </Section>

        {/* Transcript Locations */}
        <Section title="Where Are My Transcripts?">
          <div className="bg-gray-950/70 border border-gray-700/40 rounded-lg p-4 space-y-3">
            <div>
              <div className="text-xs text-gray-200 font-medium mb-1">
                Claude Code
              </div>
              <div className="text-xs text-gray-500">
                <code className="text-gray-400 bg-gray-800 px-1 rounded">
                  ~/.claude/projects/
                </code>{" "}
                — JSONL files in session directories
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            More transcript formats coming soon (Cursor, Copilot, Codex).
          </p>
        </Section>

        {/* Links */}
        <Section title="Learn More">
          <div className="flex flex-wrap gap-3">
            <a
              href={AGENTIS_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
            >
              GitHub Repository
            </a>
            <a
              href={`${AGENTIS_REPO_URL}/blob/main/docs/quickstart.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
            >
              Quickstart Guide
            </a>
            <a
              href={`${AGENTIS_REPO_URL}/blob/main/docs/troubleshooting.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
            >
              Troubleshooting
            </a>
          </div>
        </Section>

        {/* Footer */}
        <div className="text-center text-[11px] text-gray-600 mt-12 pb-8">
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
    </div>
  )
}
