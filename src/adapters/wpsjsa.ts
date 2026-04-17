// ============================================================
//  WPS JSA Adapter — WPS Office 适配器
//  通过 WPS JavaScript Add-in API 操作 WPS 演示
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

/**
 * WPS JSA 全局对象声明
 * WPS 通过 `Application` 全局对象暴露 API，
 * 接口风格类似 VBA 的 COM 对象模型。
 */
declare const Application: any;

export class WpsJsaAdapter implements ISlideAdapter {
  readonly name = 'wpsjsa' as const;
  private _ready = false;
  private _imageConfig: ProviderConfig | null = null;

  async init(): Promise<void> {
    if (this._ready) return;
    // WPS JSA 环境下 Application 在脚本加载时即可用
    if (typeof Application === 'undefined') {
      throw new Error('WPS Application object not found');
    }
    this._ready = true;
  }

  // ---- optional: image generation config (duck-typed) ----
  setImageConfig(config: ProviderConfig | null) {
    this._imageConfig = config;
  }

  // ---- helpers ----

  private get _pres() {
    return Application.ActivePresentation;
  }

  private _getSlide(index: number) {
    // WPS slides 集合是 1-based
    return this._pres.Slides.Item(index + 1);
  }

  // ---- read ----

  async getPresentation(): Promise<PresentationInfo> {
    const pres = this._pres;
    const count = pres.Slides.Count;
    const slides: SlideInfo[] = [];

    for (let i = 0; i < count; i++) {
      slides.push(await this.getSlide(i));
    }

    return {
      title: pres.Name ?? undefined,
      slideCount: count,
      slideWidth: pres.PageSetup?.SlideWidth ?? 960,
      slideHeight: pres.PageSetup?.SlideHeight ?? 540,
      slides,
    };
  }

  async getSlide(index: number): Promise<SlideInfo> {
    const slide = this._getSlide(index);
    const shapes: ShapeInfo[] = [];

    for (let j = 1; j <= slide.Shapes.Count; j++) {
      const s = slide.Shapes.Item(j);
      shapes.push({
        id: String(s.Id ?? j),
        name: s.Name ?? '',
        type: this._mapShapeType(s.Type),
        text: s.HasTextFrame ? s.TextFrame?.TextRange?.Text ?? undefined : undefined,
        left: s.Left ?? 0,
        top: s.Top ?? 0,
        width: s.Width ?? 0,
        height: s.Height ?? 0,
        style: s.HasTextFrame ? this._extractTextStyle(s) : undefined,
      });
    }

    return {
      index,
      id: String(slide.SlideID ?? index),
      layoutName: slide.Layout?.Name ?? undefined,
      shapes,
      notes: slide.NotesPage?.Shapes?.Item(2)?.TextFrame?.TextRange?.Text ?? undefined,
    };
  }

  async getActiveSlideIndex(): Promise<number> {
    try {
      const view = Application.ActiveWindow?.View;
      if (view?.Slide) {
        return view.Slide.SlideIndex - 1; // 转为 0-based
      }
    } catch { /* fallback */ }
    return 0;
  }

  async getCurrentSlide(): Promise<SlideInfo> {
    const index = await this.getActiveSlideIndex();
    return this.getSlide(index);
  }

  async getSelection(): Promise<import('./interface').SelectionInfo> {
    const slideIndex = await this.getActiveSlideIndex();
    const shapes: ShapeInfo[] = [];

    try {
      // WPS: Application.ActiveWindow.Selection.ShapeRange 是当前选中的形状集合
      const selection = Application.ActiveWindow?.Selection;
      const shapeRange = selection?.ShapeRange;

      if (shapeRange && shapeRange.Count > 0) {
        for (let i = 1; i <= shapeRange.Count; i++) {
          const s = shapeRange.Item(i);
          shapes.push({
            id: String(s.Id ?? i),
            name: s.Name ?? '',
            type: this._mapShapeType(s.Type),
            text: s.HasTextFrame ? s.TextFrame?.TextRange?.Text ?? undefined : undefined,
            left: s.Left ?? 0,
            top: s.Top ?? 0,
            width: s.Width ?? 0,
            height: s.Height ?? 0,
            style: s.HasTextFrame ? this._extractTextStyle(s) : undefined,
          });
        }
      }
    } catch {
      // 无选中或 API 不可用，静默返回空
    }

    return {
      slideIndex,
      shapeIds: shapes.map((s) => s.id),
      shapes,
      hasSelection: shapes.length > 0,
    };
  }

  // ---- write ----

  async updateShapeText(params: UpdateShapeTextParams): Promise<void> {
    const slide = this._getSlide(params.slideIndex);
    const shape = this._findShapeById(slide, params.shapeId);

    if (!shape) throw new Error(`Shape ${params.shapeId} not found`);
    if (!shape.HasTextFrame) throw new Error(`Shape ${params.shapeId} has no text frame`);

    shape.TextFrame.TextRange.Text = params.text;
    if (params.style) {
      this._applyTextStyle(shape.TextFrame.TextRange.Font, params.style);
    }
  }

  async updateShapeGeometry(params: { slideIndex: number; shapeId: string; left: number; top: number; width?: number; height?: number }): Promise<void> {
    const slide = this._getSlide(params.slideIndex);
    const shape = this._findShapeById(slide, params.shapeId);
    if (!shape) throw new Error(`Shape ${params.shapeId} not found`);

    shape.Left = params.left;
    shape.Top = params.top;
    if (typeof params.width === 'number') shape.Width = params.width;
    if (typeof params.height === 'number') shape.Height = params.height;
  }

  async insertTextBox(params: InsertTextBoxParams): Promise<string> {
    const slide = this._getSlide(params.slideIndex);
    // WPS AddTextbox: Orientation, Left, Top, Width, Height
    const shape = slide.Shapes.AddTextbox(
      1, // msoTextOrientationHorizontal
      params.left,
      params.top,
      params.width,
      params.height,
    );
    shape.TextFrame.TextRange.Text = params.text;
    if (params.style) {
      this._applyTextStyle(shape.TextFrame.TextRange.Font, params.style);
    }
    return String(shape.Id);
  }

  async insertImage(params: InsertImageParams): Promise<string> {
    const slide = this._getSlide(params.slideIndex);

    // WPS 需要先将 base64 写入临时文件再插入
    // 在 JSA 环境中通过 FileSystem 对象写临时文件
    const tmpPath = this._writeTempImage(params.base64, params.mimeType);

    const shape = slide.Shapes.AddPicture(
      tmpPath,
      0,    // msoFalse — LinkToFile
      -1,   // msoTrue  — SaveWithDocument
      params.left,
      params.top,
      params.width,
      params.height,
    );
    try {
      if (params.name) shape.Name = params.name;
    } catch {
      // ignore
    }
    return String(shape.Id);
  }

  async replaceImage(slideIndex: number, shapeId: string, base64: string, mimeType: InsertImageParams['mimeType'], name?: string): Promise<string> {
    const slide = this._getSlide(slideIndex);
    const shape = this._findShapeById(slide, shapeId);
    if (!shape) throw new Error(`Shape ${shapeId} not found`);
    const left = shape.Left ?? 0;
    const top = shape.Top ?? 0;
    const width = shape.Width ?? 300;
    const height = shape.Height ?? 200;
    let oldName: string | undefined;
    try { oldName = shape.Name; } catch { /* ignore */ }
    shape.Delete();
    const tmpPath = this._writeTempImage(base64, mimeType);
    const newShape = slide.Shapes.AddPicture(tmpPath, 0, -1, left, top, width, height);
    try { newShape.Name = name ?? oldName; } catch { /* ignore */ }
    return String(newShape.Id);
  }

  async deleteShape(slideIndex: number, shapeId: string): Promise<void> {
    const slide = this._getSlide(slideIndex);
    const shape = this._findShapeById(slide, shapeId);
    if (shape) shape.Delete();
  }

  async addSlide(afterIndex?: number, _layoutName?: string): Promise<number> {
    const pres = this._pres;
    const insertAt = afterIndex !== undefined ? afterIndex + 2 : pres.Slides.Count + 1;

    // 使用默认布局添加空白幻灯片
    pres.Slides.Add(insertAt, 12); // ppLayoutBlank = 12
    return insertAt - 1; // 返回 0-based index
  }

  async deleteSlide(index: number): Promise<void> {
    this._getSlide(index).Delete();
  }

  async reorderSlide(fromIndex: number, toIndex: number): Promise<void> {
    const slide = this._getSlide(fromIndex);
    slide.MoveTo(toIndex + 1); // WPS 1-based
  }

  async setNotes(slideIndex: number, notes: string): Promise<void> {
    const slide = this._getSlide(slideIndex);
    const notesShape = slide.NotesPage?.Shapes?.Item(2);
    if (notesShape?.HasTextFrame) {
      notesShape.TextFrame.TextRange.Text = notes;
    }
  }

  async setBackground(slideIndex: number, color?: string, imageBase64?: string): Promise<void> {
    const slide = this._getSlide(slideIndex);
    if (color) {
      slide.Background.Fill.ForeColor.RGB = this._hexToRgbInt(color);
      slide.Background.Fill.Solid();
      return;
    }
    if (imageBase64) {
      // WPS JSA 背景图 API 不稳定：用“铺满底图 + 置底”方式替代
      const pres = this._pres;
      const pageW = pres.PageSetup.SlideWidth;
      const pageH = pres.PageSetup.SlideHeight;
      const tmpPath = this._writeTempImage(imageBase64, 'image/png');
      const shape = slide.Shapes.AddPicture(tmpPath, 0, -1, 0, 0, pageW, pageH);
      try {
        shape.ZOrder(1); // msoSendToBack = 1
      } catch {
        // ignore
      }
    }
  }

  async undo(): Promise<void> {
    try {
      Application.CommandBars.ExecuteMso('Undo');
    } catch {
      console.warn('[WpsJsaAdapter] undo() failed');
    }
  }

  async getSlideThumbnail(_index: number): Promise<string | null> {
    // WPS JSA 不直接支持缩略图导出，返回 null
    return null;
  }

  // ---- batch ----

  async executeBatch(operations: SlideOperation[]): Promise<OperationResult[]> {
    const results: OperationResult[] = [];
    for (const op of operations) {
      try {
        switch (op.action) {
          case 'callPlugin': {
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

  // ---- private ----

  private _findShapeById(slide: any, shapeId: string): any | null {
    for (let i = 1; i <= slide.Shapes.Count; i++) {
      const s = slide.Shapes.Item(i);
      if (String(s.Id) === shapeId || s.Name === shapeId) return s;
    }
    return null;
  }

  private _mapShapeType(wpsType: number): ShapeInfo['type'] {
    // WPS MsoShapeType 枚举
    const map: Record<number, ShapeInfo['type']> = {
      17: 'textBox',   // msoTextBox
      13: 'image',     // msoPicture
      19: 'table',     // msoTable
      3: 'chart',      // msoChart
      6: 'group',      // msoGroup
    };
    return map[wpsType] ?? 'shape';
  }

  private _applyTextStyle(font: any, style: TextStyle): void {
    if (style.fontSize) font.Size = style.fontSize;
    if (style.fontFamily) font.Name = style.fontFamily;
    if (style.bold !== undefined) font.Bold = style.bold ? -1 : 0;
    if (style.italic !== undefined) font.Italic = style.italic ? -1 : 0;
    if (style.underline !== undefined) font.Underline = style.underline ? 1 : 0;
    if (style.color) font.Color.RGB = this._hexToRgbInt(style.color);
  }

  private _extractTextStyle(shape: any): TextStyle | undefined {
    const font = shape.TextFrame?.TextRange?.Font;
    const paragraph = shape.TextFrame?.TextRange?.ParagraphFormat;
    const style: TextStyle = {
      fontSize: typeof font?.Size === 'number' ? font.Size : undefined,
      fontFamily: typeof font?.Name === 'string' ? font.Name : undefined,
      bold: typeof font?.Bold === 'number' ? font.Bold !== 0 : undefined,
      italic: typeof font?.Italic === 'number' ? font.Italic !== 0 : undefined,
      underline: typeof font?.Underline === 'number' ? font.Underline !== 0 : undefined,
      color: typeof font?.Color?.RGB === 'number' ? this._rgbIntToHex(font.Color.RGB) : undefined,
      lineSpacing: typeof paragraph?.SpaceWithin === 'number' ? paragraph.SpaceWithin : undefined,
    };
    const entries = Object.entries(style).filter(([, value]) => value !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) as TextStyle : undefined;
  }

  private _hexToRgbInt(hex: string): number {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    // WPS RGB 格式: B * 65536 + G * 256 + R (BGR)
    return b * 65536 + g * 256 + r;
  }

  private _rgbIntToHex(rgb: number): string {
    const r = rgb & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 16) & 0xff;
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }

  private _writeTempImage(base64: string, mimeType: string): string {
    const ext = mimeType.split('/')[1] ?? 'png';
    const tmpDir = Application.Env?.GetTempPath?.() ?? '/tmp';
    const path = `${tmpDir}/ai_ppt_${Date.now()}.${ext}`;

    // WPS JSA 的 FileSystem 写文件
    try {
      const fs = Application.FileSystem ?? (globalThis as any).FileSystem;
      if (fs?.writeFileSync) {
        const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        fs.writeFileSync(path, buffer);
      }
    } catch (err) {
      console.error('[WpsJsaAdapter] Failed to write temp image:', err);
    }

    return path;
  }
}
