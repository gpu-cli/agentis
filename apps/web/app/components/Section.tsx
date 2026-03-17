import type { ReactNode } from 'react'

interface SectionProps {
  title: string
  children: ReactNode
}

export function Section({ title, children }: SectionProps) {
  return (
    <div className="mb-8">
      <h2 className="font-pixel text-xs text-secondary mb-3">{title}</h2>
      {children}
    </div>
  )
}
