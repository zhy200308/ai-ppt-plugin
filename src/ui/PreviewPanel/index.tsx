// ============================================================
//  PreviewPanel — Web 形态所见即所得预览/编辑区
//  - 点击选中 shape（同步到 selection）
//  - 拖拽移动 shape（updateGeometry）
//  - 双击编辑文本（updateText）
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { adapterRef } from '../App';
import type { ShapeInfo, SlideOperation } from '../../adapters/interface';
import { generateWordArtSvg, svgToPngBase64 } from '../../ai/wordart';
import { loadWordArtAsset, saveWordArtAsset } from '../../skills/builtins/wordart_store';
import { resolveTheme } from '../../themes';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function PreviewPanel() {
  const pptInfo = useStore((s) => s.pptInfo);
  const currentSlide = useStore((s) => s.currentSlide);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const setCurrentSlide = useStore((s) => s.setCurrentSlide);
  const setPptInfo = useStore((s) => s.setPptInfo);
  const styleProfile = useStore((s) => s.styleProfile);

  const slideWidth = pptInfo?.slideWidth ?? 960;
  const slideHeight = pptInfo?.slideHeight ?? 540;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // 文本编辑态
  const [editing, setEditing] = useState<{
    shapeId: string;
    value: string;
  } | null>(null);

  const [wordart, setWordart] = useState<{
    shapeId: string;
    assetId: string;
    text: string;
    loading: boolean;
    error?: string;
  } | null>(null);

  const [styleKit, setStyleKit] = useState<null | {
    shapeId: string;
    fontSize?: number;
    color?: string;
    alignment?: 'left' | 'center' | 'right';
    bold?: boolean;
    backgroundColor?: string;
  }>(null);

  // 拖拽态
  const dragRef = useRef<{
    shapeId: string;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);

  const selectedId = selection?.hasSelection ? selection.shapeIds[0] : null;

  const shapes = currentSlide?.shapes ?? [];

  const shapeMap = useMemo(() => {
    return new Map(shapes.map((s) => [s.id, s]));
  }, [shapes]);

  // 选中 WordArt 时加载资产
  useEffect(() => {
    const shape = selectedId ? shapeMap.get(selectedId) : undefined;
    const name = shape?.name ?? '';
    if (!shape || shape.type !== 'image' || !name.startsWith('wordart:')) {
      setWordart(null);
      return;
    }
    const assetId = name.slice('wordart:'.length).trim();
    if (!assetId) {
      setWordart(null);
      return;
    }

    setWordart({ shapeId: shape.id, assetId, text: '', loading: true });
    void (async () => {
      const asset = await loadWordArtAsset(assetId);
      setWordart((prev) => prev && prev.assetId === assetId
        ? { ...prev, text: asset?.text ?? '', loading: false, error: asset ? undefined : '未找到艺术字资产' }
        : prev);
    })();
  }, [selectedId, shapeMap]);

  // 选中文本形状时，初始化“编辑套件”面板
  useEffect(() => {
    const shape = selectedId ? shapeMap.get(selectedId) : undefined;
    if (!shape || !shape.text) {
      setStyleKit(null);
      return;
    }
    const st = shape.style ?? {};
    setStyleKit({
      shapeId: shape.id,
      fontSize: st.fontSize,
      color: st.color,
      alignment: st.alignment,
      bold: st.bold,
      backgroundColor: st.backgroundColor,
    });
  }, [selectedId, shapeMap]);

  // 计算缩放（适应右侧容器宽度）
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      // 留出一点 padding
      const next = w > 0 ? (w - 24) / slideWidth : 1;
      setScale(clamp(next, 0.25, 2));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [slideWidth]);

  const syncContext = useCallback(async () => {
    if (!adapterRef.current) return;
    const [pres, slide, sel] = await Promise.all([
      adapterRef.current.getPresentation(),
      adapterRef.current.getCurrentSlide(),
      adapterRef.current.getSelection(),
    ]);
    setPptInfo(pres);
    setCurrentSlide(slide);
    setSelection(sel);
  }, [setCurrentSlide, setPptInfo, setSelection]);

  const selectShape = useCallback((shape: ShapeInfo) => {
    // Web 适配器可同步 selection；插件模式下这里仅更新 store（不影响 PPT 内实际选中）
    try {
      (adapterRef.current as any)?.setSelection?.([shape.id]);
    } catch { /* ignore */ }

    setSelection({
      slideIndex: currentSlide?.index ?? 0,
      shapeIds: [shape.id],
      shapes: [shape],
      hasSelection: true,
    });
  }, [currentSlide?.index, setSelection]);

  const clearSelection = useCallback(() => {
    try {
      (adapterRef.current as any)?.setSelection?.([]);
    } catch { /* ignore */ }
    setSelection({
      slideIndex: currentSlide?.index ?? 0,
      shapeIds: [],
      shapes: [],
      hasSelection: false,
    });
  }, [currentSlide?.index, setSelection]);

  const applyOp = useCallback(async (op: SlideOperation) => {
    if (!adapterRef.current) return;
    await adapterRef.current.executeBatch([op]);
    await syncContext();
  }, [syncContext]);

  const applyOps = useCallback(async (ops: SlideOperation[]) => {
    if (!adapterRef.current) return;
    await adapterRef.current.executeBatch(ops);
    await syncContext();
  }, [syncContext]);

  const beginDrag = useCallback((e: React.PointerEvent, shape: ShapeInfo) => {
    if (!currentSlide) return;
    // 只允许拖拽非图片/非 group（先做最小可用：文本框/形状）
    if (shape.type === 'group') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      shapeId: shape.id,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: shape.left,
      originTop: shape.top,
    };
  }, [currentSlide]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !currentSlide) return;
    const d = dragRef.current;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;

    const shape = shapeMap.get(d.shapeId);
    if (!shape) return;

    // 视觉跟随：直接更新 store 当前页（避免拖动时频繁 executeBatch）
    const nextLeft = Math.round(d.originLeft + dx);
    const nextTop = Math.round(d.originTop + dy);

    setCurrentSlide({
      ...currentSlide,
      shapes: currentSlide.shapes.map((s) => s.id === d.shapeId ? { ...s, left: nextLeft, top: nextTop } : s),
    });
  }, [currentSlide, scale, shapeMap, setCurrentSlide]);

  const endDrag = useCallback(async () => {
    if (!dragRef.current || !currentSlide) return;
    const d = dragRef.current;
    dragRef.current = null;

    const shape = currentSlide.shapes.find((s) => s.id === d.shapeId);
    if (!shape) return;

    await applyOp({
      action: 'updateGeometry',
      slideIndex: currentSlide.index,
      shapeId: shape.id,
      left: shape.left,
      top: shape.top,
      width: shape.width,
      height: shape.height,
    });
  }, [applyOp, currentSlide]);

  const startEdit = useCallback((shape: ShapeInfo) => {
    if (!shape.text) return;
    setEditing({ shapeId: shape.id, value: shape.text });
  }, []);

  const commitEdit = useCallback(async () => {
    if (!editing || !currentSlide) return;
    const shape = currentSlide.shapes.find((s) => s.id === editing.shapeId);
    if (!shape) return;

    await applyOp({
      action: 'updateText',
      slideIndex: currentSlide.index,
      shapeId: shape.id,
      text: editing.value,
      style: shape.style,
    });
    setEditing(null);
  }, [applyOp, currentSlide, editing]);

  const cancelEdit = useCallback(() => setEditing(null), []);

  const applyStyleKit = useCallback(async () => {
    if (!styleKit || !currentSlide) return;
    const shape = currentSlide.shapes.find((s) => s.id === styleKit.shapeId);
    if (!shape || !shape.text) return;

    await applyOp({
      action: 'updateText',
      slideIndex: currentSlide.index,
      shapeId: shape.id,
      text: shape.text,
      style: {
        ...(shape.style ?? {}),
        fontSize: styleKit.fontSize,
        color: styleKit.color,
        alignment: styleKit.alignment,
        bold: styleKit.bold,
        backgroundColor: styleKit.backgroundColor,
      },
    });
  }, [applyOp, currentSlide, styleKit]);

  const regenerateWordart = useCallback(async () => {
    if (!wordart || !currentSlide) return;
    const shape = currentSlide.shapes.find((s) => s.id === wordart.shapeId);
    if (!shape) return;
    const text = wordart.text.trim();
    if (!text) return;

    setWordart((prev) => prev ? { ...prev, loading: true, error: undefined } : prev);
    try {
      const theme = resolveTheme(styleProfile.themeSpec);
      const width = Math.round(Math.max(600, shape.width * 2));
      const height = Math.round(Math.max(200, shape.height * 2));
      const svg = generateWordArtSvg({
        text,
        width,
        height,
        style: {
          primaryColor: theme.primaryColor,
          accentColor: theme.accentColor,
          fontFamily: theme.fontFamily,
        },
      });
      const pngBase64 = await svgToPngBase64(svg, width, height);
      await saveWordArtAsset({
        id: wordart.assetId,
        text,
        svg,
        pngBase64,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await applyOps([{
        action: 'replaceImage',
        slideIndex: currentSlide.index,
        shapeId: shape.id,
        base64: pngBase64,
        mimeType: 'image/png',
        name: `wordart:${wordart.assetId}`,
      }]);
      setWordart((prev) => prev ? { ...prev, loading: false, error: undefined } : prev);
    } catch (e: any) {
      setWordart((prev) => prev ? { ...prev, loading: false, error: e?.message ?? String(e) } : prev);
    }
  }, [applyOps, currentSlide, styleProfile.themeSpec, wordart]);

  if (!pptInfo || !currentSlide) {
    return (
      <div className="preview-panel">
        <div className="preview-header">
          <div className="preview-title">预览</div>
        </div>
        <div className="preview-empty">暂无可预览内容</div>
      </div>
    );
  }

  const scaledW = Math.round(slideWidth * scale);
  const scaledH = Math.round(slideHeight * scale);

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <div className="preview-title">预览（可编辑）</div>
        <div className="preview-sub">
          第 {currentSlide.index + 1} 页 · {shapes.length} 元素 · {Math.round(scale * 100)}%
        </div>
        <div style={{ flex: 1 }} />
        {selectedId && (
          <button className="btn-sm btn-ghost" onClick={clearSelection}>取消选中</button>
        )}
        <button className="btn-sm btn-ghost" onClick={syncContext}>刷新</button>
      </div>

      {wordart && (
        <div className="preview-footer" style={{ borderTop: 'none', borderBottom: '1px solid rgba(229,231,235,0.8)' }}>
          <div className="preview-hint" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong>艺术字编辑</strong>
            <input
              className="clarify-answer"
              style={{ maxWidth: 420 }}
              value={wordart.text}
              disabled={wordart.loading}
              onChange={(e) => setWordart((prev) => prev ? { ...prev, text: e.target.value } : prev)}
              placeholder="输入艺术字文本"
            />
            <button className="btn-sm btn-primary" onClick={() => void regenerateWordart()} disabled={wordart.loading || !wordart.text.trim()}>
              {wordart.loading ? '生成中...' : '重新生成并替换'}
            </button>
            {wordart.error && <span style={{ color: '#ef4444' }}>{wordart.error}</span>}
          </div>
        </div>
      )}

      {styleKit && (
        <div className="preview-footer" style={{ borderTop: 'none', borderBottom: '1px solid rgba(229,231,235,0.8)' }}>
          <div className="preview-hint" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong>编辑套件</strong>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              字号
              <input
                type="number"
                min={8}
                max={96}
                value={styleKit.fontSize ?? ''}
                onChange={(e) => setStyleKit((p) => p ? ({ ...p, fontSize: Number(e.target.value) || undefined }) : p)}
                style={{ width: 74 }}
              />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              颜色
              <input
                type="text"
                value={styleKit.color ?? ''}
                onChange={(e) => setStyleKit((p) => p ? ({ ...p, color: e.target.value || undefined }) : p)}
                placeholder="#0F4C81"
                style={{ width: 96 }}
              />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              对齐
              <select
                value={styleKit.alignment ?? 'left'}
                onChange={(e) => setStyleKit((p) => p ? ({ ...p, alignment: e.target.value as any }) : p)}
              >
                <option value="left">左</option>
                <option value="center">中</option>
                <option value="right">右</option>
              </select>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={Boolean(styleKit.bold)}
                onChange={(e) => setStyleKit((p) => p ? ({ ...p, bold: e.target.checked }) : p)}
              />
              加粗
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              背景
              <input
                type="text"
                value={styleKit.backgroundColor ?? ''}
                onChange={(e) => setStyleKit((p) => p ? ({ ...p, backgroundColor: e.target.value || undefined }) : p)}
                placeholder="#FFFFFF"
                style={{ width: 96 }}
              />
            </label>
            <button className="btn-sm btn-primary" onClick={() => void applyStyleKit()}>
              应用样式
            </button>
          </div>
        </div>
      )}

      <div className="preview-stage" ref={stageRef}>
        <div
          className="preview-slide"
          style={{
            width: scaledW,
            height: scaledH,
            background: (currentSlide as any).backgroundColor ?? '#FFFFFF',
          }}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={(e) => {
            // 指针离开也结束拖拽，避免卡死
            if (dragRef.current) void endDrag();
            // 防止误触发
            if ((e.target as HTMLElement).classList.contains('preview-slide')) {
              // nothing
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) clearSelection();
          }}
        >
          {shapes.map((shape) => {
            const isSelected = selectedId === shape.id;
            const isEditing = editing?.shapeId === shape.id;

            const left = Math.round(shape.left * scale);
            const top = Math.round(shape.top * scale);
            const width = Math.max(1, Math.round(shape.width * scale));
            const height = Math.max(1, Math.round(shape.height * scale));

            const style = shape.style ?? {};
            const fontSize = (style.fontSize ?? 18) * scale;

            return (
              <div
                key={shape.id}
                className={`preview-shape ${isSelected ? 'selected' : ''}`}
                style={{
                  left,
                  top,
                  width,
                  height,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  selectShape(shape);
                  beginDrag(e, shape);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  selectShape(shape);
                  if (shape.text) startEdit(shape);
                }}
                title={`id=${shape.id}`}
              >
                {/* 图片 */}
                {shape.type === 'image' && (
                  (shape as any)._imageDataUri ? (
                    <img
                      src={(shape as any)._imageDataUri ?? ''}
                      alt={shape.name ?? 'image'}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6 }}
                      draggable={false}
                    />
                  ) : (
                    <div className="preview-image-placeholder">
                      <div style={{ fontSize: 12, color: '#6b7280' }}>Image</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{shape.name || shape.id}</div>
                    </div>
                  )
                )}
                {/* 文本 */}
                {shape.text && !isEditing && (
                  <div
                    className="preview-text"
                    style={{
                      fontFamily: style.fontFamily,
                      fontSize,
                      fontWeight: style.bold ? 700 : 400,
                      fontStyle: style.italic ? 'italic' : 'normal',
                      textDecoration: style.underline ? 'underline' : 'none',
                      color: style.color ?? '#111827',
                      textAlign: style.alignment ?? 'left',
                      lineHeight: style.lineSpacing ? String(style.lineSpacing) : '1.2',
                      padding: 6 * scale,
                      whiteSpace: 'pre-wrap',
                      overflow: 'hidden',
                    }}
                  >
                    {shape.text}
                  </div>
                )}

                {/* 编辑器 */}
                {shape.text && isEditing && (
                  <textarea
                    className="preview-editor"
                    value={editing?.value ?? ''}
                    onChange={(ev) => setEditing((prev) => prev ? { ...prev, value: ev.target.value } : prev)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Escape') {
                        ev.preventDefault();
                        cancelEdit();
                      }
                      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
                        ev.preventDefault();
                        void commitEdit();
                      }
                    }}
                    onBlur={() => { void commitEdit(); }}
                    style={{
                      fontFamily: style.fontFamily,
                      fontSize,
                      fontWeight: style.bold ? 700 : 400,
                      fontStyle: style.italic ? 'italic' : 'normal',
                      color: style.color ?? '#111827',
                      textAlign: style.alignment ?? 'left',
                      lineHeight: style.lineSpacing ? String(style.lineSpacing) : '1.2',
                      padding: 6 * scale,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="preview-footer">
        <div className="preview-hint">
          操作提示：单击选中｜拖拽移动｜双击编辑文本（Ctrl/⌘+Enter 提交，Esc 取消）
        </div>
      </div>
    </div>
  );
}
