// ============================================================
//  宿主环境检测 & 适配器工厂
// ============================================================

import type { ISlideAdapter } from './interface';
import { OfficeJsAdapter } from './officejs';
import { WpsJsaAdapter } from './wpsjsa';
import { WebPptxAdapter } from './webpptx';

export type HostType = 'powerpoint' | 'wps' | 'web' | 'unknown';

/** 检测当前运行在哪个宿主应用中 */
export function detectHost(): HostType {
  // Office.js 环境检测
  if (typeof (globalThis as any).Office !== 'undefined') {
    return 'powerpoint';
  }

  // WPS JSA 环境检测
  if (typeof (globalThis as any).Application !== 'undefined') {
    const app = (globalThis as any).Application;
    if (app.Name?.includes?.('WPS') || app.Build) {
      return 'wps';
    }
  }

  // 默认：普通浏览器环境（用于独立 Web 应用生成/导出 PPTX）
  return 'web';
}

/** 创建对应宿主的适配器实例 */
export function createAdapter(host?: HostType): ISlideAdapter {
  const detectedHost = host ?? detectHost();

  switch (detectedHost) {
    case 'powerpoint':
      return new OfficeJsAdapter();
    case 'wps':
      return new WpsJsaAdapter();
    case 'web':
      return new WebPptxAdapter();
    default:
      // 开发环境 fallback：返回一个 mock 适配器
      console.warn('[createAdapter] Unknown host, using mock adapter');
      return new MockAdapter();
  }
}

// ---- 开发用 Mock 适配器 ----

class MockAdapter implements ISlideAdapter {
  readonly name = 'officejs' as const;

  async init() { console.log('[MockAdapter] init()'); }

  async getPresentation() {
    return {
      title: 'Mock Presentation',
      slideCount: 3,
      slideWidth: 960,
      slideHeight: 540,
      slides: [
        { index: 0, id: 's1', shapes: [
          { id: 'title1', name: 'Title', type: 'textBox' as const, text: '欢迎使用 AI PPT 插件', left: 60, top: 40, width: 840, height: 80 },
          { id: 'body1',  name: 'Body',  type: 'textBox' as const, text: '这是一个演示文稿的示例内容。', left: 60, top: 160, width: 840, height: 300 },
        ]},
        { index: 1, id: 's2', shapes: [
          { id: 'title2', name: 'Title', type: 'textBox' as const, text: '第二页标题', left: 60, top: 40, width: 840, height: 80 },
        ]},
        { index: 2, id: 's3', shapes: [
          { id: 'title3', name: 'Title', type: 'textBox' as const, text: '谢谢观看', left: 200, top: 200, width: 560, height: 100 },
        ]},
      ],
    };
  }

  async getSlide(index: number) {
    const pres = await this.getPresentation();
    return pres.slides[index] ?? pres.slides[0];
  }

  async getActiveSlideIndex() { return 0; }

  async getCurrentSlide() {
    const pres = await this.getPresentation();
    return pres.slides[0];
  }

  async getSelection() {
    return {
      slideIndex: 0,
      shapeIds: ['title1'],
      shapes: [
        { id: 'title1', name: 'Title', type: 'textBox' as const, text: '欢迎使用 AI PPT 插件', left: 60, top: 40, width: 840, height: 80 },
      ],
      hasSelection: true,
    };
  }
  async updateShapeText() {}
  async insertTextBox() { return 'mock-shape-id'; }
  async insertImage() { return 'mock-image-id'; }
  async deleteShape() {}
  async addSlide() { return 3; }
  async deleteSlide() {}
  async reorderSlide() {}
  async setNotes() {}
  async setBackground() {}
  async undo() {}
  async getSlideThumbnail() { return null; }

  async executeBatch(ops: any[]) {
    return ops.map((op: any) => ({ success: true, operation: op }));
  }
}

export { OfficeJsAdapter, WpsJsaAdapter, WebPptxAdapter };
