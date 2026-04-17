import type { SlideOperation, TextStyle } from '../adapters/interface';
import type { ThemeDefinition } from '../themes';

export type PluginAwareOperation = SlideOperation;

export type PluginContext = {
  slideWidth: number;
  slideHeight: number;
  theme: ThemeDefinition;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const arr = value.map((v) => asString(v)).filter(Boolean) as string[];
  return arr.length > 0 ? arr : undefined;
}

function mergeStyle(base: TextStyle, override?: TextStyle): TextStyle {
  return { ...base, ...(override ?? {}) };
}

function bulletify(lines: string[]): string {
  return lines.map((s) => `• ${s}`).join('\n');
}

function opSetBg(slideIndex: number, theme: ThemeDefinition, override?: string): SlideOperation {
  return { action: 'setBackground', slideIndex, color: override ?? theme.defaults.backgroundColor };
}

function opTitle(
  slideIndex: number,
  text: string,
  ctx: PluginContext,
  opts?: { top?: number; height?: number; style?: TextStyle },
): SlideOperation {
  const margin = Math.round(ctx.slideWidth * 0.07); // ~60 in 960
  return {
    action: 'insertText',
    params: {
      slideIndex,
      text,
      left: margin,
      top: opts?.top ?? 54,
      width: ctx.slideWidth - margin * 2,
      height: opts?.height ?? 90,
      style: mergeStyle(ctx.theme.defaults.title, opts?.style),
    },
  };
}

function opBody(
  slideIndex: number,
  text: string,
  ctx: PluginContext,
  opts?: { top?: number; height?: number; style?: TextStyle; widthRatio?: number; left?: number },
): SlideOperation {
  const margin = Math.round(ctx.slideWidth * 0.07);
  const widthRatio = opts?.widthRatio ?? 0.86;
  const width = Math.round(ctx.slideWidth * widthRatio);
  const left = opts?.left ?? Math.round((ctx.slideWidth - width) / 2);

  return {
    action: 'insertText',
    params: {
      slideIndex,
      text,
      left,
      top: opts?.top ?? 160,
      width,
      height: opts?.height ?? 330,
      style: mergeStyle(ctx.theme.defaults.body, opts?.style),
    },
  };
}

export function expandPluginOperation(op: Extract<SlideOperation, { action: 'callPlugin' }>, ctx: PluginContext): SlideOperation[] {
  const args = op.args ?? {};
  const id = op.pluginId;
  const slideIndex = op.slideIndex;

  switch (id) {
    case 'bg-image': {
      // 注意：真正的图片生成在 WebPptxAdapter 里做（需要 API Key）。
      // 这里返回一个“占位方案”，避免插件端/无图片能力时完全无反馈。
      const prompt = asString(args.prompt) ?? '背景图';
      const hint = `【背景图占位】${prompt}`;
      return [
        opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)),
        opBody(slideIndex, hint, ctx, {
          top: Math.round(ctx.slideHeight * 0.42),
          height: 80,
          style: { alignment: 'center', color: ctx.theme.accentColor, fontSize: 16 },
        }),
      ];
    }

    case 'cover': {
      const title = asString(args.title) ?? '标题';
      const subtitle = asString(args.subtitle);
      const author = asString(args.author);
      const date = asString(args.date);
      const footerParts = [author, date].filter(Boolean);
      const footer = footerParts.length > 0 ? footerParts.join(' · ') : undefined;

      const ops: SlideOperation[] = [
        opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)),
        opTitle(slideIndex, title, ctx, { top: 150, height: 110 }),
      ];
      if (subtitle) {
        ops.push(opBody(slideIndex, subtitle, ctx, {
          top: 280,
          height: 80,
          style: { fontSize: 22, color: ctx.theme.accentColor },
        }));
      }
      if (footer) {
        ops.push(opBody(slideIndex, footer, ctx, {
          top: 450,
          height: 60,
          style: { fontSize: 14, color: ctx.theme.defaults.body.color, alignment: 'right' },
        }));
      }
      return ops;
    }

    case 'title-content': {
      const title = asString(args.title) ?? '标题';
      const bullets = asStringArray(args.bullets);
      const body = asString(args.body);
      const content = bullets ? bulletify(bullets) : (body ?? '');

      return [
        opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)),
        opTitle(slideIndex, title, ctx),
        opBody(slideIndex, content, ctx),
      ];
    }

    case 'section': {
      const title = asString(args.title) ?? '章节标题';
      const subtitle = asString(args.subtitle);
      const ops: SlideOperation[] = [
        opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)),
        opTitle(slideIndex, title, ctx, { top: 190, height: 120 }),
      ];
      if (subtitle) {
        ops.push(opBody(slideIndex, subtitle, ctx, {
          top: 320,
          height: 70,
          style: { fontSize: 20, color: ctx.theme.accentColor },
        }));
      }
      return ops;
    }

    case 'two-column': {
      const title = asString(args.title) ?? '标题';
      const leftTitle = asString(args.leftTitle);
      const rightTitle = asString(args.rightTitle);
      const leftBullets = asStringArray(args.leftBullets) ?? [];
      const rightBullets = asStringArray(args.rightBullets) ?? [];

      const margin = Math.round(ctx.slideWidth * 0.07);
      const gap = Math.round(ctx.slideWidth * 0.05);
      const colW = Math.round((ctx.slideWidth - margin * 2 - gap) / 2);
      const leftX = margin;
      const rightX = margin + colW + gap;
      const top = 175;
      const h = 320;

      const ops: SlideOperation[] = [
        opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)),
        opTitle(slideIndex, title, ctx),
      ];

      if (leftTitle) {
        ops.push({
          action: 'insertText',
          params: {
            slideIndex,
            text: leftTitle,
            left: leftX,
            top: top - 55,
            width: colW,
            height: 50,
            style: mergeStyle(ctx.theme.defaults.body, { fontSize: 18, bold: true, color: ctx.theme.primaryColor }),
          },
        });
      }
      if (rightTitle) {
        ops.push({
          action: 'insertText',
          params: {
            slideIndex,
            text: rightTitle,
            left: rightX,
            top: top - 55,
            width: colW,
            height: 50,
            style: mergeStyle(ctx.theme.defaults.body, { fontSize: 18, bold: true, color: ctx.theme.primaryColor }),
          },
        });
      }

      ops.push({
        action: 'insertText',
        params: {
          slideIndex,
          text: leftBullets.length > 0 ? bulletify(leftBullets) : '',
          left: leftX,
          top,
          width: colW,
          height: h,
          style: ctx.theme.defaults.body,
        },
      });
      ops.push({
        action: 'insertText',
        params: {
          slideIndex,
          text: rightBullets.length > 0 ? bulletify(rightBullets) : '',
          left: rightX,
          top,
          width: colW,
          height: h,
          style: ctx.theme.defaults.body,
        },
      });

      return ops;
    }

    case 'thank-you': {
      const title = asString(args.title) ?? '谢谢聆听';
      const contact = asString(args.contact);
      const ops: SlideOperation[] = [
        opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)),
        opTitle(slideIndex, title, ctx, { top: 210, height: 110, style: { alignment: 'center' } }),
      ];
      if (contact) {
        ops.push(opBody(slideIndex, contact, ctx, {
          top: 340,
          height: 80,
          style: { alignment: 'center', fontSize: 18, color: ctx.theme.accentColor },
        }));
      }
      return ops;
    }

    default:
      // 未知插件：不执行
      return [];
  }
}
