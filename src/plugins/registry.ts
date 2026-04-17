import type { SlideOperation, TextStyle } from '../adapters/interface';
import type { ThemeDefinition } from '../themes';
import { renderLayoutToOperations } from './auto-layout';
import {
  createCoverTemplate,
  createTwoColumnTemplate,
  createImageTextTemplate,
  createBigNumberTemplate,
  createGrid4Template
} from './templates';

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

function bulletify(lines: string[]): string {
  return lines.map((s) => `• ${s}`).join('\n');
}

function opSetBg(slideIndex: number, theme: ThemeDefinition, override?: string): SlideOperation {
  return { action: 'setBackground', slideIndex, color: override ?? theme.defaults.backgroundColor };
}

export async function expandPluginOperation(op: Extract<SlideOperation, { action: 'callPlugin' }>, ctx: PluginContext): Promise<SlideOperation[]> {
  const args = op.args ?? {};
  const id = op.pluginId;
  const slideIndex = op.slideIndex;

  switch (id) {
    case 'canva-render': {
      // Calls Canva API to autofill a brand template, export to PNG, and set as full-screen background
      const templateId = asString(args.templateId);
      const title = asString(args.title) ?? 'Canva Slide';
      const textVariables = args.textVariables as Record<string, string> ?? {};
      
      const operations: SlideOperation[] = [];
      
      if (!templateId) {
        return [opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor))];
      }

      try {
        // Dynamically import to avoid pulling in Node-specific code if running purely on web without Canva
        const { renderCanvaTemplate } = await import('../ai/canva');
        const { useStore } = await import('../store');
        
        const canvaConfig = useStore.getState().canvaConfig;
        if (!canvaConfig.accessToken || !canvaConfig.enabled) {
          throw new Error('Canva API is not configured or disabled in Settings');
        }

        const img = await renderCanvaTemplate(templateId, title, textVariables, { accessToken: canvaConfig.accessToken });
        
        // Canva designs are full-page posters in this mode, so we set it as the slide background
        operations.push({
          action: 'setBackground',
          slideIndex,
          imageBase64: img.base64
        });
        
        // No text overlays since the Canva poster contains the text already.
        // We just return the background operation.
        
      } catch (err: any) {
        console.error('Canva render failed:', err);
        operations.push(opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)));
        operations.push({
          action: 'insertText',
          params: {
            slideIndex,
            text: `【Canva 渲染失败】\n${err.message}`,
            left: 0, top: ctx.slideHeight * 0.42,
            width: ctx.slideWidth, height: 120,
            style: { alignment: 'center', color: ctx.theme.accentColor, fontSize: 16 }
          }
        });
      }
      return operations;
    }

    case 'bg-image': {
      // Create a background image with a smart semi-transparent overlay mask
      const prompt = asString(args.prompt) ?? '背景图';
      const operations: SlideOperation[] = [];
      
      try {
        const { fetchStockImageBase64 } = await import('../ai/image');
        // If it's a real prompt, try to fetch it.
        const img = await fetchStockImageBase64(prompt, ctx.slideWidth, ctx.slideHeight);
        
        operations.push({
          action: 'setBackground',
          slideIndex,
          imageBase64: img.base64
        });
        
        // **SMART OVERLAY**: Insert a semi-transparent dark rectangle over the background
        // to ensure any text written on top of it remains legible.
        operations.push({
          action: 'insertText',
          params: {
            slideIndex,
            text: '',
            left: 0,
            top: 0,
            width: ctx.slideWidth,
            height: ctx.slideHeight,
            // ~60% opacity black mask (hex 99)
            style: { backgroundColor: '#00000099' }
          }
        });
        
      } catch (err) {
        operations.push(opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)));
        operations.push({
          action: 'insertText',
          params: {
            slideIndex,
            text: `【背景图生成失败占位】${prompt}`,
            left: 0, top: ctx.slideHeight * 0.42,
            width: ctx.slideWidth, height: 80,
            style: { alignment: 'center', color: ctx.theme.accentColor, fontSize: 16 }
          }
        });
      }
      return operations;
    }

    case 'auto-layout': {
      // Completely dynamic flex layout provided by AI
      if (args.layout) {
        const bgOps = [opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor))];
        const ops = await renderLayoutToOperations(slideIndex, args.layout, ctx);
        return [...bgOps, ...ops];
      }
      return [];
    }

    case 'cover': {
      const layout = createCoverTemplate(
        asString(args.title) ?? '标题',
        asString(args.subtitle),
        asString(args.author),
        asString(args.date)
      );
      const ops = await renderLayoutToOperations(slideIndex, layout, ctx);
      return [opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)), ...ops];
    }

    case 'title-content': {
      const bullets = asStringArray(args.bullets);
      const content = bullets ? bulletify(bullets) : (asString(args.body) ?? '');
      // Fallback to legacy or simple layout
      const layout = createTwoColumnTemplate(
        asString(args.title) ?? '标题',
        content,
        ''
      );
      // We modify it slightly for single column
      layout.children![1] = { type: 'text', text: content, textStyle: { fontSize: 18, lineSpacing: 1.5 }, flex: 1 };
      const ops = await renderLayoutToOperations(slideIndex, layout, ctx);
      return [opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)), ...ops];
    }

    case 'two-column': {
      const leftContent = asStringArray(args.leftBullets) ? bulletify(asStringArray(args.leftBullets)!) : (asString(args.leftTitle) ?? '');
      const rightContent = asStringArray(args.rightBullets) ? bulletify(asStringArray(args.rightBullets)!) : (asString(args.rightTitle) ?? '');
      
      const layout = createTwoColumnTemplate(
        asString(args.title) ?? '标题',
        leftContent,
        rightContent,
        asString(args.imageKeyword)
      );
      const ops = await renderLayoutToOperations(slideIndex, layout, ctx);
      return [opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)), ...ops];
    }

    case 'image-text': {
      const layout = createImageTextTemplate(
        asString(args.title) ?? '标题',
        asString(args.content) ?? '内容',
        asString(args.imageKeyword) ?? 'technology',
        asString(args.imagePosition) === 'right' ? 'right' : 'left'
      );
      const ops = await renderLayoutToOperations(slideIndex, layout, ctx);
      return [opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)), ...ops];
    }

    case 'big-number': {
      const layout = createBigNumberTemplate(
        asString(args.number) ?? '1',
        asString(args.title) ?? '核心数据',
        asString(args.subtitle)
      );
      const ops = await renderLayoutToOperations(slideIndex, layout, ctx);
      return [opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)), ...ops];
    }

    case 'grid-4': {
      const items = Array.isArray(args.items) ? args.items : [];
      const layout = createGrid4Template(asString(args.title) ?? '四象限分析', items);
      const ops = await renderLayoutToOperations(slideIndex, layout, ctx);
      return [opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)), ...ops];
    }

    case 'section':
    case 'thank-you': {
      // Minimal implementations for completeness
      const layout = createCoverTemplate(
        asString(args.title) ?? '谢谢',
        asString(args.subtitle) ?? asString(args.contact)
      );
      const ops = await renderLayoutToOperations(slideIndex, layout, ctx);
      return [opSetBg(slideIndex, ctx.theme, asString(args.backgroundColor)), ...ops];
    }

    default:
      return [];
  }
}
