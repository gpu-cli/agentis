"use client";

import { Button } from "@multiverse/ui";

export function DemoContent() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-world-void p-8">
      <h1 className="font-pixel text-xl text-white">Demo</h1>
      <div className="flex gap-4">
        <Button variant="default">Default</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
      </div>
      <p className="text-sm text-world-fog">
        @multiverse/ui components rendered in Next.js
      </p>
    </main>
  );
}
