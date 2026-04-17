// ============================================================
//  Office.js Adapter — PowerPoint 适配器
//  通过 Office JavaScript API 操作 PowerPoint
// ============================================================

import type {
  ISlideAdapter,
  PresentationInfo,
  SlideInfo,
  ShapeInfo,
  InsertTextBoxParams,
  InsertImageParams,
  UpdateShapeTextParams,
  SlideOperation,
  OperationResult,
  TextStyle,
} from './interface';
import { resolveTheme } from '../themes';
import { expandPluginOperation } from '../plugins';
import type { ProviderConfig } from '../ai/types';
import { generateImage } from '../ai/image';

declare const Office: any;
declare const PowerPoint: any;

export class OfficeJsAdapter implements ISlideAdapter {
  private _imageConfig: ProviderConfig | null = null;
  readonly name = 'officejs' as const;
  private _ready = false;

  // ---- lifecycle ----

  async init(): Promise<void> {
    if (this._ready) return;
    return new Promise((resolve, reject) => {
      Office.onReady((info: any) => {
        if (info.host === Office.HostType.PowerPoint) {
          this._ready = true;
          resolve();
        } else {
          reject(new Error(`Unexpected Office host: ${info.host}`));
        }
      });
    });
  }

  // ---- optional: image generation config (duck-typed) ----
  setImageConfig(config: ProviderConfig | null) {
    this._imageConfig = config;
  }

  // ---- read operations ----

  async getPresentation(): Promise<PresentationInfo> {
    return PowerPoint.run(async (ctx: any) => {
      const presentation = ctx.presentation;
      const slides = presentation.slides;
      slides.load('items');
      await ctx.sync();

      const slideInfos: SlideInfo[] = [];
      for (let i = 0; i < slides.items.length; i++) {
        const slide = slides.items[i];
        slide.load('id');
        slide.shapes.load('items');
        await ctx.sync();
        await this._loadShapeDetails(ctx, slide.shapes.items);

        const shapes = this._extractShapes(slide.shapes.items, i);
        slideInfos.push({
          index: i,
          id: slide.id,
          shapes,
        });
      }

      return {
        title: undefined, // Office.js 不直接暴露 presentation title
        slideCount: slides.items.length,
        slideWidth: 960,  // 默认 10 英寸 × 96 dpi
        slideHeight: 540, // 默认 7.5 英寸 × 96 dpi
        slides: slideInfos,
      };
    });
  }

  async getSlide(index: number): Promise<SlideInfo> {
    return PowerPoint.run(async (ctx: any) => {
      const slides = ctx.presentation.slides;
      slides.load('items');
      await ctx.sync();

      if (index < 0 || index >= slides.items.length) {
        throw new Error(`Slide index ${index} out of range`);
      }

      const slide = slides.items[index];
      slide.load('id');
      slide.shapes.load('items');
      await ctx.sync();
      await this._loadShapeDetails(ctx, slide.shapes.items);

      let notes: string | undefined;
      try {
        slide.notesPage?.textBody?.textRange?.load('text');
        await ctx.sync();
        notes = slide.notesPage?.textBody?.textRange?.text ?? undefined;
      } catch {
        notes = undefined;
      }

      return {
        index,
        id: slide.id,
        notes,
        shapes: this._extractShapes(slide.shapes.items, index),
      };
    });
  }

  async getActiveSlideIndex(): Promise<number> {
    return PowerPoint.run(async (ctx: any) => {
      const selection = ctx.presentation.getSelectedSlides();
      selection.load('items');
      await ctx.sync();

      if (selection.items.length > 0) {
        const selectedId = selection.items[0].id;
        const slides = ctx.presentation.slides;
        slides.load('items');
        await ctx.sync();
        const idx = slides.items.findIndex((s: any) => s.id === selectedId);
        return idx >= 0 ? idx : 0;
      }
      return 0;
    });
  }

  async getCurrentSlide(): Promise<SlideInfo> {
    const index = await this.getActiveSlideIndex();
    return this.getSlide(index);
  }

  async getSelection(): Promise<import('./interface').SelectionInfo> {
    return PowerPoint.run(async (ctx: any) => {
      const slideIndex = await this.getActiveSlideIndex();

      // Office.js 暴露了 getSelectedShapes 获取当前选中的形状
      try {
        const selectedShapes = ctx.presentation.getSelectedShapes();
        selectedShapes.load('items');
        await ctx.sync();
        await this._loadShapeDetails(ctx, selectedShapes.items);

        const shapes = this._extractShapes(selectedShapes.items, slideIndex);

        return {
          slideIndex,
          shapeIds: shapes.map((s) => s.id),
          shapes,
          hasSelection: shapes.length > 0,
        };
      } catch {
        // 如果宿主版本不支持 getSelectedShapes，返回空选区
        return {
          slideIndex,
          shapeIds: [],
          shapes: [],
          hasSelection: false,
        };
      }
    });
  }

  // ---- write operations ----

  async updateShapeText(params: UpdateShapeTextParams): Promise<void> {
    return PowerPoint.run(async (ctx: any) => {
      const slide = this._getSlideByIndex(ctx, params.slideIndex);
      slide.shapes.load('items');
      await ctx.sync();

      const shape = slide.shapes.items.find((s: any) => s.id === params.shapeId);
      if (!shape) throw new Error(`Shape ${params.shapeId} not found on slide ${params.slideIndex}`);

      if (shape.textFrame) {
        shape.textFrame.textRange.text = params.text;
        if (params.style) {
          this._applyTextStyle(shape, params.style);
        }
      }
      await ctx.sync();
    });
  }

  async updateShapeGeometry(params: { slideIndex: number; shapeId: string; left: number; top: number; width?: number; height?: number }): Promise<void> {
    return PowerPoint.run(async (ctx: any) => {
      const slide = this._getSlideByIndex(ctx, params.slideIndex);
      slide.shapes.load('items');
      await ctx.sync();

      const shape = slide.shapes.items.find((s: any) => s.id === params.shapeId);
      if (!shape) throw new Error(`Shape ${params.shapeId} not found on slide ${params.slideIndex}`);

      shape.left = params.left;
      shape.top = params.top;
      if (typeof params.width === 'number') shape.width = params.width;
      if (typeof params.height === 'number') shape.height = params.height;
      await ctx.sync();
    });
  }

  async insertTextBox(params: InsertTextBoxParams): Promise<string> {
    return PowerPoint.run(async (ctx: any) => {
      const slide = this._getSlideByIndex(ctx, params.slideIndex);

      const shape = slide.shapes.addTextBox(params.text, {
        left: params.left,
        top: params.top,
        width: params.width,
        height: params.height,
      });
      shape.load('id');

      if (params.style) {
        this._applyTextStyle(shape, params.style);
      }

      await ctx.sync();
      return shape.id;
    });
  }

  async insertImage(params: InsertImageParams): Promise<string> {
    return PowerPoint.run(async (ctx: any) => {
      const slide = this._getSlideByIndex(ctx, params.slideIndex);

      const image = slide.shapes.addImage(params.base64, {
        left: params.left,
        top: params.top,
        width: params.width,
        height: params.height,
      });
      // 允许设置 shape name（用于 wordart:<assetId> 等二次编辑识别）
      try {
        if (params.name) image.name = params.name;
      } catch {
        // 某些宿主版本不支持 name setter，忽略
      }
      image.load('id');
      await ctx.sync();
      return image.id;
    });
  }

  async replaceImage(slideIndex: number, shapeId: string, base64: string, mimeType: InsertImageParams['mimeType'], name?: string): Promise<string> {
    return PowerPoint.run(async (ctx: any) => {
      const slide = this._getSlideByIndex(ctx, slideIndex);
      slide.shapes.load('items');
      await ctx.sync();
      const shape = slide.shapes.items.find((s: any) => s.id === shapeId);
      if (!shape) throw new Error(`Shape ${shapeId} not found`);
      const left = shape.left ?? 0;
      const top = shape.top ?? 0;
      const width = shape.width ?? 300;
      const height = shape.height ?? 200;
      let oldName: string | undefined;
      try { oldName = shape.name; } catch { /* ignore */ }
      shape.delete();
      await ctx.sync();

      const image = slide.shapes.addImage(base64, { left, top, width, height });
      try {
        image.name = name ?? oldName ?? '';
      } catch {
        // ignore
      }
      image.load('id');
      await ctx.sync();
      return image.id;
    });
  }

  async deleteShape(slideIndex: number, shapeId: string): Promise<void> {
    return PowerPoint.run(async (ctx: any) => {
      const slide = this._getSlideByIndex(ctx, slideIndex);
      slide.shapes.load('items');
      await ctx.sync();

      const shape = slide.shapes.items.find((s: any) => s.id === shapeId);
      if (shape) {
        shape.delete();
        await ctx.sync();
      }
    });
  }

  async addSlide(afterIndex?: number, _layoutName?: string): Promise<number> {
    return PowerPoint.run(async (ctx: any) => {
      const slides = ctx.presentation.slides;
      slides.load('items');
      await ctx.sync();

      const insertIdx = afterIndex !== undefined ? afterIndex + 1 : slides.items.length;
      slides.add(insertIdx);
      await ctx.sync();
      return insertIdx;
    });
  }

  async deleteSlide(index: number): Promise<void> {
    return PowerPoint.run(async (ctx: any) => {
      const slide = this._getSlideByIndex(ctx, index);
      slide.delete();
      await ctx.sync();
    });
  }

  async reorderSlide(fromIndex: number, toIndex: number): Promise<void> {
    return PowerPoint.run(async (ctx: any) => {
      const slides = ctx.presentation.slides;
      slides.load('items');
      await ctx.sync();

      if (fromIndex >= 0 && fromIndex < slides.items.length) {
        slides.items[fromIndex].moveTo(toIndex);
        await ctx.sync();
      }
    });
  }

  async setNotes(slideIndex: number, notes: string): Promise<void> {
    return PowerPoint.run(async (ctx: any) => {
      const slide = this._getSlideByIndex(ctx, slideIndex);
      slide.notesPage.textBody.textRange.text = notes;
      await ctx.sync();
    });
  }

  async setBackground(slideIndex: number, color?: string, imageBase64?: string): Promise<void> {
    return PowerPoint.run(async (ctx: any) => {
      const slide = this._getSlideByIndex(ctx, slideIndex);
      if (color) {
        slide.background.fill.setSolidColor(color.replace('#', ''));
      } else if (imageBase64) {
        slide.background.fill.setImage(imageBase64);
      }
      await ctx.sync();
    });
  }

  async undo(): Promise<void> {
    // Office.js 本身不直接暴露 undo API，依赖宿主应用的撤销栈
    console.warn('[OfficeJsAdapter] undo() — relying on host undo stack');
  }

  async getSlideThumbnail(index: number): Promise<string | null> {
    try {
      return await PowerPoint.run(async (ctx: any) => {
        const slide = this._getSlideByIndex(ctx, index);
        const thumbnail = slide.getThumbnail({ width: 320, height: 180 });
        await ctx.sync();
        return thumbnail.value ?? null;
      });
    } catch {
      return null;
    }
  }

  // ---- batch execution ----

  async executeBatch(operations: SlideOperation[]): Promise<OperationResult[]> {
    const results: OperationResult[] = [];

    for (const op of operations) {
      try {
        switch (op.action) {
          case 'callPlugin': {
            // 插件端支持 bg-image：若配置了可用的图片生成 provider，则直接生成并设为背景
            if (op.pluginId === 'bg-image') {
              const prompt = String(op.args?.prompt ?? '').trim();
              if (!prompt) throw new Error('bg-image 缺少 prompt');
              if (!this._imageConfig) throw new Error('未配置图片生成 Provider（请在设置中使用支持 images 的 OpenAI/兼容服务）');
              const img = await generateImage(prompt, this._imageConfig, { size: '1024x576' });
              await this.setBackground(op.slideIndex, undefined, img.base64);
              results.push({ success: true, operation: op });
              continue;
            }

            const pres = await this.getPresentation();
            const expanded = expandPluginOperation(op, {
              slideWidth: pres.slideWidth,
              slideHeight: pres.slideHeight,
              theme: resolveTheme(),
            });
            const subResults = await this.executeBatch(expanded);
            const failed = subResults.filter((r) => !r.success);
            results.push({
              success: failed.length === 0,
              operation: op,
              error: failed.length > 0 ? `插件执行失败 ${failed.length} 项` : undefined,
            });
            continue;
          }
          case 'updateText':
            await this.updateShapeText({
              slideIndex: op.slideIndex,
              shapeId: op.shapeId,
              text: op.text,
              style: op.style,
            });
            break;
          case 'updateGeometry':
            await this.updateShapeGeometry({
              slideIndex: op.slideIndex,
              shapeId: op.shapeId,
              left: op.left,
              top: op.top,
              width: op.width,
              height: op.height,
            });
            break;
          case 'insertText':
            await this.insertTextBox(op.params);
            break;
          case 'insertImage':
            await this.insertImage(op.params);
            break;
          case 'replaceImage':
            await this.replaceImage(op.slideIndex, op.shapeId, op.base64, op.mimeType, op.name);
            break;
          case 'deleteShape':
            await this.deleteShape(op.slideIndex, op.shapeId);
            break;
          case 'addSlide':
            await this.addSlide(op.afterIndex, op.layoutName);
            break;
          case 'deleteSlide':
            await this.deleteSlide(op.slideIndex);
            break;
          case 'reorderSlide':
            await this.reorderSlide(op.fromIndex, op.toIndex);
            break;
          case 'setNotes':
            await this.setNotes(op.slideIndex, op.notes);
            break;
          case 'setBackground':
            await this.setBackground(op.slideIndex, op.color, op.imageBase64);
            break;
        }
        results.push({ success: true, operation: op });
      } catch (err: any) {
        results.push({ success: false, operation: op, error: err.message });
      }
    }

    return results;
  }

  // ---- private helpers ----

  private _getSlideByIndex(ctx: any, index: number) {
    return ctx.presentation.slides.getItemAt(index);
  }

  private async _loadShapeDetails(ctx: any, shapes: any[]): Promise<void> {
    for (const shape of shapes) {
      shape.load([
        'id',
        'name',
        'type',
        'left',
        'top',
        'width',
        'height',
        'textFrame',
      ]);
    }
    await ctx.sync();

    for (const shape of shapes) {
      try {
        shape.textFrame?.textRange?.load('text');
        shape.textFrame?.textRange?.font?.load(['size', 'name', 'bold', 'italic', 'underline', 'color']);
        shape.textFrame?.textRange?.paragraphFormat?.load(['alignment', 'spaceWithin']);
      } catch {
        // 某些非文本形状不支持 textFrame/textRange，跳过即可
      }
    }
    await ctx.sync();
  }

  private _extractShapes(items: any[], _slideIndex: number): ShapeInfo[] {
    return items.map((s: any) => ({
      id: s.id,
      name: s.name ?? '',
      type: this._mapShapeType(s.type),
      text: s.textFrame?.textRange?.text ?? undefined,
      left: s.left ?? 0,
      top: s.top ?? 0,
      width: s.width ?? 0,
      height: s.height ?? 0,
      style: this._extractTextStyle(s),
    }));
  }

  private _mapShapeType(officeType: string): ShapeInfo['type'] {
    const map: Record<string, ShapeInfo['type']> = {
      TextBox: 'textBox',
      Image: 'image',
      Table: 'table',
      Chart: 'chart',
      Group: 'group',
    };
    return map[officeType] ?? 'shape';
  }

  private _applyTextStyle(shape: any, style: TextStyle): void {
    const textRange = shape.textFrame?.textRange;
    const font = textRange?.font;

    if (font) {
      if (style.fontSize) font.size = style.fontSize;
      if (style.fontFamily) font.name = style.fontFamily;
      if (style.bold !== undefined) font.bold = style.bold;
      if (style.italic !== undefined) font.italic = style.italic;
      if (style.underline !== undefined) font.underline = style.underline ? 'Single' : 'None';
      if (style.color) font.color = style.color.replace('#', '');
    }

    try {
      const alignment = this._mapAlignment(style.alignment);
      if (alignment && textRange?.paragraphFormat) {
        textRange.paragraphFormat.alignment = alignment;
      }
    } catch {
      // 某些宿主版本不支持 paragraphFormat，忽略即可
    }

    try {
      if (style.lineSpacing && textRange?.paragraphFormat) {
        textRange.paragraphFormat.spaceWithin = style.lineSpacing;
      }
    } catch {
      // 行距支持不一致，失败时静默忽略
    }

    try {
      if (style.backgroundColor && shape.fill) {
        shape.fill.setSolidColor(style.backgroundColor.replace('#', ''));
      }
    } catch {
      // 某些形状不支持 fill，忽略即可
    }
  }

  private _extractTextStyle(shape: any): TextStyle | undefined {
    const font = shape.textFrame?.textRange?.font;
    const paragraph = shape.textFrame?.textRange?.paragraphFormat;
    const style: TextStyle = {
      fontSize: typeof font?.size === 'number' ? font.size : undefined,
      fontFamily: typeof font?.name === 'string' ? font.name : undefined,
      bold: typeof font?.bold === 'boolean' ? font.bold : undefined,
      italic: typeof font?.italic === 'boolean' ? font.italic : undefined,
      underline: typeof font?.underline === 'string' ? font.underline !== 'None' : undefined,
      color: typeof font?.color === 'string' && font.color ? `#${font.color}` : undefined,
      alignment: this._extractAlignment(paragraph?.alignment),
      lineSpacing: typeof paragraph?.spaceWithin === 'number' ? paragraph.spaceWithin : undefined,
    };
    const entries = Object.entries(style).filter(([, value]) => value !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) as TextStyle : undefined;
  }

  private _mapAlignment(alignment?: TextStyle['alignment']) {
    const map: Record<NonNullable<TextStyle['alignment']>, string> = {
      left: 'Left',
      center: 'Center',
      right: 'Right',
    };
    return alignment ? map[alignment] : undefined;
  }

  private _extractAlignment(value: unknown): TextStyle['alignment'] | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.toLowerCase();
    if (normalized.includes('center')) return 'center';
    if (normalized.includes('right')) return 'right';
    if (normalized.includes('left')) return 'left';
    return undefined;
  }
}
