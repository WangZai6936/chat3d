import type { Context } from '@earendil-works/pi-ai';

const sceneIntent = /沙盘|三维|建模|车间|产线|仓库|工厂|场景|\b3d\b|\b(?:workshop|factory|warehouse|scene)\b/i;
const rasterIntent = /画一张|绘一张|生成一张|生成图片|生图|出图|改图|修图|\b(?:draw|generate|create|make)\s+(?:an?\s+)?(?:image|picture|photo|illustration)\b/i;

/** Disambiguate editable scene construction without rewriting explicit raster-image requests. */
export function normalizeModelingRequestText(text: string): string {
  if (!sceneIntent.test(text) || rasterIntent.test(text)) return text;
  return text
    .replace(/(?:绘制|画)(?=[一个只])/g, '构建')
    .replace(/\bdraw\s+(?=an?\s)/gi, 'build ');
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
