import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Check, Clipboard } from 'lucide-react';
import { isValidElement, type ReactNode } from 'react';
import { useState } from 'react';

const markdownRemarkPlugins = [remarkGfm];
const markdownRehypePlugins = [rehypeHighlight];

function extractText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (!node || typeof node !== 'object') return '';
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children);
  const maybeNode = node as { children?: unknown[]; props?: { children?: ReactNode } };
  if (Array.isArray(maybeNode.children)) return maybeNode.children.map(extractText).join('');
  return extractText(maybeNode.props?.children);
}

async function copyText(text: string) {
  if (!text) return;
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.select();
  try {
    const copied = document.execCommand('copy');
    if (!copied) throw new Error('Copy command failed');
  } finally {
    document.body.removeChild(textArea);
  }
}

function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = extractText(children).replace(/\n$/, '');
  const language = className?.match(/language-([\w-]+)/)?.[1] || 'text';

  async function copyCode() {
    await copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="markdownCodeBlock">
      <div className="markdownCodeHeader">
        <span>{language}</span>
        <button type="button" onClick={() => void copyCode()} aria-label="复制代码">
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={markdownRemarkPlugins}
      rehypePlugins={markdownRehypePlugins}
      components={{
        pre({ children }) {
          const child = Array.isArray(children) ? children[0] : children;
          const codeChild = isValidElement<{ className?: string; children?: ReactNode }>(child) ? child : null;
          return <CodeBlock className={codeChild?.props.className}>{codeChild?.props.children || children}</CodeBlock>;
        },
        code({ className, children, ...props }) {
          return <code className={className} {...props}>{children}</code>;
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
