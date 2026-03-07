// ============================================================================
// Agent Chat Panel — Embedded chat view for the agent sidebar
// ============================================================================

import { useState, useRef, useEffect } from 'react'
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

  // Reset messages when agent changes
  useEffect(() => {
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
    setTimeout(() => {
      const ackMsg: ConversationMessage = {
        id: `agent-${Date.now()}`,
        author: 'agent',
        content: 'Got it — I\'ll work on that.',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, ackMsg])
    }, 800)
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
    setTimeout(() => inputRef.current?.focus(), 100)
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
    <div className="flex flex-col h-full min-h-0">
      {/* Header — back button, agent name, close */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 shrink-0">
        <button
          onClick={() => setConversationAgent(null)}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white text-sm rounded hover:bg-gray-700 transition-colors"
          aria-label="Back to agent details"
          title="Back to details"
        >
          ←
        </button>
        <SpriteIcon region={entitySprites.resolveAgent(agent.type, agent.id)} size={18} className="shrink-0" />
        <span className="font-pixel text-xs text-green-400 truncate flex-1 min-w-0">
          {agent.name}
        </span>
        <AgentTypeLogo type={agent.type} size={18} />
        <button
          onClick={() => {
            setConversationAgent(null)
            clearSelection()
          }}
          className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-white text-sm rounded hover:bg-gray-700 transition-colors"
          aria-label="Close panel"
        >
          ✕
        </button>
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
                    ? 'bg-gray-700 text-gray-200 rounded-bl-sm'
                    : 'bg-gray-700/60 text-gray-400 rounded-bl-sm italic'
              }`}
            >
              {msg.author !== 'user' && (
                <span className="text-[10px] text-gray-500 block mb-0.5">
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
      <div className="shrink-0 border-t border-gray-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            aria-label="Message to agent"
            className="flex-1 bg-gray-700 text-gray-200 text-xs px-3 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none placeholder:text-gray-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            aria-label="Send message"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white text-xs rounded font-pixel transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
