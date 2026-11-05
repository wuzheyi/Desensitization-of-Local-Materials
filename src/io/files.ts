const DOCX_LIMIT = 40 * 1024 * 1024;

/** 统一换行、压掉多余空行，保证左右两栏文本与偏移完全一致。 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function readFileAsText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.docx')) {
    if (file.size > DOCX_LIMIT) throw new Error('文件超过 40MB，请先拆分');
    const mod = (await import('mammoth')) as unknown as {
      default?: { extractRawText: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
      extractRawText?: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
    };
    const mammoth = mod.default ?? mod;
    if (!mammoth?.extractRawText) throw new Error('DOCX 解析模块加载失败');
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return normalizeText(result.value);
  }

  if (name.endsWith('.doc')) {
    throw new Error('不支持 .doc 旧格式，请用 Word 另存为 .docx');
  }
  if (name.endsWith('.pdf')) {
    throw new Error('PDF 暂未支持（计划在后续版本接入文本层抽取），请先转成 .docx 或 .txt');
  }

  return normalizeText(await file.text());
}
