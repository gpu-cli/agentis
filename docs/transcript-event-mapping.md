# Claude Code Transcript → World Events Mapping

How Claude Code JSONL transcript records map through the ingest pipeline to world events.

## Record Flow

```
JSONL Record → Parser → Canonicalizer → Work Units → Skeleton → Adapter → AgentEvents
```

## Record Types

| Record Type | Canonical Operations | World Events |
|---|---|---|
| `user` | `conversation` | (none — user ops don't generate map events) |
| `assistant` (text) | `conversation` | (none) |
| `assistant` (thinking) | `reasoning` | (none) |
| `assistant` (tool_use) | Per tool — see Tool Map | Per kind — see Event Map |
| `progress` (agent_progress) | Same as assistant tool_use, with subagent actor | Same, attributed to subagent |
| `progress` (hook_progress) | (skipped) | (none) |
| `queue-operation` (enqueue) | `task_complete` | `subagent_complete` (fx) |
| `system` | (skipped) | (none) |
| `file-history-snapshot` | (skipped) | (none) |

## Tool → OperationKind Map

| Tool Name | OperationKind |
|---|---|
| Read, TodoRead | `file_read` |
| Write, Edit, MultiEdit, TodoWrite, NotebookEdit | `file_write` |
| Bash, Skill | `command_run` |
| Grep, Glob | `search` |
| Task, Agent | `task_spawn` |
| TaskOutput | `task_complete` |
| TaskCreate | `workitem_create` |
| TaskUpdate | `workitem_update` |
| AskUserQuestion | `conversation` |
| WebFetch | `web_fetch` |

## OperationKind → AgentEvent Map

| OperationKind | Event Kind | Event Type | Tool ID |
|---|---|---|---|
| `file_write` | `mutation` | `file_edit` | — |
| `file_create` | `mutation` | `file_create` | — |
| `file_read` | `fx` | `tool_use` | `tool_file_read` |
| `search` | `fx` | `tool_use` | `tool_file_read` |
| `command_run` | `fx` | `tool_use` | `tool_terminal` |
| `task_spawn` | `fx` | `subagent_spawn` | — |
| `task_complete` | `fx` | `subagent_complete` | — |
| `web_fetch` | `fx` | `tool_use` | `tool_terminal` |
| `conversation` | — | (no event) | — |
| `reasoning` | — | (no event) | — |
| `workitem_create` | — | (no event) | — |
| `workitem_update` | — | (no event) | — |

## Teams Transcript Agent Promotion

In Teams transcripts, multiple agents work in parallel. Each has a unique `agentId` in progress records.

**Promotion rule:** Subagents with >= 3 tool-use operations are promoted from `kind: 'subagent'` to `kind: 'agent'`. This causes them to render as full-size agent sprites instead of tiny minions.

**Name extraction:** Promoted agents get their name from the first ~50 chars of their `data.prompt` field (up to first newline or period).

## Event Generation Modes

1. **Per-operation mode** (teams transcripts): When `snapshot.operations` exists, events are generated from individual `CanonicalOperation` records. Each operation becomes an event with correct agent attribution and temporal ordering.

2. **Work-unit mode** (single-agent): When no operations attached, events are generated from `WorkUnit` summaries. One event per work-unit per actor.
