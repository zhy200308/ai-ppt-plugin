import type { SlideOperation, TextStyle } from '../adapters/interface';
import type { PluginContext } from './registry';

// ============================================================
//  Dynamic Elastic Layout Engine (Flexbox for PPT)
// ============================================================

export type FlexDirection = 'row' | 'column';
export type FlexJustify = 'flex-start' | 'center' | 'flex-end' | 'space-between';
export type FlexAlign = 'flex-start' | 'center' | 'flex-end' | 'stretch';

export type BoxStyle = {
  padding?: [number, number, number, number]; // [top, right, bottom, left]
  margin?: [number, number, number, number];
  backgroundColor?: string;
  borderRadius?: number; // Only visual if shape supports it
};

export interface SlideLayoutNode {
  type: 'container' | 'text' | 'image' | 'shape';
  
  // Flex properties (for container)
  direction?: FlexDirection;
  justifyContent?: FlexJustify;
  alignItems?: FlexAlign;
  gap?: number;
  padding?: [number, number, number, number]; // Added for template convenience
  
  // Sizing
  width?: number | string;  // e.g. 200, "50%", "100%"
  height?: number | string;
  flex?: number;            // proportion of remaining space
  
  // Styling
  style?: BoxStyle;
  
  // Content
  text?: string;
  textStyle?: TextStyle;
  imageKeyword?: string;    // Will trigger Unsplash image fetch
  
  children?: SlideLayoutNode[];
}

export interface RenderedElement {
  type: 'text' | 'image' | 'shape' | 'container';
  x: number;
  y: number;
  w: number;
  h: number;
  node: SlideLayoutNode;
}

function parseSize(size: number | string | undefined, parentSize: number): number | undefined {
  if (size === undefined) return undefined;
  if (typeof size === 'number') return size;
  if (typeof size === 'string' && size.endsWith('%')) {
    const val = parseFloat(size.replace('%', ''));
    if (!isNaN(val)) return (val / 100) * parentSize;
  }
  return undefined;
}

/**
 * Simplified 1-pass top-down layout calculation.
 * Computes absolute coordinates for all elements in the tree.
 */
export function computeLayout(
  node: SlideLayoutNode,
  x: number,
  y: number,
  w: number,
  h: number
): RenderedElement[] {
  const results: RenderedElement[] = [];
  
  const margin = node.style?.margin ?? [0, 0, 0, 0];
  const padding = node.padding ?? node.style?.padding ?? [0, 0, 0, 0];
  
  // Apply margin
  const outerX = x;
  const outerY = y;
  const outerW = w;
  const outerH = h;
  
  const innerX = outerX + margin[3];
  const innerY = outerY + margin[0];
  const innerW = Math.max(0, outerW - margin[1] - margin[3]);
  const innerH = Math.max(0, outerH - margin[0] - margin[2]);
  
  // Calculate this node's explicit size if any
  let nodeW = parseSize(node.width, innerW) ?? innerW;
  let nodeH = parseSize(node.height, innerH) ?? innerH;
  
  // The content box (inside padding)
  const contentX = innerX + padding[3];
  const contentY = innerY + padding[0];
  const contentW = Math.max(0, nodeW - padding[1] - padding[3]);
  const contentH = Math.max(0, nodeH - padding[0] - padding[2]);
  
  // Add self to results if it's a renderable element (or has background)
  if (node.type !== 'container' || node.style?.backgroundColor) {
    let finalNode = node;
    
    // Auto-fit text size if it's a text node and font size is not explicitly fixed
    if (node.type === 'text' && node.text && node.textStyle && !node.textStyle.fontSize) {
      // Very basic heuristic for PPT: 
      // Area = width * height. Approx char area = fontSize^2.
      // charCount * fontSize^2 * lineSpacing ≈ width * height * 0.8
      const charCount = node.text.length || 1;
      const lineSpacing = node.textStyle.lineSpacing ?? 1.2;
      const availableArea = nodeW * nodeH * 0.8;
      let optimalSize = Math.sqrt(availableArea / (charCount * lineSpacing));
      
      // Clamp size
      optimalSize = Math.max(12, Math.min(60, Math.floor(optimalSize)));
      
      finalNode = {
        ...node,
        textStyle: {
          ...node.textStyle,
          fontSize: optimalSize
        }
      };
    }

    results.push({
      type: node.type,
      x: innerX,
      y: innerY,
      w: nodeW,
      h: nodeH,
      node: finalNode
    });
  }
  
  if (!node.children || node.children.length === 0) {
    return results;
  }
  
  // Layout children
  const isRow = node.direction === 'row';
  const gap = node.gap ?? 0;
  
  // 1. First pass: compute fixed sizes and flex total
  let totalFixedMainSize = 0;
  let totalFlex = 0;
  
  const childSizes = node.children.map(child => {
    let mainSize = 0;
    if (isRow) {
      mainSize = parseSize(child.width, contentW) ?? 0;
    } else {
      mainSize = parseSize(child.height, contentH) ?? 0;
    }
    
    // Include margins in fixed size
    const cm = child.style?.margin ?? [0, 0, 0, 0];
    const mainMargin = isRow ? (cm[1] + cm[3]) : (cm[0] + cm[2]);
    
    if (child.flex) {
      totalFlex += child.flex;
    } else {
      totalFixedMainSize += mainSize + mainMargin;
    }
    return { mainSize, flex: child.flex ?? 0, margin: cm };
  });
  
  // Include gaps in fixed size
  totalFixedMainSize += Math.max(0, node.children.length - 1) * gap;
  
  // 2. Distribute remaining space
  const mainContainerSize = isRow ? contentW : contentH;
  const remainingMainSize = Math.max(0, mainContainerSize - totalFixedMainSize);
  
  let currentMainPos = 0;
  
  // Handle justify-content
  let spacing = gap;
  if (totalFlex === 0 && remainingMainSize > 0) {
    const jc = node.justifyContent ?? 'flex-start';
    if (jc === 'center') {
      currentMainPos = remainingMainSize / 2;
    } else if (jc === 'flex-end') {
      currentMainPos = remainingMainSize;
    } else if (jc === 'space-between') {
      spacing = gap + remainingMainSize / Math.max(1, node.children.length - 1);
    }
  }
  
  // 3. Second pass: position and render children
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const cm = childSizes[i].margin;
    
    // Calculate actual main size
    let actualMainSize = childSizes[i].mainSize;
    if (childSizes[i].flex > 0) {
      actualMainSize = (childSizes[i].flex / totalFlex) * remainingMainSize;
    }
    
    // Calculate cross size and position
    const crossContainerSize = isRow ? contentH : contentW;
    const alignItems = node.alignItems ?? 'flex-start';
    
    let actualCrossSize = isRow 
      ? (parseSize(child.height, crossContainerSize) ?? crossContainerSize - cm[0] - cm[2])
      : (parseSize(child.width, crossContainerSize) ?? crossContainerSize - cm[1] - cm[3]);
      
    if (alignItems === 'stretch' && !child.flex && (isRow ? !child.height : !child.width)) {
      actualCrossSize = crossContainerSize - (isRow ? (cm[0] + cm[2]) : (cm[1] + cm[3]));
    }
    
    let currentCrossPos = isRow ? cm[0] : cm[3];
    if (alignItems === 'center') {
      currentCrossPos = (crossContainerSize - actualCrossSize) / 2;
    } else if (alignItems === 'flex-end') {
      currentCrossPos = crossContainerSize - actualCrossSize - (isRow ? cm[2] : cm[1]);
    }
    
    // Determine child's bounding box
    let cx = 0, cy = 0, cw = 0, ch = 0;
    
    if (isRow) {
      cx = contentX + currentMainPos + cm[3];
      cy = contentY + currentCrossPos;
      cw = actualMainSize;
      ch = actualCrossSize;
      currentMainPos += actualMainSize + cm[1] + cm[3] + spacing;
    } else {
      cx = contentX + currentCrossPos;
      cy = contentY + currentMainPos + cm[0];
      cw = actualCrossSize;
      ch = actualMainSize;
      currentMainPos += actualMainSize + cm[0] + cm[2] + spacing;
    }
    
    // Recursively layout child
    const childResults = computeLayout(child, cx, cy, cw, ch);
    results.push(...childResults);
  }
  
  return results;
}
