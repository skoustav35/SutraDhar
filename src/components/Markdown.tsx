import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Check, Copy } from 'lucide-react';

const copperTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: '#e6ddcc', fontFamily: 'ui-monospace, monospace', fontSize: '0.86rem', lineHeight: 1.6 },
  'pre[class*="language-"]': { color: '#e6ddcc', background: 'transparent', margin: 0, padding: 0 },
  comment: { color: '#7d7259', fontStyle: 'italic' },
  prolog: { color: '#7d7259' },
  doctype: { color: '#7d7259' },
  cdata: { color: '#7d7259' },
  punctuation: { color: '#c9a24a' },
  property: { color: '#ff9933' },
  tag: { color: '#ff9933' },
  boolean: { color: '#e0894a' },
  number: { color: '#e0894a' },
  constant: { color: '#e0894a' },
  symbol: { color: '#e0894a' },
  selector: { color: '#7bbfa0' },
  'attr-name': { color: '#ffce8a' },
  string: { color: '#7bbfa0' },
  char: { color: '#7bbfa0' },
  builtin: { color: '#ffce8a' },
  inserted: { color: '#7bbfa0' },
  operator: { color: '#c9a24a' },
  entity: { color: '#ffce8a' },
  url: { color: '#ffce8a' },
  variable: { color: '#e6ddcc' },
  atrule: { color: '#ff9933' },
  'attr-value': { color: '#7bbfa0' },
  function: { color: '#ffce8a' },
  keyword: { color: '#ff9933', fontWeight: 600 },
  regex: { color: '#e0894a' },
  important: { color: '#ff9933', fontWeight: 'bold' },
};

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  // Code blocks stay dark in BOTH themes — the copper syntax palette is tuned
  // for a dark surface, and a charcoal code card reads as intentional/premium
  // on light parchment (like GitHub/Notion).
  return (
    <div className="my-4 rounded-xl overflow-hidden border border-[#3a2c1c]" style={{ background: '#141009' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#3a2c1c]" style={{ background: 'linear-gradient(90deg, #241c12, #1a1510)' }}>
        <span className="text-[11px] uppercase tracking-[0.2em] text-[#c9a24a]">{language || 'code'}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-[11px] text-[#c9a24a] hover:text-[#ff9933] transition-colors">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <SyntaxHighlighter language={language || 'text'} style={copperTheme} customStyle={{ background: 'transparent', margin: 0, padding: 0 }}>
          {value}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// Normalize LaTeX delimiters so remark-math can render them.
// Models emit \( ... \) and \[ ... \]; remark-math only understands $ and $$.
function normalizeMath(src: string): string {
  if (!src) return src;
  let out = src;
  // Display math \[ ... \]  ->  $$ ... $$
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner) => `\n$$${inner}$$\n`);
  // Inline math \( ... \)  ->  $ ... $
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner) => `$${inner}$`);
  return out;
}

export default function Markdown({ content }: { content: string }) {
  const normalized = normalizeMath(content);
  return (
    <div className="council-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#ff9933' }]]}
        components={{
          code(props) {
            const { className, children } = props as { className?: string; children?: React.ReactNode };
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !className;
            if (isInline) return <code>{children}</code>;
            return <CodeBlock language={match?.[1] || 'text'} value={String(children).replace(/\n$/, '')} />;
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
