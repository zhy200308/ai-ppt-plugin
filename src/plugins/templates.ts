import type { SlideLayoutNode } from './layout-engine';

export function createCoverTemplate(
  title: string,
  subtitle?: string,
  author?: string,
  date?: string
): SlideLayoutNode {
  return {
    type: 'container',
    direction: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 30,
    padding: [50, 50, 50, 50],
    children: [
      {
        type: 'text',
        text: title,
        textStyle: { fontSize: 44, bold: true, alignment: 'center' },
        width: '90%',
      },
      ...(subtitle ? [{
        type: 'text',
        text: subtitle,
        textStyle: { fontSize: 24, alignment: 'center' },
        width: '80%',
      } as SlideLayoutNode] : []),
      ...(author || date ? [{
        type: 'container',
        direction: 'row',
        justifyContent: 'center',
        gap: 20,
        children: [
          ...(author ? [{ type: 'text', text: author, textStyle: { fontSize: 16 } } as SlideLayoutNode] : []),
          ...(date ? [{ type: 'text', text: date, textStyle: { fontSize: 16 } } as SlideLayoutNode] : []),
        ],
      } as SlideLayoutNode] : []),
    ],
  };
}

export function createTwoColumnTemplate(
  title: string,
  leftContent: string,
  rightContent: string,
  imageKeyword?: string
): SlideLayoutNode {
  return {
    type: 'container',
    direction: 'column',
    padding: [40, 50, 40, 50],
    gap: 30,
    children: [
      {
        type: 'text',
        text: title,
        height: 60,
        textStyle: { fontSize: 36, bold: true },
      },
      {
        type: 'container',
        direction: 'row',
        flex: 1,
        gap: 40,
        children: [
          {
            type: 'text',
            text: leftContent,
            flex: 1,
            textStyle: { fontSize: 18, lineSpacing: 1.5 },
          },
          imageKeyword ? {
            type: 'image',
            imageKeyword,
            flex: 1,
          } : {
            type: 'text',
            text: rightContent,
            flex: 1,
            textStyle: { fontSize: 18, lineSpacing: 1.5 },
          },
        ],
      },
    ],
  };
}

export function createImageTextTemplate(
  title: string,
  content: string,
  imageKeyword: string,
  imagePosition: 'left' | 'right' = 'left'
): SlideLayoutNode {
  const imgNode: SlideLayoutNode = { type: 'image', imageKeyword, flex: 1 };
  const textNode: SlideLayoutNode = {
    type: 'container',
    direction: 'column',
    flex: 1,
    justifyContent: 'center',
    gap: 20,
    children: [
      { type: 'text', text: title, textStyle: { fontSize: 32, bold: true } },
      { type: 'text', text: content, textStyle: { fontSize: 18, lineSpacing: 1.5 } },
    ],
  };

  return {
    type: 'container',
    direction: 'row',
    padding: [50, 50, 50, 50],
    gap: 40,
    alignItems: 'center',
    children: imagePosition === 'left' ? [imgNode, textNode] : [textNode, imgNode],
  };
}

export function createBigNumberTemplate(
  number: string,
  title: string,
  subtitle?: string
): SlideLayoutNode {
  return {
    type: 'container',
    direction: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: [50, 50, 50, 50],
    gap: 20,
    children: [
      { type: 'text', text: number, textStyle: { fontSize: 120, bold: true, alignment: 'center' } },
      { type: 'text', text: title, textStyle: { fontSize: 32, bold: true, alignment: 'center' } },
      ...(subtitle ? [{ type: 'text', text: subtitle, textStyle: { fontSize: 20, alignment: 'center' } } as SlideLayoutNode] : []),
    ],
  };
}

export function createGrid4Template(
  title: string,
  items: Array<{ title: string; content: string }>
): SlideLayoutNode {
  const createCell = (item?: { title: string; content: string }): SlideLayoutNode => {
    if (!item) return { type: 'container', flex: 1 };
    return {
      type: 'container',
      direction: 'column',
      flex: 1,
      gap: 10,
      padding: [20, 20, 20, 20],
      style: { backgroundColor: '#F9FAFB' },
      children: [
        { type: 'text', text: item.title, textStyle: { fontSize: 20, bold: true } },
        { type: 'text', text: item.content, textStyle: { fontSize: 14, lineSpacing: 1.4 } },
      ],
    };
  };

  return {
    type: 'container',
    direction: 'column',
    padding: [40, 50, 40, 50],
    gap: 30,
    children: [
      { type: 'text', text: title, height: 60, textStyle: { fontSize: 36, bold: true } },
      {
        type: 'container',
        direction: 'row',
        flex: 1,
        gap: 20,
        children: [createCell(items[0]), createCell(items[1])],
      },
      {
        type: 'container',
        direction: 'row',
        flex: 1,
        gap: 20,
        children: [createCell(items[2]), createCell(items[3])],
      },
    ],
  };
}
