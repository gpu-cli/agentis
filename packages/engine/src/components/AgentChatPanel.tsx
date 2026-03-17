// ============================================================================
// Agent Chat Panel — Embedded chat view for the agent sidebar
// ============================================================================

import { useState, useRef, useEffect } from 'react'
import {
  Button,
  Input,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@multiverse/ui'
import { useAgentStore } from '../stores/agentStore'
import { useUIStore } from '../stores/uiStore'
import { SpriteIcon } from './SpriteIcon'
import { AgentTypeLogo } from './AgentTypeLogo'
import { entitySprites } from '../engine/entity-sprite-map'
import type { ConversationMessage } from '@multiverse/shared'

/**
 * Local chat state — in a real implementation this would be backed by the
 * agent runtime's conversation thread (via WebSocket). For now we keep a
 * local message list so the UI is fully functional and ready to wire up.
 */
function useLocalChat(agentId: string | null) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const pendingAckTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([])

  // Reset messages when agent changes
  useEffect(() => {
    pendingAckTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
    pendingAckTimeoutsRef.current = []
    if (!agentId) return
    setMessages([
      {
        id: 'system-welcome',
        author: 'agent',
        content: 'Hello! How can I help you?',
        timestamp: Date.now(),
      },
    ])
  }, [agentId])

  useEffect(() => {
    return () => {
      pendingAckTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
      pendingAckTimeoutsRef.current = []
    }
  }, [])

  const send = (text: string) => {
    if (!text.trim()) return

    const userMsg: ConversationMessage = {
      id: `user-${Date.now()}`,
      author: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])

    // Simulate agent acknowledgement after a short delay
    const timeoutId = setTimeout(() => {
      const ackMsg: ConversationMessage = {
        id: `agent-${Date.now()}`,
        author: 'agent',
        content: 'Got it — I\'ll work on that.',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, ackMsg])
      pendingAckTimeoutsRef.current = pendingAckTimeoutsRef.current.filter((id) => id !== timeoutId)
    }, 800)
    pendingAckTimeoutsRef.current.push(timeoutId)
  }

  return { messages, send }
}

/**
 * Embedded chat panel — renders inside the AgentPanel sidebar.
 * Takes up the full sidebar height with a back button to return to details.
 */
export function AgentChatPanel({ agentId }: { agentId: string }) {
  const setConversationAgent = useUIStore((s) => s.setConversationAgent)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const agents = useAgentStore((s) => s.agents)

  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { messages, send } = useLocalChat(agentId)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when chat opens
  useEffect(() => {
    const timeoutId = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timeoutId)
  }, [agentId])

  const agent = agents.get(agentId)
  if (!agent) return null

  const handleSend = () => {
    send(inputValue)
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full min-h-0">
        {/* Header — back button, agent name, close */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConversationAgent(null)}
                className="h-7 w-7 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                aria-label="Back to details"
              >
                ←
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to details</TooltipContent>
          </Tooltip>
        <SpriteIcon region={entitySprites.resolveAgent(agent.type, agent.id)} size={18} className="shrink-0" />
        <span className="font-pixel text-xs text-green-400 truncate flex-1 min-w-0">
          {agent.name}
        </span>
        <AgentTypeLogo type={agent.type} size={18} />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setConversationAgent(null)
            clearSelection()
          }}
          className="h-7 w-7 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Close panel"
        >
          ✕
        </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.author === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-3 py-1.5 rounded-lg text-xs leading-relaxed ${
                  msg.author === 'user'
                    ? 'bg-blue-600 text-blue-50 rounded-br-sm'
                    : msg.author === 'agent'
                      ? 'bg-muted text-card-foreground rounded-bl-sm'
                      : 'bg-muted/60 text-muted-foreground rounded-bl-sm italic'
                }`}
              >
                {msg.author !== 'user' && (
                  <span className="text-[10px] text-muted-foreground block mb-0.5">
                    {msg.author === 'agent' ? agent.name : 'sub-agent'}
                  </span>
                )}
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              aria-label="Message to agent"
              className="flex-1 bg-muted text-card-foreground text-xs h-auto py-1.5 border-input focus-visible:ring-ring placeholder:text-muted-foreground"
            />
            <Button
              variant="default"
              size="sm"
              onClick={handleSend}
              disabled={!inputValue.trim()}
              aria-label="Send message"
              className="h-7 bg-blue-600 px-3 text-xs font-pixel text-white hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
