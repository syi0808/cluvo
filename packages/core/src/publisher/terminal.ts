import type { DraftPayload } from '../types.js'

export function renderTerminalDraft(draft: DraftPayload): string {
  const separator = '─'.repeat(50)
  return `\n${separator}\n${draft.title}\n${separator}\n\n${draft.body}\n${separator}\n`
}
