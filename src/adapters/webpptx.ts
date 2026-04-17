// ============================================================
//  WebPptxAdapter — 浏览器端 PPTX 生成/修改适配器
//  - 以内存数据结构模拟 Presentation/Slides/Shapes
//  - 支持 executeBatch 执行操作
//  - 支持 exportPptx() 导出 .pptx
// ============================================================

import PptxGenJS from 'pptxgenjs';
import type {
  ISlideAdapter,
  PresentationInfo,
  SlideInfo,
  SelectionInfo,
  ShapeInfo,
  InsertTextBoxParams,
  InsertImageParams,
  UpdateShapeTextParams,
  SlideOperation,
  OperationResult,
  TextStyle,
} from './interface';
import { resolveTheme, type ThemeDefinition, type ThemeSpec } from '../themes';
import { expandPluginOperation, type PluginAwareOperation } from '../plugins';
import type { ProviderConfig } from '../ai/types';
import { generateImage } from '../ai/image';

type WebShape = ShapeInfo & {
  // 用于导出：图片 shape 的 data uri
  _imageDataUri?: string;
};

type WebSlide = Omit<SlideInfo, 'shapes'> & {
  shapes: WebShape[];
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hexNoHash(hex?: string): string | undefined {
  if (!hex) return undefined;
  return hex.startsWith('#') ? hex.slice(1) : hex;
}

/**
 * WebPptxAdapter 使用“虚拟坐标系”：
 * - 默认 slideWidth=960, slideHeight=540（与现有代码保持一致）
 * - 导出时会按比例映射到 PPTX 的 LAYOUT_WIDE (13.333 x 7.5 in)
 */
export class WebPptxAdapter implements ISlideAdapter {
  readonly name = 'webpptx' as const;

  private _presentation: PresentationInfo & { slides: WebSlide[] };
  private _activeSlideIndex = 0;
  private _selectedShapeIds: string[] = [];
  private _undoStack: Array<PresentationInfo & { slides: WebSlide[] }> = [];

  private _themeSpec: ThemeSpec = { themeName: 'Modern Blue' };
  private _theme: ThemeDefinition = resolveTheme(this._themeSpec);
  private _imageConfig: ProviderConfig | null = null;

  constructor() {
    this._presentation = {
      title: 'AI Generated Deck',
      slideCount: 0,
      slideWidth: 960,
      slideHeight: 540,
      slides: [],
    };
  }

  // ---- optional capabilities (duck-typed) ----

  setActiveSlideIndex(index: number) {
    this._activeSlideIndex = Math.min(Math.max(index, 0), Math.max(0, this._presentation.slides.length - 1));
  }

  setSelection(shapeIds: string[]) {
    this._selectedShapeIds = Array.isArray(shapeIds) ? shapeIds : [];
  }

  setTheme(spec: ThemeSpec) {
    this._themeSpec = spec;
    this._theme = resolveTheme(spec);
  }

  setImageConfig(config: ProviderConfig | null) {
    this._imageConfig = config;
  }

  getTheme(): ThemeDefinition {
    return this._theme;
  }

  async exportPptx(fileName = 'ai-generated.pptx'): Promise<Blob> {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'AI PPT';
    // pptxgenjs 的 theme 会影响默认字体；这里尽量设置为主题字体
    try {
      (pptx as any).theme = {
        headFontFace: this._theme.fontFamily,
        bodyFontFace: this._theme.fontFamily,
        lang: 'zh-CN',
      };
    } catch {
      // 不同版本 pptxgenjs theme API 可能略有差异，失败就忽略
    }

    const deck = await this.getPresentation();
    const WIDE_W_IN = 13.333;
    const WIDE_H_IN = 7.5;

    const toX = (x: number) => (x / deck.slideWidth) * WIDE_W_IN;
    const toY = (y: number) => (y / deck.slideHeight) * WIDE_H_IN;
    const toW = (w: number) => (w / deck.slideWidth) * WIDE_W_IN;
    const toH = (h: number) => (h / deck.slideHeight) * WIDE_H_IN;

    for (const slide of deck.slides) {
      const s = pptx.addSlide();

      // background
      if (slide.backgroundColor) {
        (s as any).background = { color: hexNoHash(slide.backgroundColor) };
      }
      // background image (if exists)
      const bgImg = (slide as any)._backgroundImageBase64 as string | undefined;
      if (bgImg) {
        // pptxgenjs background image: 直接铺满整页
        s.addImage({
          data: `data:image/png;base64,${bgImg}`,
          x: 0,
          y: 0,
          w: WIDE_W_IN,
          h: WIDE_H_IN,
        });
      }

      // shapes
      for (const shape of slide.shapes as WebShape[]) {
        if (shape.type === 'image' && shape._imageDataUri) {
          s.addImage({
            data: shape._imageDataUri,
            x: toX(shape.left),
            y: toY(shape.top),
            w: toW(shape.width),
            h: toH(shape.height),
          });
          continue;
        }

        // 文本/形状：目前统一按文本框导出（满足“可用闭环”）
        if (shape.text) {
          const style = shape.style ?? {};
          const options: any = {
            x: toX(shape.left),
            y: toY(shape.top),
            w: toW(shape.width),
            h: toH(shape.height),
            fontFace: style.fontFamily ?? this._theme.fontFamily,
            fontSize: style.fontSize ?? this._theme.defaults.body.fontSize,
            bold: style.bold ?? false,
            italic: style.italic ?? false,
            underline: style.underline ? true : false,
            color: hexNoHash(style.color ?? this._theme.defaults.body.color),
          };

          const align = style.alignment;
          if (align) options.align = align;
          s.addText(shape.text, options);
        }
      }

      // notes
      if (slide.notes) {
        try {
          (s as any).addNotes(slide.notes);
        } catch {
          // ignore
        }
      }
    }

    // 写入 blob（浏览器端）
    const out = await (pptx as any).write('blob', { fileName });
    return out as Blob;
  }

  // ---- lifecycle ----

  async init(): Promise<void> {
    // 浏览器端无需初始化
  }

  // ---- read operations ----

  async getPresentation(): Promise<PresentationInfo> {
    // 保证 slideCount 与 slides 同步
    this._presentation.slideCount = this._presentation.slides.length;
    return deepClone(this._presentation);
  }

  async getSlide(index: number): Promise<SlideInfo> {
    const slide = this._presentation.slides[index];
    if (!slide) throw new Error(`Slide index ${index} out of range`);
    return deepClone(slide);
  }

  async getActiveSlideIndex(): Promise<number> {
    return Math.min(Math.max(this._activeSlideIndex, 0), Math.max(0, this._presentation.slides.length - 1));
  }

  async getCurrentSlide(): Promise<SlideInfo> {
    const idx = await this.getActiveSlideIndex();
    if (this._presentation.slides.length === 0) {
      // 没有任何页面时，返回一个“虚拟页”，供 AI 生成 addSlide
      return {
        index: 0,
        id: 'virtual-slide-0',
        shapes: [],
      };
    }
    return this.getSlide(idx);
  }

  async getSelection(): Promise<SelectionInfo> {
    const slideIndex = await this.getActiveSlideIndex();
    const slide = this._presentation.slides[slideIndex];
    const shapes = slide
      ? slide.shapes.filter((s) => this._selectedShapeIds.includes(s.id))
      : [];

    return {
      slideIndex,
      shapeIds: shapes.map((s) => s.id),
      shapes: deepClone(shapes),
      hasSelection: shapes.length > 0,
    };
  }

  async getSlideThumbnail(_index: number): Promise<string | null> {
    // Web 版本暂不生成缩略图（后续可用 html2canvas 或自渲染实现）
    return null;
  }

  // ---- write operations ----

  async updateShapeText(params: UpdateShapeTextParams): Promise<void> {
    const slide = this._ensureSlide(params.slideIndex);
    const shape = slide.shapes.find((s) => s.id === params.shapeId);
    if (!shape) throw new Error(`Shape ${params.shapeId} not found`);
    shape.text = params.text;
    if (params.style) {
      shape.style = { ...(shape.style ?? {}), ...params.style };
    }
  }

  async updateShapeGeometry(params: { slideIndex: number; shapeId: string; left: number; top: number; width?: number; height?: number }): Promise<void> {
    const slide = this._ensureSlide(params.slideIndex);
    const shape = slide.shapes.find((s) => s.id === params.shapeId);
    if (!shape) throw new Error(`Shape ${params.shapeId} not found`);
    shape.left = params.left;
    shape.top = params.top;
    if (typeof params.width === 'number') shape.width = params.width;
    if (typeof params.height === 'number') shape.height = params.height;
  }

  async insertTextBox(params: InsertTextBoxParams): Promise<string> {
    const slide = this._ensureSlide(params.slideIndex);
    const id = `shape_${crypto.randomUUID()}`;
    const style = this._mergeWithThemeDefaults(params.style, 'body');
    slide.shapes.push({
      id,
      name: 'TextBox',
      type: 'textBox',
      text: params.text,
      left: params.left,
      top: params.top,
      width: params.width,
      height: params.height,
      style,
    });
    return id;
  }

  async insertImage(params: InsertImageParams): Promise<string> {
    const slide = this._ensureSlide(params.slideIndex);
    const id = `shape_${crypto.randomUUID()}`;
    const dataUri = `data:${params.mimeType};base64,${params.base64}`;
    slide.shapes.push({
      id,
      name: params.name ?? 'Image',
      type: 'image',
      left: params.left,
      top: params.top,
      width: params.width,
      height: params.height,
      _imageDataUri: dataUri,
    });
    return id;
  }

  async replaceImage(params: { slideIndex: number; shapeId: string; base64: string; mimeType: InsertImageParams['mimeType']; name?: string }): Promise<void> {
    const slide = this._ensureSlide(params.slideIndex);
    const shape = slide.shapes.find((s) => s.id === params.shapeId) as WebShape | undefined;
    if (!shape) throw new Error(`Shape ${params.shapeId} not found`);
    const dataUri = `data:${params.mimeType};base64,${params.base64}`;
    shape.type = 'image';
    shape.name = params.name ?? shape.name;
    shape._imageDataUri = dataUri;
  }

  async deleteShape(slideIndex: number, shapeId: string): Promise<void> {
    const slide = this._presentation.slides[slideIndex];
    if (!slide) return;
    slide.shapes = slide.shapes.filter((s) => s.id !== shapeId);
  }

  async addSlide(afterIndex?: number, layoutName?: string): Promise<number> {
    const newSlide: WebSlide = {
      index: 0,
      id: `slide_${crypto.randomUUID()}`,
      layoutName,
      shapes: [],
      backgroundColor: this._theme.defaults.backgroundColor,
    };

    const slides = this._presentation.slides;
    let insertAt = slides.length;
    if (afterIndex !== undefined) {
      insertAt = Math.min(Math.max(afterIndex + 1, 0), slides.length);
    }
    slides.splice(insertAt, 0, newSlide);
    this._reindexSlides();
    this._activeSlideIndex = insertAt;
    return insertAt;
  }

  async deleteSlide(index: number): Promise<void> {
    this._presentation.slides.splice(index, 1);
    this._reindexSlides();
    this._activeSlideIndex = Math.min(this._activeSlideIndex, Math.max(0, this._presentation.slides.length - 1));
  }

  async reorderSlide(fromIndex: number, toIndex: number): Promise<void> {
    const slides = this._presentation.slides;
    if (fromIndex < 0 || fromIndex >= slides.length) return;
    const [item] = slides.splice(fromIndex, 1);
    const target = Math.min(Math.max(toIndex, 0), slides.length);
    slides.splice(target, 0, item);
    this._reindexSlides();
    this._activeSlideIndex = target;
  }

  async setNotes(slideIndex: number, notes: string): Promise<void> {
    const slide = this._ensureSlide(slideIndex);
    slide.notes = notes;
  }

  async setBackground(slideIndex: number, color?: string, imageBase64?: string): Promise<void> {
    const slide = this._ensureSlide(slideIndex);
    if (color) slide.backgroundColor = color;
    if (imageBase64) {
      // 暂时只保存，不做渲染；导出时可扩展到 slide.background.data
      (slide as any)._backgroundImageBase64 = imageBase64;
    }
  }

  async undo(): Promise<void> {
    const last = this._undoStack.pop();
    if (last) {
      this._presentation = deepClone(last);
      this._reindexSlides();
    }
  }

  // ---- batch execution ----

  async executeBatch(operations: SlideOperation[]): Promise<OperationResult[]> {
    // 记录 undo 快照
    this._undoStack.push(deepClone(this._presentation));
    if (this._undoStack.length > 30) this._undoStack.shift();

    const results: OperationResult[] = [];

    for (const op of operations as PluginAwareOperation[]) {
      try {
        if (op.action === 'callPlugin') {
          // Web 端支持 bg-image：用真实图片生成并设为背景
          if (op.pluginId === 'bg-image') {
            const prompt = String(op.args?.prompt ?? '').trim();
            if (!prompt) throw new Error('bg-image 缺少 prompt');
            if (!this._imageConfig) throw new Error('未配置图片生成 Provider（请在设置中选择支持 images 的 OpenAI/兼容服务）');
            const img = await generateImage(prompt, this._imageConfig, { size: '1024x576' });
            // 直接设为背景（先用 setBackground 的 imageBase64 字段存储）
            await this.setBackground(op.slideIndex, undefined, img.base64);
            results.push({ success: true, operation: op as unknown as SlideOperation });
            continue;
          }

          const expanded = expandPluginOperation(op, {
            slideWidth: this._presentation.slideWidth,
            slideHeight: this._presentation.slideHeight,
            theme: this._theme,
          });
          const sub = await this.executeBatch(expanded);
          const failed = sub.filter((r) => !r.success);
          results.push({
            success: failed.length === 0,
            operation: op as unknown as SlideOperation,
            error: failed.length > 0 ? `插件执行失败 ${failed.length} 项` : undefined,
          });
          continue;
        }

        switch (op.action) {
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
            await this.replaceImage({
              slideIndex: op.slideIndex,
              shapeId: op.shapeId,
              base64: op.base64,
              mimeType: op.mimeType,
              name: op.name,
            });
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
        results.push({ success: true, operation: op as unknown as SlideOperation });
      } catch (err: any) {
        results.push({ success: false, operation: op as unknown as SlideOperation, error: err?.message ?? String(err) });
      }
    }

    return results;
  }

  // ---- helpers ----

  private _reindexSlides() {
    this._presentation.slides.forEach((slide, idx) => {
      slide.index = idx;
    });
    this._presentation.slideCount = this._presentation.slides.length;
  }

  private _mergeWithThemeDefaults(style: TextStyle | undefined, kind: 'title' | 'body'): TextStyle | undefined {
    const base = kind === 'title' ? this._theme.defaults.title : this._theme.defaults.body;
    const merged: TextStyle = {
      fontFamily: style?.fontFamily ?? base.fontFamily ?? this._theme.fontFamily,
      fontSize: style?.fontSize ?? base.fontSize,
      bold: style?.bold ?? base.bold,
      color: style?.color ?? base.color,
      alignment: style?.alignment ?? base.alignment,
      italic: style?.italic ?? base.italic,
      underline: style?.underline ?? base.underline,
      backgroundColor: style?.backgroundColor ?? base.backgroundColor,
      lineSpacing: style?.lineSpacing ?? base.lineSpacing,
    };
    const entries = Object.entries(merged).filter(([, value]) => value !== undefined);
    return entries.length > 0 ? (Object.fromEntries(entries) as TextStyle) : undefined;
  }

  private _ensureSlide(slideIndex: number): WebSlide {
    if (slideIndex < 0) throw new Error(`Slide ${slideIndex} out of range`);
    while (this._presentation.slides.length <= slideIndex) {
      const nextIndex = this._presentation.slides.length;
      this._presentation.slides.push({
        index: nextIndex,
        id: `slide_${crypto.randomUUID()}`,
        shapes: [],
        backgroundColor: this._theme.defaults.backgroundColor,
      });
    }
    this._reindexSlides();
    return this._presentation.slides[slideIndex];
  }
}
