// ============================================================
//  ContextScopeSelector — AI 读取范围选择器
//  三种模式: 整个 PPT / 当前页 / 选中内容
// ============================================================

import React, { useState } from 'react';
import type { ContextScope } from '../../ai';
import { SCOPE_LABELS } from '../../ai';
import type { PresentationInfo, SlideInfo, SelectionInfo } from '../../adapters/interface';
import {
  Layers,
  FileText,
  MousePointerClick,
  Eye,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Props {
  scope: ContextScope;
  onChange: (scope: ContextScope) => void;
  pptInfo: PresentationInfo | null;
  currentSlide: SlideInfo | null;
  selection: SelectionInfo | null;
  lastTokens?: number;
  compact?: boolean;
}

export function ContextScopeSelector({
  scope,
  onChange,
  pptInfo,
  currentSlide,
  selection,
  lastTokens,
  compact,
}: Props) {
  const [showPreview, setShowPreview] = useState(false);

  const options: Array<{
    key: ContextScope;
    icon: React.ComponentType<{ size?: number | string }>;
    label: string;
    hint: string;
    disabled?: boolean;
  }> = [
    {
      key: 'full',
      icon: Layers,
      label: '整个 PPT',
      hint: pptInfo ? `${pptInfo.slideCount} 页` : '尚未加载',
      disabled: !pptInfo,
    },
    {
      key: 'current',
      icon: FileText,
      label: '当前页',
      hint: currentSlide ? `第 ${currentSlide.index + 1} 页` : '加载中',
      disabled: !currentSlide,
    },
    {
      key: 'selection',
      icon: MousePointerClick,
      label: '选中内容',
      hint: selection?.hasSelection ? `${selection.shapes.length} 项` : '无选中',
    },
  ];

  return (
    <div className={`scope-selector ${compact ? 'scope-selector-compact' : ''}`}>
      <div className="scope-tabs">
        {options.map((opt) => {
          const active = scope === opt.key;
          return (
            <button
              key={opt.key}
              className={`scope-tab ${active ? 'active' : ''} ${opt.disabled ? 'disabled' : ''}`}
              onClick={() => !opt.disabled && onChange(opt.key)}
              disabled={opt.disabled}
              title={`${opt.label} — ${opt.hint}`}
            >
              <opt.icon size={12} />
              <span className="scope-tab-label">{opt.label}</span>
              <span className="scope-tab-hint">{opt.hint}</span>
            </button>
          );
        })}
      </div>

      {!compact && (
        <div className="scope-meta">
          <button
            className="scope-preview-toggle"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye size={11} />
            <span>预览 AI 能看到的内容</span>
            {showPreview ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {lastTokens !== undefined && lastTokens > 0 && (
            <span className="scope-tokens" title="上次发送消耗的上下文 tokens">
              ~{lastTokens.toLocaleString()} tokens
            </span>
          )}
        </div>
      )}

      {showPreview && !compact && (
        <ContextPreview
          scope={scope}
          pptInfo={pptInfo}
          currentSlide={currentSlide}
          selection={selection}
        />
      )}
    </div>
  );
}

function ContextPreview({
  scope,
  pptInfo,
  currentSlide,
  selection,
}: {
  scope: ContextScope;
  pptInfo: PresentationInfo | null;
  currentSlide: SlideInfo | null;
  selection: SelectionInfo | null;
}) {
  return (
    <div className="context-preview">
      <div className="context-preview-header">
        <Info size={11} />
        <span>当前模式：{SCOPE_LABELS[scope]}</span>
      </div>

      <div className="context-preview-body">
        <p className="preview-intro">
          每次发送前，AI 都会自动关联这 3 类基础上下文：
        </p>
        <div className="preview-shape-list">
          <div className="preview-shape-item">
            <span className="preview-shape-type">PPT</span>
            <span className="preview-shape-text">总页数：{pptInfo?.slideCount ?? '加载中'} 页</span>
          </div>
          <div className="preview-shape-item">
            <span className="preview-shape-type">当前页</span>
            <span className="preview-shape-text">
              {currentSlide ? `第 ${currentSlide.index + 1} 页，${currentSlide.shapes.length} 个元素` : '加载中'}
            </span>
          </div>
          <div className="preview-shape-item">
            <span className="preview-shape-type">选中</span>
            <span className="preview-shape-text">
              {selection?.hasSelection ? `${selection.shapes.length} 个元素` : '当前未选中'}
            </span>
          </div>
        </div>
      </div>

      {scope === 'full' && pptInfo && (
        <div className="context-preview-body">
          <p className="preview-intro">
            AI 将读取全部 <strong>{pptInfo.slideCount}</strong> 页的文本内容：
          </p>
          <div className="preview-slide-list">
            {pptInfo.slides.slice(0, 10).map((s) => {
              const firstText = s.shapes.find(sh => sh.text)?.text?.slice(0, 40) ?? '(空白页)';
              return (
                <div key={s.index} className="preview-slide-item">
                  <span className="preview-slide-num">#{s.index + 1}</span>
                  <span className="preview-slide-text">{firstText}</span>
                </div>
              );
            })}
            {pptInfo.slides.length > 10 && (
              <div className="preview-slide-more">
                ... 还有 {pptInfo.slides.length - 10} 页
              </div>
            )}
          </div>
        </div>
      )}

      {scope === 'current' && currentSlide && (
        <div className="context-preview-body">
          <p className="preview-intro">
            AI 将读取<strong>第 {currentSlide.index + 1} 页</strong>的完整内容（含位置/尺寸）：
          </p>
          <div className="preview-shape-list">
            {currentSlide.shapes.map((sh) => (
              <div key={sh.id} className="preview-shape-item">
                <span className="preview-shape-type">{sh.type}</span>
                <span className="preview-shape-text">
                  {sh.text?.slice(0, 80) ?? '(无文本)'}
                </span>
              </div>
            ))}
          </div>
          <p className="preview-foot">
            另附其他 {(pptInfo?.slideCount ?? 1) - 1} 页的标题摘要作为参考
          </p>
        </div>
      )}

      {scope === 'selection' && (
        <div className="context-preview-body">
          {selection?.hasSelection ? (
            <>
              <p className="preview-intro">
                AI 将聚焦于你选中的 <strong>{selection.shapes.length}</strong> 个形状：
              </p>
              <div className="preview-shape-list">
                {selection.shapes.map((sh) => (
                  <div key={sh.id} className="preview-shape-item highlighted">
                    <span className="preview-shape-type">{sh.type}</span>
                    <span className="preview-shape-text">
                      {sh.text?.slice(0, 80) ?? '(无文本)'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="preview-empty">
              <p>你还没有在 PPT 中选中任何形状。</p>
              <p className="preview-empty-hint">
                请回到 PPT 点击要修改的文本框或图片，然后返回这里继续。
                否则会自动降级为"当前页"模式。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
