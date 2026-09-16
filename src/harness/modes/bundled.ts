import type { ModeDefinition } from './types.ts'

/**
 * The five bundled modes. They are read-only: customizing one duplicates it
 * into the workspace under a new id. Full access allows exposed
 * capabilities but never overrides host or workspace restrictions — the
 * shell has no OS sandbox, and the mode's own instructions say so.
 */
export const BUNDLED_MODES: readonly ModeDefinition[] = [
  {
    id: 'chat',
    name: 'Chat',
    instructions:
      'You are a conversational assistant. Answer directly from the conversation; you have no tools and no workspace context in this mode.',
    sources: { history: 'recent', workspaceInstructions: false, skills: 'off', memoryPinned: false, memoryRetrieval: false },
    toolExposure: [],
    permissionDefaults: {},
  },
  {
    id: 'ask-before-changes',
    name: 'Ask before changes',
    instructions:
      'You are a careful assistant working inside the user’s workspace. Read files freely; before any write, edit, or shell command, ask for approval. Prefer explaining what you are about to change.',
    sources: { history: 'recent', workspaceInstructions: true, skills: 'on-demand', memoryPinned: true, memoryRetrieval: true },
    toolExposure: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'Skill', 'MemorySearch', 'MemoryRead'],
    permissionDefaults: {
      Read: 'allow', Glob: 'allow', Grep: 'allow',
      Write: 'ask', Edit: 'ask', Bash: 'ask',
      Skill: 'allow', MemorySearch: 'allow', MemoryRead: 'allow',
    },
  },
  {
    id: 'edit-automatically',
    name: 'Edit automatically',
    instructions:
      'You are an assistant that edits files directly inside the user’s workspace. Read and edit files without asking; shell commands and deletions still require approval. Keep edits minimal and verifiable.',
    sources: { history: 'recent', workspaceInstructions: true, skills: 'on-demand', memoryPinned: true, memoryRetrieval: true },
    toolExposure: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'Skill', 'MemorySearch', 'MemoryRead', 'MemoryCreate', 'MemoryUpdate'],
    permissionDefaults: {
      Read: 'allow', Glob: 'allow', Grep: 'allow', Write: 'allow', Edit: 'allow',
      Bash: 'ask', Skill: 'allow',
      MemorySearch: 'allow', MemoryRead: 'allow', MemoryCreate: 'ask', MemoryUpdate: 'ask',
    },
  },
  {
    id: 'plan',
    name: 'Plan',
    instructions:
      'You are a planning assistant. Investigate the workspace with read-only tools and deliver a plan as your reply. You cannot write, edit, run shell commands, or write memory — the plan itself is the deliverable.',
    sources: { history: 'recent', workspaceInstructions: true, skills: 'on-demand', memoryPinned: true, memoryRetrieval: true },
    toolExposure: ['Read', 'Glob', 'Grep', 'Skill', 'MemorySearch', 'MemoryRead'],
    permissionDefaults: {
      Read: 'allow', Glob: 'allow', Grep: 'allow', Skill: 'allow',
      MemorySearch: 'allow', MemoryRead: 'allow',
    },
  },
  {
    id: 'full-access',
    name: 'Full access',
    instructions:
      'You are an assistant with full access to the workspace tools. Host and workspace restrictions still apply and cannot be overridden by you. There is no OS sandbox: shell commands run with host privileges, so stay deliberate.',
    sources: { history: 'recent', workspaceInstructions: true, skills: 'on-demand', memoryPinned: true, memoryRetrieval: true },
    toolExposure: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'Skill', 'MemorySearch', 'MemoryRead', 'MemoryCreate', 'MemoryUpdate', 'MemoryForget'],
    permissionDefaults: {
      Read: 'allow', Glob: 'allow', Grep: 'allow', Write: 'allow', Edit: 'allow', Bash: 'allow',
      Skill: 'allow',
      MemorySearch: 'allow', MemoryRead: 'allow', MemoryCreate: 'allow', MemoryUpdate: 'allow', MemoryForget: 'allow',
    },
  },
]

export const DEFAULT_MODE_ID = 'ask-before-changes'

/** The full exposure ceiling any mode can grant (skills/memory included). */
export const KNOWN_MODE_TOOLS: readonly string[] = [
  'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Skill',
  'MemorySearch', 'MemoryRead', 'MemoryCreate', 'MemoryUpdate', 'MemoryForget',
]
