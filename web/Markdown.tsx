import { useState, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Icon from './components/common/Icon.tsx'
import { highlight } from './lib/highlight.ts'

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
          <Icon name={copied ? 'check' : 'copy'} size={13} />
          {copied ? 'Copied' : 'Copy code'}
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
