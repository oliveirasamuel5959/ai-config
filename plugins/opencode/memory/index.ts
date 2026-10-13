/**
 * memory — durable per-project memory for OpenCode.
 *
 * Exposes three tools and injects the project's memories into every session's system prompt:
 *
 *   memory_write  { text }        record one durable fact about this project
 *   memory_list   {}              list the recorded memories
 *   memory_delete { id }          remove one by id
 *
 * Memories are stored per project, keyed by the worktree path, under
 * ${XDG_DATA_HOME:-~/.local/share}/opencode/ai-config-memory/<hash>.json
 *
 * Reimplemented for this repo; see ATTRIBUTION.md.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

type Memory = {
  id: string
  text: string
  created: string
}

const MAX_MEMORIES = 100

function storePath(worktree: string): string {
  const base = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  const key = createHash("sha256").update(worktree).digest("hex").slice(0, 16)
  return join(base, "opencode", "ai-config-memory", `${key}.json`)
}

async function load(path: string): Promise<Memory[]> {
  try {
    const raw = await readFile(path, "utf8")
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m): m is Memory =>
        typeof m === "object" && m !== null && typeof (m as Memory).text === "string",
    )
  } catch {
    // Missing or unreadable file is an empty memory, not an error.
    return []
  }
}

async function save(path: string, memories: Memory[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  // Write to a temp file and rename, so a crash cannot leave a truncated store.
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(memories, null, 2), "utf8")
  await rename(tmp, path)
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function render(memories: Memory[]): string {
  if (memories.length === 0) {
    return [
      "<project-memory>",
      "No durable memories recorded for this project yet. Use the memory_write tool to record",
      "a lasting decision, convention or gotcha.",
      "</project-memory>",
    ].join("\n")
  }
  return [
    "<project-memory>",
    "Durable facts recorded for this project. Follow them; they are decisions and conventions,",
    "not suggestions. Remove stale ones with memory_delete.",
    "",
    ...memories.map((m) => `- [${m.id}] ${m.text}`),
    "</project-memory>",
  ].join("\n")
}

export const MemoryPlugin: Plugin = async ({ worktree, directory }) => {
  const path = storePath(worktree || directory)

  return {
    tool: {
      memory_write: tool({
        description:
          "Record one durable fact about this project — a decision and its reason, a convention, " +
          "a gotcha, or a user preference — so future sessions know it. One objective sentence " +
          "per memory. Do not record secrets.",
        args: {
          text: tool.schema.string().describe("One objective sentence."),
        },
        async execute(args) {
          const memories = await load(path)
          const text = args.text.trim()
          if (!text) return "Nothing to record: the text was empty."

          const duplicate = memories.find((m) => m.text.toLowerCase() === text.toLowerCase())
          if (duplicate) return `Already recorded as [${duplicate.id}]: ${duplicate.text}`

          const memory: Memory = { id: newId(), text, created: new Date().toISOString() }
          memories.push(memory)
          // Keep the most recent; drop the oldest beyond the cap.
          if (memories.length > MAX_MEMORIES) memories.splice(0, memories.length - MAX_MEMORIES)
          await save(path, memories)

          return `Recorded [${memory.id}]: ${memory.text}`
        },
      }),

      memory_list: tool({
        description: "List the durable memories recorded for this project.",
        args: {},
        async execute() {
          const memories = await load(path)
          if (memories.length === 0) return "No memories recorded for this project."
          return memories.map((m) => `[${m.id}] ${m.text}`).join("\n")
        },
      }),

      memory_delete: tool({
        description: "Remove one durable memory by its id (see memory_list).",
        args: {
          id: tool.schema.string().describe("The id shown by memory_list."),
        },
        async execute(args) {
          const memories = await load(path)
          const remaining = memories.filter((m) => m.id !== args.id)
          if (remaining.length === memories.length) return `No memory with id ${args.id}.`
          await save(path, remaining)
          return `Removed [${args.id}].`
        },
      }),
    },

    // Inject the memories into every session so they are followed without being asked for.
    "experimental.chat.system.transform": async (_input, output) => {
      const memories = await load(path)
      output.system.push(render(memories))
    },
  }
}
