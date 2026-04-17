// ============================================================
//  OutlinePanel — 页面/元素大纲（主要用于 Web 模式的“选中/定位”）
// ============================================================

import React, { useCallback } from 'react';
import { useStore } from '../../store';
import { adapterRef } from '../App';
import type { SlideInfo } from '../../adapters/interface';

function getSlideTitle(slide: SlideInfo): string {
  const firstText = slide.shapes.find((s) => s.text && s.text.trim());
  return firstText?.text?.trim().slice(0, 40) ?? '(无文本)';
}

export function OutlinePanel() {
  const pptInfo = useStore((s) => s.pptInfo);
  const activeSlideIndex = useStore((s) => s.activeSlideIndex);
  const setActiveSlideIndex = useStore((s) => s.setActiveSlideIndex);
  const currentSlide = useStore((s) => s.currentSlide);
  const setCurrentSlide = useStore((s) => s.setCurrentSlide);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);

  const refresh = useCallback(async () => {
    if (!adapterRef.current) return;
    const [pres, slide, sel] = await Promise.all([
      adapterRef.current.getPresentation(),
      adapterRef.current.getCurrentSlide(),
      adapterRef.current.getSelection(),
    ]);
    useStore.getState().setPptInfo(pres);
    setCurrentSlide(slide);
    setActiveSlideIndex(slide.index);
    setSelection(sel);
  }, [setActiveSlideIndex, setCurrentSlide, setSelection]);

  const handleSelectSlide = useCallback(async (idx: number) => {
    if (!adapterRef.current) return;
    try {
      (adapterRef.current as any)?.setActiveSlideIndex?.(idx);
    } catch {
      // ignore
    }
    const slide = await adapterRef.current.getSlide(idx);
    setCurrentSlide(slide);
    setActiveSlideIndex(idx);
    setSelection({
      slideIndex: idx,
      shapeIds: [],
      shapes: [],
      hasSelection: false,
    });
  }, [setActiveSlideIndex, setCurrentSlide, setSelection]);

  const handleSelectShape = useCallback((shapeId: string) => {
    if (!currentSlide) return;
    const shape = currentSlide.shapes.find((s) => s.id === shapeId);
    if (!shape) return;

    try {
      (adapterRef.current as any)?.setSelection?.([shapeId]);
    } catch {
      // ignore
    }

    setSelection({
      slideIndex: currentSlide.index,
      shapeIds: [shapeId],
      shapes: [shape],
      hasSelection: true,
    });
  }, [currentSlide, setSelection]);

  if (!pptInfo) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 10, fontWeight: 600 }}>页面大纲</div>
        <div style={{ color: '#6B7280' }}>PPT 尚未加载</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ fontWeight: 600 }}>页面大纲</div>
        <div style={{ color: '#6B7280' }}>{pptInfo.slideCount} 页</div>
        <div style={{ flex: 1 }} />
        <button className="btn-sm btn-ghost" onClick={refresh}>刷新</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
        {pptInfo.slides.map((s) => (
          <button
            key={s.id}
            className={`quick-action-btn ${s.index === activeSlideIndex ? 'active' : ''}`}
            style={{ justifyContent: 'flex-start' }}
            onClick={() => handleSelectSlide(s.index)}
          >
            <span style={{ width: 58, fontVariantNumeric: 'tabular-nums', color: '#6B7280' }}>
              第 {s.index + 1} 页
            </span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {getSlideTitle(s)}
            </span>
          </button>
        ))}
      </div>

      {currentSlide && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>当前页元素</div>
            <div style={{ color: '#6B7280' }}>第 {currentSlide.index + 1} 页</div>
            {selection?.hasSelection && (
              <div style={{ color: '#6B7280' }}>已选中 1 项</div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
            {currentSlide.shapes.map((shape) => {
              const selected = selection?.hasSelection && selection.shapeIds.includes(shape.id);
              return (
                <button
                  key={shape.id}
                  className="quick-action-btn"
                  style={{
                    justifyContent: 'flex-start',
                    background: selected ? 'rgba(59,130,246,0.12)' : undefined,
                  }}
                  onClick={() => handleSelectShape(shape.id)}
                  title={`id=${shape.id}`}
                >
                  <span style={{ width: 86, color: '#6B7280' }}>{shape.type}</span>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {(shape.text ?? '').trim().slice(0, 60) || shape.name || '(无文本)'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

