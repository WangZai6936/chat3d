// Keep persisted string[] references compatible with existing image data URLs.
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const isReferenceImage = (value: string) => value.startsWith('data:image/');
export function attachmentInfo(value: string) {
  const header = value.slice(0, value.indexOf(','));
  const parameter = (name: string) => header.split(';').find(part => part.startsWith(name + '='))?.slice(name.length + 1);
  let name = parameter('name') ?? '附件';
  try { name = decodeURIComponent(name); } catch { /* Preserve names from malformed imported references. */ }
  return {name, mime: header.slice(5).split(';')[0], size: Number(parameter('size') ?? 0)};
}
export async function prepareReference(file: File | Blob, compress: (file: File | Blob) => Promise<string>): Promise<string> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('单个附件不能超过 20 MB');
  if (file.type.startsWith('image/')) return compress(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('附件读取失败'));
    reader.onload = () => {
      const data = String(reader.result);
      resolve(`data:${file.type || 'application/octet-stream'};name=${encodeURIComponent('name' in file ? String(file.name) : '附件')};size=${file.size};base64,${data.slice(data.indexOf(',') + 1)}`);
    };
    reader.readAsDataURL(file);
  });
}
export function referenceText(text: string, references: string[]) {
  const files = references.filter(value => !isReferenceImage(value)).map(attachmentInfo);
  return files.length ? text + '\n参考附件（仅提供文件信息，尚未解析文件内容）：\n' + files.map(file => JSON.stringify(file)).join('\n') : text;
}
