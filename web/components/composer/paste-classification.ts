/** The largest plain-text payload allowed to remain model-visible inline. */
export const SAFE_MODEL_VISIBLE_BYTES = 60_000

export type PlainTextPasteDisposition =
  | { readonly kind: 'inline' }
  | { readonly kind: 'convertible' }
  | { readonly kind: 'attachment' }

/** Count bytes as UTF-8, matching the upload and model boundary. */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

/**
 * Decide whether a plain-text paste belongs in the draft or attachment tray.
 * The middle band deliberately remains inline, with an explicit conversion UI.
 */
export function classifyPlainTextPaste(text: string): PlainTextPasteDisposition {
  const bytes = utf8Bytes(text)
  const lines = text === '' ? 0 : text.split('\n').length
  if (text.length > 8_000 || lines > 160 || bytes > 48 * 1024) return { kind: 'attachment' }
  const codeOrLogLike = /(^|\n)\s*(?:at\s+\S+|\d{4}-\d\d-\d\d|\{\s*["']|const\s+|function\s+|ERROR\b|WARN\b|INFO\b)/m.test(text)
  if (codeOrLogLike && text.length > 5_000 && lines > 100) return { kind: 'attachment' }
  if (text.length <= 4_000 && lines <= 80 && bytes <= 32 * 1024) return { kind: 'inline' }
  return { kind: 'convertible' }
}
