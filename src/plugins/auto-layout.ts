import type { SlideOperation } from '../adapters/interface';
import type { PluginContext } from './registry';
import { computeLayout, type SlideLayoutNode } from './layout-engine';
import { fetchStockImageBase64 } from '../ai/image';

export async function renderLayoutToOperations(
  slideIndex: number,
  layout: SlideLayoutNode,
  ctx: PluginContext
): Promise<SlideOperation[]> {
  const w = ctx.slideWidth;
  const h = ctx.slideHeight;

  // Set default dimensions for root if not provided
  const root = {
    ...layout,
    width: layout.width ?? w,
    height: layout.height ?? h,
  };

  const renderedElements = computeLayout(root, 0, 0, w, h);
  const operations: SlideOperation[] = [];

  for (const el of renderedElements) {
    if (el.type === 'container' && el.node.style?.backgroundColor) {
      // If it's a full-screen or large background container, consider adding a smart overlay
      const isFullScreen = el.w >= w * 0.9 && el.h >= h * 0.9;
      // We check if it's explicitly marked as an overlay layer or just a normal container
      // For now, we just render the background
      operations.push({
        action: 'insertText',
        params: {
          slideIndex,
          text: '',
          left: el.x,
          top: el.y,
          width: el.w,
          height: el.h,
          style: { backgroundColor: el.node.style.backgroundColor }
        }
      });
      
      // If it's full screen and we need a dark overlay (mocking the background image overlay)
      // This is handled in registry.ts when a background image is set, but we can add a general mask here if needed.
    } else if (el.type === 'text' && el.node.text) {
      operations.push({
        action: 'insertText',
        params: {
          slideIndex,
          text: el.node.text,
          left: el.x,
          top: el.y,
          width: el.w,
          height: el.h,
          style: el.node.textStyle ?? ctx.theme.defaults.body,
        }
      });
    } else if (el.type === 'image' && el.node.imageKeyword) {
      try {
        const img = await fetchStockImageBase64(el.node.imageKeyword, Math.round(el.w), Math.round(el.h));
        operations.push({
          action: 'insertImage',
          params: {
            slideIndex,
            base64: img.base64,
            mimeType: img.mimeType,
            left: el.x,
            top: el.y,
            width: el.w,
            height: el.h,
          }
        });
      } catch (err) {
        console.error('Failed to fetch stock image:', err);
        // Fallback to a placeholder text box
        operations.push({
          action: 'insertText',
          params: {
            slideIndex,
            text: `[图片: ${el.node.imageKeyword}]`,
            left: el.x,
            top: el.y,
            width: el.w,
            height: el.h,
            style: { backgroundColor: '#E2E8F0', alignment: 'center', color: '#64748B' }
          }
        });
      }
    }
  }

  return operations;
}
