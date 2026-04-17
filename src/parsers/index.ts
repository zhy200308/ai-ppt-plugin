// ============================================================
//  文档解析器 — 浏览器端多格式文档解析
//  支持: PDF, DOCX, XLSX, CSV, TXT, MD, PPTX, HTML, 图片
// ============================================================

export interface ParsedDocument {
  fileName: string;
  fileType: string;
  textContent: string;
  pageCount?: number;
  metadata?: Record<string, string>;
}

type ParserFn = (file: File) => Promise<ParsedDocument>;

// ---- 各格式解析器 ----

async function parsePDF(file: File): Promise<ParsedDocument> {
  const pdfjsLib = await import('pdfjs-dist');

  // 设置 worker（使用 CDN 或 bundled worker）
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    pages.push(`[第 ${i} 页]\n${pageText}`);
  }

  return {
    fileName: file.name,
    fileType: 'pdf',
    textContent: pages.join('\n\n'),
    pageCount: pdf.numPages,
  };
}

async function parseDOCX(file: File): Promise<ParsedDocument> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });

  return {
    fileName: file.name,
    fileType: 'docx',
    textContent: result.value,
  };
}

async function parseXLSX(file: File): Promise<ParsedDocument> {
  const ExcelJS = await import('exceljs');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const sheets: string[] = [];
  for (const worksheet of workbook.worksheets) {
    const lines: string[] = [];

    worksheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = values.map((cell) => {
        if (cell == null) return '';
        if (typeof cell === 'object') {
          if ('text' in cell && typeof (cell as { text?: unknown }).text === 'string') {
            return (cell as { text: string }).text;
          }
          if ('result' in cell) return String((cell as { result?: unknown }).result ?? '');
          return JSON.stringify(cell);
        }
        return String(cell);
      });
      lines.push(cells.join(','));
    });

    sheets.push(`[工作表: ${worksheet.name}]\n${lines.join('\n')}`);
  }

  return {
    fileName: file.name,
    fileType: 'xlsx',
    textContent: sheets.join('\n\n'),
    metadata: { sheetCount: String(workbook.worksheets.length) },
  };
}

async function parseCSV(file: File): Promise<ParsedDocument> {
  const text = await file.text();
  return {
    fileName: file.name,
    fileType: 'csv',
    textContent: text,
  };
}

async function parsePlainText(file: File): Promise<ParsedDocument> {
  const text = await file.text();
  return {
    fileName: file.name,
    fileType: file.name.endsWith('.md') ? 'markdown' : 'text',
    textContent: text,
  };
}

async function parseHTML(file: File): Promise<ParsedDocument> {
  const html = await file.text();
  // 用 DOMParser 提取纯文本
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // 移除 script / style 标签
  doc.querySelectorAll('script, style').forEach(el => el.remove());
  const text = doc.body?.textContent?.trim() ?? '';

  return {
    fileName: file.name,
    fileType: 'html',
    textContent: text,
  };
}

async function parsePPTX(file: File): Promise<ParsedDocument> {
  // 使用 JSZip 解压 PPTX 并提取 slide XML 中的文本
  const { default: JSZip } = await import('jszip');
  const arrayBuffer = await file.arrayBuffer();

  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const texts: string[] = [];
    let slideNum = 1;

    while (true) {
      const slideFile = zip.file(`ppt/slides/slide${slideNum}.xml`);
      if (!slideFile) break;

      const xml = await slideFile.async('text');
      // 提取 <a:t> 标签内的文本
      const matches = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g);
      if (matches) {
        const slideText = matches
          .map(m => m.replace(/<\/?a:t>/g, ''))
          .join(' ');
        texts.push(`[幻灯片 ${slideNum}]\n${slideText}`);
      }
      slideNum++;
    }

    return {
      fileName: file.name,
      fileType: 'pptx',
      textContent: texts.join('\n\n'),
      pageCount: slideNum - 1,
    };
  } catch { /* fallback */ }

  return {
    fileName: file.name,
    fileType: 'pptx',
    textContent: '[无法解析 PPTX 内容，请确保已安装 JSZip]',
  };
}

async function parseImage(file: File): Promise<ParsedDocument> {
  // 图片转 base64，后续可通过 AI 视觉能力进行 OCR
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] ?? '';
      resolve({
        fileName: file.name,
        fileType: 'image',
        textContent: `[图片文件: ${file.name}, 大小: ${(file.size / 1024).toFixed(1)}KB]\n[Base64 数据已加载，可通过 AI 视觉能力进行内容识别]`,
        metadata: { base64, mimeType: file.type },
      });
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

// ---- 格式路由 ----

const PARSER_MAP: Record<string, ParserFn> = {
  'application/pdf': parsePDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': parseDOCX,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': parseXLSX,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': parsePPTX,
  'text/csv': parseCSV,
  'text/plain': parsePlainText,
  'text/markdown': parsePlainText,
  'text/html': parseHTML,
  'image/png': parseImage,
  'image/jpeg': parseImage,
  'image/gif': parseImage,
  'image/webp': parseImage,
  'image/svg+xml': parseImage,
};

/** 通过文件扩展名推断 MIME */
function guessMimeFromExt(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv',
    tsv: 'text/csv',
    txt: 'text/plain',
    md: 'text/markdown',
    html: 'text/html',
    htm: 'text/html',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    json: 'text/plain',
    xml: 'text/plain',
    yaml: 'text/plain',
    yml: 'text/plain',
    log: 'text/plain',
    rtf: 'text/plain',
  };
  return map[ext ?? ''] ?? null;
}

// ---- 公开 API ----

/**
 * 解析上传的文件，返回结构化的文本内容。
 * 自动根据 MIME 类型选择对应的解析器。
 */
export async function parseDocument(file: File): Promise<ParsedDocument> {
  let mime = file.type || guessMimeFromExt(file.name);

  if (!mime) {
    // 最后尝试当纯文本处理
    return parsePlainText(file);
  }

  const parser = PARSER_MAP[mime];
  if (!parser) {
    // 未知格式尝试当文本处理
    try {
      return await parsePlainText(file);
    } catch {
      return {
        fileName: file.name,
        fileType: 'unknown',
        textContent: `[不支持的文件格式: ${mime}]`,
      };
    }
  }

  return parser(file);
}

/**
 * 批量解析多个文件
 */
export async function parseDocuments(files: File[]): Promise<ParsedDocument[]> {
  return Promise.all(files.map(parseDocument));
}

/**
 * 获取支持的文件扩展名列表
 */
export function getSupportedExtensions(): string[] {
  return [
    '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx',
    '.csv', '.tsv', '.txt', '.md', '.html', '.htm',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
    '.json', '.xml', '.yaml', '.yml', '.log', '.rtf',
  ];
}
