import type { Metadata } from "next"
import { TroubleshootingContent } from "./troubleshooting-content"

export const metadata: Metadata = {
  title: "Troubleshooting — Agentis",
  description: "Common issues and solutions for Agentis",
}

export default function TroubleshootingPage() {
  return <TroubleshootingContent />
}
