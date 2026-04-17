// ============================================================
//  OutlinePanel — 块级协同大纲编辑器 (Notion-like)
//  支持直接在大纲中编辑文本，并实时触发 PPT 局部重绘
// ============================================================

import * as React from 'react';
import { useCallback, useState, useEffect } from 'react';
import { useStore } from '../../store';
import { adapterRef } from '../App';
import type { SlideInfo, ShapeInfo } from '../../adapters/interface';
import { Edit2, Save, X, Image as ImageIcon, Type, Box, Wand2 } from 'lucide-react';

function getSlideTitle(slide: SlideInfo): string {
  const titleShape = slide.shapes.find((s) => s.text && s.text.trim().length > 0 && s.style?.fontSize && s.style.fontSize > 24);
  if (titleShape) return titleShape.text!.trim();
  
  const firstText = slide.shapes.find((s) => s.text && s.text.trim());
  return firstText?.text?.trim().slice(0, 40) ?? '空白页';
}

function getShapeIcon(type: string) {
  switch (type) {
    case 'image': return <ImageIcon size={14} className="text-blue-500" />;
    case 'textBox': return <Type size={14} className="text-gray-500" />;
    default: return <Box size={14} className="text-gray-400" />;
  }
}

function EditableBlock({ shape, slideIndex, onUpdate }: { shape: ShapeInfo, slideIndex: number, onUpdate: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(shape.text ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const setSelection = useStore(s => s.setSelection);

  useEffect(() => {
    setText(shape.text ?? '');
  }, [shape.text]);

  const handleSelect = () => {
    if (!adapterRef.current) return;
    setSelection({
      slideIndex,
      shapeIds: [shape.id],
      shapes: [shape],
      hasSelection: true,
    });
    // Attempt to sync selection to host if supported
    try {
      (adapterRef.current as any)?.setSelection?.([shape.id]);
    } catch {}
  };

  const handleSave = async () => {
    if (!adapterRef.current || text === shape.text) {
      setIsEditing(false);
      return;
    }
    
    setIsSaving(true);
    try {
      await adapterRef.current.updateShapeText({
        slideIndex,
        shapeId: shape.id,
        text,
        style: shape.style
      });
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      console.error('Failed to update text:', err);
      alert('保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiRewrite = () => {
    const store = useStore.getState();
    const chatInput = document.querySelector('.chat-input-textarea') as HTMLTextAreaElement;
    if (chatInput) {
      handleSelect();
      store.setContextScope('selection');
      const val = `请帮我润色/扩写当前选中的这段文字：\n\n"${shape.text}"\n\n要求：`;
      // Use a hacky way to set chat input since it's an uncontrolled/local state in ChatPanel usually
      // The better way is via store, but we can just prompt the user
      alert('已选中该文本块。请在右侧聊天框中输入“重写这段文字”。');
    }
  };

  if (shape.type !== 'textBox' && !shape.text) {
    return (
      <div 
        className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 cursor-pointer text-sm text-gray-500"
        onClick={handleSelect}
      >
        {getShapeIcon(shape.type)}
        <span className="truncate flex-1">{shape.name || shape.type}</span>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2 p-3 bg-blue-50 rounded-md border border-blue-200 shadow-sm my-1">
        <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
          {getShapeIcon(shape.type)} 正在编辑内容
        </div>
        <textarea
          className="w-full text-sm p-2 border border-gray-300 rounded resize-y focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-h-[60px]"
          value={text}
          onChange={e => setText(e.target.value)}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              handleSave();
            }
          }}
        />
        <div className="flex justify-end gap-2 mt-1">
          <button 
            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded"
            onClick={() => {
              setText(shape.text ?? '');
              setIsEditing(false);
            }}
            disabled={isSaving}
          >
            取消
          </button>
          <button 
            className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded flex items-center gap-1"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? '保存中...' : <><Save size={12}/> 保存 (Cmd+Enter)</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="group flex items-start gap-3 p-2 rounded-md hover:bg-gray-50 cursor-pointer text-sm my-1 border border-transparent hover:border-gray-200 transition-colors"
      onClick={handleSelect}
      onDoubleClick={() => setIsEditing(true)}
    >
      <div className="mt-0.5">{getShapeIcon(shape.type)}</div>
      <div className="flex-1 whitespace-pre-wrap break-words text-gray-700 leading-relaxed max-h-32 overflow-hidden relative">
        {shape.text}
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white/90 to-transparent group-hover:from-gray-50/90 hidden" />
      </div>
      <button 
        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
        onClick={(e) => {
          e.stopPropagation();
          handleSelect();
          alert('已选中，您可以在聊天框中输入“重写这段文字”。');
        }}
        title="让 AI 润色这段内容 (Inpainting)"
      >
        <Wand2 size={14} />
      </button>
      <button 
        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        title="手动编辑此块内容"
      >
        <Edit2 size={14} />
      </button>
    </div>
  );
}

export function OutlinePanel() {
  const pptInfo = useStore((s) => s.pptInfo);
  const activeSlideIndex = useStore((s) => s.activeSlideIndex);
  const setActiveSlideIndex = useStore((s) => s.setActiveSlideIndex);
  const currentSlide = useStore((s) => s.currentSlide);
  const setCurrentSlide = useStore((s) => s.setCurrentSlide);
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

  if (!pptInfo) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full text-gray-500">
        <Box size={32} className="mb-3 opacity-20" />
        <p>PPT 尚未加载或为空</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">大纲编辑器</span>
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-xs text-gray-600 font-medium">
            {pptInfo.slideCount} 页
          </span>
        </div>
        <button className="text-xs text-blue-600 hover:text-blue-700 font-medium" onClick={refresh}>
          同步最新内容
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {pptInfo.slides.map((s) => {
          const isActive = s.index === activeSlideIndex;
          const isCurrentSlide = currentSlide?.index === s.index;
          const shapesToRender = isCurrentSlide ? currentSlide.shapes : s.shapes;
          
          return (
            <div 
              key={s.id} 
              className={`rounded-lg border transition-all ${isActive ? 'border-blue-300 shadow-sm bg-white ring-1 ring-blue-100' : 'border-gray-100 bg-gray-50/30 hover:border-gray-300 hover:bg-white'}`}
            >
              {/* Slide Header */}
              <div 
                className={`px-3 py-2 flex items-center gap-3 cursor-pointer rounded-t-lg ${isActive ? 'bg-blue-50/50' : ''}`}
                onClick={() => handleSelectSlide(s.index)}
              >
                <div className={`flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {s.index + 1}
                </div>
                <div className={`flex-1 font-medium truncate ${isActive ? 'text-blue-900' : 'text-gray-700'}`}>
                  {getSlideTitle(s)}
                </div>
              </div>

              {/* Blocks (Shapes) */}
              {isActive && (
                <div className="p-2 border-t border-gray-100">
                  {shapesToRender.length === 0 ? (
                    <div className="text-sm text-gray-400 text-center py-4">此页为空</div>
                  ) : (
                    <div className="flex flex-col">
                      {shapesToRender.map(shape => (
                        <EditableBlock 
                          key={shape.id} 
                          shape={shape} 
                          slideIndex={s.index}
                          onUpdate={refresh}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

