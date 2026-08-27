import { useState, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import css from 'highlight.js/lib/languages/css'
import markdown from 'highlight.js/lib/languages/markdown'
import xml from 'highlight.js/lib/languages/xml'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('xml', xml)

/** Escape text that survives a language miss; never inject raw HTML. */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/** Highlight when the language is known; fall back to escaped plain text. */
function highlight(code: string, language: string): string {
  if (hljs.getLanguage(language) !== undefined) {
    try {
      return hljs.highlight(code, { language }).value
    } catch {
      return escapeHtml(code)
    }
  }
  return escapeHtml(code)
}

/** Fenced code block with a language chip and a copy button. */
function CodeBlock({ lang, code }: { readonly lang: string; readonly code: string }) {
  const [copied, setCopied] = useState(false)
  const html = highlight(code, lang)
  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span className="codeblock-lang">{lang === '' ? 'text' : lang}</span>
        <button
          type="button"
          className="codeblock-copy"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1_200)
            })
          }}
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="codeblock-pre"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
    </div>
  )
}

/**
 * Markdown rendering for assistant messages: GFM tables/lists/links plus
 * fenced code blocks with syntax highlighting. Fenced blocks (with a
 * language class) and any multi-line code render as {@link CodeBlock};
 * everything else is an inline chip.
 */
export function Markdown({ content }: { readonly content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: (props: ComponentProps<'pre'>) => <>{props.children}</>,
          code: (props: ComponentProps<'code'>) => {
            const { className, children } = props
            const text = String(children ?? '').replace(/\n$/, '')
            if (text.includes('\n')) {
              const lang = /language-([\w-]+)/.exec(className ?? '')?.[1] ?? ''
              return <CodeBlock lang={lang} code={text} />
            }
            return <code className="md-inline">{children}</code>
          },
          a: (props: ComponentProps<'a'>) => (
            <a {...props} target="_blank" rel="noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
