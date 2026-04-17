export type WordArtStyle = {
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  strokeColor?: string;
  strokeWidth?: number;
  glow?: boolean;
  shadow?: boolean;
};

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateWordArtSvg(params: {
  text: string;
  width: number;
  height: number;
  style?: WordArtStyle;
}): string {
  const text = params.text.trim() || 'WordArt';
  const width = Math.max(200, Math.round(params.width));
  const height = Math.max(120, Math.round(params.height));
  const style = params.style ?? {};

  const primary = (style.primaryColor ?? '#2563EB').toUpperCase();
  const accent = (style.accentColor ?? '#22D3EE').toUpperCase();
  const fontFamily = style.fontFamily ?? '微软雅黑';
  const strokeColor = (style.strokeColor ?? '#0B1220').toUpperCase();
  const strokeWidth = Math.max(0, Number(style.strokeWidth ?? 3));
  const glow = style.glow ?? true;
  const shadow = style.shadow ?? true;

  const fontSize = Math.round(Math.min(height * 0.62, width / Math.max(4, text.length) * 1.6));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    ${shadow ? `
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="${Math.round(height * 0.06)}" stdDeviation="${Math.round(height * 0.06)}" flood-color="rgba(0,0,0,0.35)"/>
    </filter>` : ''}
    ${glow ? `
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${Math.round(height * 0.05)}" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>` : ''}
  </defs>

  <rect width="${width}" height="${height}" fill="transparent"/>
  <g ${shadow ? 'filter="url(#shadow)"' : ''}>
    <text
      x="50%"
      y="50%"
      dominant-baseline="middle"
      text-anchor="middle"
      font-family="${esc(fontFamily)}"
      font-size="${fontSize}"
      font-weight="800"
      fill="url(#grad)"
      stroke="${strokeColor}"
      stroke-width="${strokeWidth}"
      paint-order="stroke fill"
      ${glow ? 'filter="url(#glow)"' : ''}
    >${esc(text)}</text>
  </g>
</svg>`;
}

export async function svgToPngBase64(svg: string, width: number, height: number): Promise<string> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG 渲染失败'));
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 不可用');
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/png');
    const b64 = dataUrl.split(',')[1] ?? '';
    if (!b64) throw new Error('PNG 导出失败');
    return b64;
  } finally {
    URL.revokeObjectURL(url);
  }
}

