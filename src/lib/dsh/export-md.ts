/**
 * DSH Web — session export to Markdown.
 * Serializes a Session (messages, tool calls, todos, workspace manifest)
 * into a portable transcript document.
 */

import type { Session } from './types';

function fence(body: string, lang = ''): string {
  const longest = /```+/.exec(body)?.[0];
  const ticks = '`'.repeat(longest ? longest.length + 1 : 3);
  return `${ticks}${lang}\n${body}\n${ticks}`;
}

export function sessionToMarkdown(session: Session): string {
  const created = new Date(session.createdAt).toISOString();
  const lines: string[] = [
    `# ${session.title}`,
    '',
    `> dsh web — DeepSeek Harness Web Edition · exported ${new Date().toISOString()}`,
    `> session \`${session.id}\` · created ${created} · ${session.messages.length} messages`,
    '',
  ];

  if (session.todos.length) {
    lines.push('## Todos', '');
    for (const t of session.todos) {
      const box = t.status === 'completed' ? 'x' : t.status === 'in_progress' ? '~' : t.status === 'cancelled' ? '-' : ' ';
      lines.push(`- [${box}] ${t.content}`);
    }
    lines.push('');
  }

  lines.push('## Transcript', '');

  for (const m of session.messages) {
    const time = new Date(m.createdAt).toLocaleTimeString();
    switch (m.role) {
      case 'user':
        lines.push(`### ❯ user · ${time}`, '', m.content, '');
        break;
      case 'assistant': {
        const model = m.meta?.model ?? 'assistant';
        lines.push(`### ✦ assistant (${model}) · ${time}`, '');
        if (m.reasoning?.trim()) {
          lines.push('<details><summary>Thinking…</summary>', '', m.reasoning, '', '</details>', '');
        }
        if (m.content.trim()) lines.push(m.content, '');
        if (m.toolCalls?.length) {
          lines.push('<details><summary>Tool calls</summary>', '');
          for (const tc of m.toolCalls) {
            lines.push(``, `**\`${tc.function.name}\`**`, '', fence(tc.function.arguments, 'json'), '');
          }
          lines.push('</details>', '');
        }
        break;
      }
      case 'tool': {
        const ok = m.status === 'error' ? '⚠ error' : '✓';
        lines.push(`<details><summary><code>${m.toolName ?? 'tool'}</code> → ${ok}${m.durationMs != null ? ` · ${m.durationMs}ms` : ''}</summary>`, '', fence(m.content), '', '</details>', '');
        break;
      }
      default:
        break;
    }
  }

  const files = Object.keys(session.workspace);
  if (files.length) {
    lines.push('## Workspace manifest', '', '```', ...files.sort(), '```', '');
  }

  return lines.join('\n');
}

/** Trigger a browser download for the exported markdown. */
export function downloadSessionMarkdown(session: Session): void {
  const md = sessionToMarkdown(session);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug =
    session.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'session';
  a.href = url;
  a.download = `dsh-${slug}-${session.id.slice(0, 6)}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
