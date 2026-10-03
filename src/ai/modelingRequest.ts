import type { Context } from '@earendil-works/pi-ai';

const sceneIntent = /沙盘|三维|建模|车间|产线|仓库|工厂|场景|\b3d\b|\b(?:workshop|factory|warehouse|scene)\b/i;
const rasterIntent = /画一张|绘一张|生成一张|生成图片|生图|出图|改图|修图|\b(?:draw|generate|create|make)\s+(?:an?\s+)?(?:image|picture|photo|illustration)\b/i;

/** Disambiguate editable scene construction without rewriting explicit raster-image requests. */
export function normalizeModelingRequestText(text: string): string {
  if (!sceneIntent.test(text) || rasterIntent.test(text) || /原样|原文|逐字|照抄|不要改写|不要修改|verbatim|exact(?:ly)?|do not (?:change|rewrite)/i.test(text)) return text;
  // Quoted labels, examples and code are user data, not modeling verbs.
  return text.split(/(```[\s\S]*?```|`[^`]*`|“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’|"[^"]*"|'[^'\n]*')/g).map((part,index) => index % 2 ? part : part
    .replace(/(?:绘制|画)(?=[一个只])/g, '构建')
    .replace(/\bdraw\s+(?=an?\s)/gi, 'build ')).join('');
}

/** Normalize only outbound user text; stored conversations, images and tool messages stay intact. */
export function normalizeModelingRequestMessages(messages: Context['messages']): Context['messages'] {
  return messages.map(message => {
    if (message.role !== 'user') return message;
    if (typeof message.content === 'string') {
      const content = normalizeModelingRequestText(message.content);
      return content === message.content ? message : { ...message, content };
    }
    let changed = false;
    const content = message.content.map(part => {
      if (part.type !== 'text') return part;
      const text = normalizeModelingRequestText(part.text);
      if (text === part.text) return part;
      changed = true;
      return { ...part, text };
    });
    return changed ? { ...message, content } : message;
  });
}
