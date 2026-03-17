"use client";

import { ModeShell } from "@multiverse/engine/app/ModeShell";
import { useRouter } from "next/navigation";

const isLocalMode = process.env.NEXT_PUBLIC_AGENTIS_LOCAL === "true";

export default function ModeShellWrapper() {
  const router = useRouter();

  return (
    <div className="w-dvw h-dvh relative overflow-hidden">
      <ModeShell
        localInstallUrl={isLocalMode ? undefined : "/install"}
        onNavigate={(url) => router.push(url)}
      />
    </div>
  );
}
