/** Presentation-only labels. Never translate stored names, messages, paths, or output. */
const BUILTIN_MODES: Readonly<Record<string, string>> = { 'ask-before-changes': 'Ask before changes', 'edit-automatically': 'Edit automatically', 'full-access': 'Full access', chat: 'Chat', ask: 'Ask', plan: 'Plan', build: 'Build', code: 'Code', review: 'Review', explore: 'Explore' }
export function modeLabel(row: { id: string; name: string; source?: string }): string {
  return row.source === 'bundled' ? (BUILTIN_MODES[row.id] ?? row.name) : row.name
}
export function errorSummary(raw: string): string {
  if (/approval.*(404|not found|resolved)|404.*approval/i.test(raw)) return 'This approval is no longer pending. Check the conversation for its decision.'
  if (/project.*bound.*conversations/i.test(raw)) return 'This project is still used by conversations. Keep the registration, or explicitly delete those conversations first. Existing bindings will not be changed.'
  if (/archived/i.test(raw)) return 'This workspace is archived. Choose an active workspace to make changes.'
  if (/running.*(delete|remove)|(delete|remove).*running/i.test(raw)) return 'Stop the running work before deleting this conversation.'
  if (/no.*provider|provider.*(missing|configured)|model.*not.*configured/i.test(raw)) return 'Configure a provider and select a workspace model in Settings.'
  if (/project.*(invalid|not found|overlap)|path.*(absolute|exist|directory)/i.test(raw)) return 'Check the registered project folder. It must be an existing, valid root without conflicting scope.'
  if (/failed to fetch|network|connection|HTTP 5\d\d/i.test(raw)) return 'The request could not be confirmed. Check the connection and current state before trying again.'
  return 'The request could not be completed. Inspect the original response below.'
}
