import { useState, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Fenced code block with a language chip and a copy button. */
function CodeBlock({ lang, code }: { readonly lang: string; readonly code: string }) {
  const [copied, setCopied] = useState(false)
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
      <pre className="codeblock-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

/**
 * Markdown rendering for assistant messages: GFM tables/lists/links plus
 * fenced code blocks. Fenced blocks (with a language class) and any
 * multi-line code render as {@link CodeBlock}; everything else is an inline
 * chip. The `pre` passthrough lets CodeBlock own its chrome.
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
