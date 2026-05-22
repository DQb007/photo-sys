import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Clipboard } from 'lucide-react';
import { isValidElement, type ReactNode } from 'react';

const markdownRemarkPlugins = [remarkGfm];
const markdownRehypePlugins = [rehypeHighlight];

function extractText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  const maybeNode = node as { children?: unknown[] };
  if (!Array.isArray(maybeNode.children)) return '';
  return maybeNode.children.map(extractText).join('');
}

function CodeBlock({ className, children, node }: { className?: string; children?: ReactNode; node?: unknown }) {
  const code = extractText(node);
  const language = className?.match(/language-([\w-]+)/)?.[1] || 'text';

  return (
    <div className="markdownCodeBlock">
      <div className="markdownCodeHeader">
        <span>{language}</span>
        <button type="button" onClick={() => void navigator.clipboard.writeText(code)} aria-label="复制代码">
          <Clipboard size={14} />
          复制
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
        pre({ children, node }) {
          const child = Array.isArray(children) ? children[0] : children;
          const codeChild = isValidElement<{ className?: string; children?: ReactNode }>(child) ? child : null;
          return <CodeBlock className={codeChild?.props.className} node={node}>{codeChild?.props.children || children}</CodeBlock>;
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
