import type { ISlideAdapter, SlideSnapshot, SlideSnapshotShape } from './interface';

function isRestorableShape(shape: SlideSnapshotShape): boolean {
  return Boolean(shape.text) || shape.type === 'textBox' || shape.type === 'shape';
}

export async function captureSlideSnapshot(
  adapter: ISlideAdapter,
  slideIndex: number,
): Promise<SlideSnapshot> {
  const presentation = await adapter.getPresentation();
  if (slideIndex < 0 || slideIndex >= presentation.slideCount) {
    return {
      slideIndex,
      existed: false,
      shapes: [],
      unsupportedShapeCount: 0,
    };
  }

  const slide = await adapter.getSlide(slideIndex);
  const shapes = slide.shapes
    .filter((shape) => isRestorableShape(shape))
    .map((shape) => ({
      name: shape.name,
      type: shape.type,
      text: shape.text,
      left: shape.left,
      top: shape.top,
      width: shape.width,
      height: shape.height,
      style: shape.style,
    }));

  return {
    slideIndex,
    existed: true,
    notes: slide.notes,
    backgroundColor: slide.backgroundColor,
    shapes,
    unsupportedShapeCount: Math.max(0, slide.shapes.length - shapes.length),
  };
}

export async function restoreSlideSnapshot(
  adapter: ISlideAdapter,
  snapshot: SlideSnapshot,
): Promise<void> {
  const presentation = await adapter.getPresentation();

  if (!snapshot.existed) {
    if (snapshot.slideIndex < presentation.slideCount) {
      await adapter.deleteSlide(snapshot.slideIndex);
    }
    return;
  }

  while ((await adapter.getPresentation()).slideCount <= snapshot.slideIndex) {
    const pres = await adapter.getPresentation();
    await adapter.addSlide(Math.max(-1, pres.slideCount - 1));
  }

  const current = await adapter.getSlide(snapshot.slideIndex);
  for (const shape of current.shapes) {
    await adapter.deleteShape(snapshot.slideIndex, shape.id);
  }

  if (snapshot.backgroundColor) {
    await adapter.setBackground(snapshot.slideIndex, snapshot.backgroundColor);
  }
  if (snapshot.notes !== undefined) {
    await adapter.setNotes(snapshot.slideIndex, snapshot.notes);
  }

  for (const shape of snapshot.shapes) {
    await adapter.insertTextBox({
      slideIndex: snapshot.slideIndex,
      text: shape.text ?? '',
      left: shape.left,
      top: shape.top,
      width: shape.width,
      height: shape.height,
      style: shape.style,
    });
  }
}
