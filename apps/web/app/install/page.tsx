import type { Metadata } from "next"
import { InstallContent } from "./install-content"

export const metadata: Metadata = {
  title: "Install — Agentis",
  description: "Setup guide for running Agentis locally",
}

export default function InstallPage() {
  return <InstallContent />
}
