import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClarificationItem } from '../../store';
import { Trash2, PlusCircle, PlayCircle, XCircle, ChevronLeft, ChevronRight, LayoutList } from 'lucide-react';
import type { ThemeDefinition } from '../../themes';

export function ClarificationPanel({
  items,
  themes,
  disabled,
  onChange,
  onAdd,
  onRemove,
  onClear,
  onContinue,
}: {
  items: ClarificationItem[];
  themes: ThemeDefinition[];
  disabled?: boolean;
  onChange: (id: string, patch: Partial<ClarificationItem>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onContinue: () => void;
}) {
  const missingRequired = useMemo(() => {
    return items.some((i) => i.required && !String(i.answer ?? '').trim());
  }, [items]);

  // 默认以“向导模式”逐题展示（更友好）
  const [showAll, setShowAll] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const pendingJumpRef = useRef<'end' | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      setCurrentIndex(0);
      return;
    }
    // 防止越界
    setCurrentIndex((i) => Math.min(Math.max(i, 0), items.length - 1));
    if (pendingJumpRef.current === 'end') {
      pendingJumpRef.current = null;
      setCurrentIndex(items.length - 1);
    }
  }, [items.length]);

  const visibleItems = showAll
    ? items
    : items.length > 0
      ? [items[Math.min(currentIndex, items.length - 1)]]
      : [];
  const isLast = currentIndex >= items.length - 1;

  return (
    <div className="clarify-panel">
      <div className="clarify-header">
        <div className="clarify-title">需要确认的问题</div>
        <div className="clarify-sub">
          {showAll ? `${items.length} 项` : `${Math.min(currentIndex + 1, items.length)}/${items.length}`}
        </div>
        {!showAll && items.length > 1 && (
          <div className="clarify-nav">
            <button
              className="btn-icon-sm"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={disabled || currentIndex <= 0}
              title="上一个"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              className="btn-icon-sm"
              onClick={() => setCurrentIndex((i) => Math.min(items.length - 1, i + 1))}
              disabled={disabled || currentIndex >= items.length - 1}
              title="下一个"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn-sm btn-ghost" onClick={() => setShowAll((v) => !v)} disabled={disabled || items.length <= 1}>
          <LayoutList size={14} /> {showAll ? '逐题' : '列表'}
        </button>
        <button
          className="btn-sm btn-ghost"
          onClick={() => { pendingJumpRef.current = 'end'; onAdd(); }}
          disabled={disabled}
        >
          <PlusCircle size={14} /> 新增
        </button>
        <button className="btn-sm btn-ghost" onClick={onClear} disabled={disabled}>
          <XCircle size={14} /> 清空
        </button>
        {/* 列表模式保留“一键提交”，逐题模式则只在最后一题展示提交按钮 */}
        {(showAll || isLast) && (
          <button className="btn-sm btn-primary" onClick={onContinue} disabled={disabled || missingRequired}>
            <PlayCircle size={14} /> 提交并继续生成
          </button>
        )}
      </div>

      <div className="clarify-list">
        {visibleItems.map((item) => {
          const idx = items.findIndex((x) => x.id === item.id);
          const requiredMissing = item.required && !String(item.answer ?? '').trim();
          const datalistId = `clarify_${item.id}`;

          return (
            <div className={`clarify-item ${requiredMissing ? 'missing' : ''}`} key={item.id}>
              <div className="clarify-q">
                <div className="clarify-index">{idx + 1}</div>
                <input
                  className="clarify-question"
                  value={item.question}
                  disabled={disabled}
                  onChange={(e) => onChange(item.id, { question: e.target.value })}
                  placeholder="请输入问题"
                />
                <button className="btn-icon" title="删除" onClick={() => onRemove(item.id)} disabled={disabled}>
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="clarify-a">
                <div className="clarify-kind">
                  <select
                    value={item.kind}
                    disabled={disabled}
                    onChange={(e) => onChange(item.id, { kind: e.target.value as any })}
                  >
                    <option value="text">文本</option>
                    <option value="select">单选</option>
                    <option value="boolean">是/否</option>
                  </select>
                  <label className="clarify-required">
                    <input
                      type="checkbox"
                      checked={Boolean(item.required)}
                      disabled={disabled}
                      onChange={(e) => onChange(item.id, { required: e.target.checked })}
                    />
                    必填
                  </label>
                </div>

                {item.kind === 'boolean' ? (
                  <label className="clarify-bool">
                    <input
                      type="checkbox"
                      checked={String(item.answer) === 'true'}
                      disabled={disabled}
                      onChange={(e) => onChange(item.id, { answer: e.target.checked ? 'true' : 'false' })}
                    />
                    <span>{String(item.answer) === 'true' ? '是' : '否'}</span>
                  </label>
                ) : (
                  <>
                    {/* 主题可视化预览：当问题与“主题”相关时，展示主题卡片选择 */}
                    {item.kind === 'select' && isThemeQuestion(item) && (
                      <div className="theme-grid">
                        {getThemeCandidates(themes, item).map((t) => {
                          const active = normalizeThemeAnswer(item.answer) === t.id || normalizeThemeAnswer(item.answer) === t.name.toLowerCase();
                          return (
                            <button
                              type="button"
                              key={t.id}
                              className={`theme-card ${active ? 'active' : ''}`}
                              onClick={() => onChange(item.id, { answer: t.id })}
                              disabled={disabled}
                              title={t.name}
                            >
                              <div className="theme-swatch">
                                <span style={{ background: t.primaryColor }} />
                                <span style={{ background: t.accentColor }} />
                                <span style={{ background: t.backgroundColor, border: '1px solid rgba(0,0,0,0.06)' }} />
                              </div>
                              <div className="theme-name">{t.name}</div>
                              <div className="theme-sample" style={{ fontFamily: t.fontFamily }}>
                                标题 Title · 正文 Body
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {item.kind === 'select' && (item.options?.length ?? 0) > 0 && (
                      <datalist id={datalistId}>
                        {item.options!.map((opt) => (
                          <option key={opt} value={opt} />
                        ))}
                      </datalist>
                    )}
                    <input
                      className="clarify-answer"
                      value={item.answer}
                      disabled={disabled}
                      list={item.kind === 'select' ? datalistId : undefined}
                      placeholder={item.kind === 'select' ? '可从候选中选，也可自定义输入' : '请输入答案'}
                      onChange={(e) => onChange(item.id, { answer: e.target.value })}
                    />
                  </>
                )}

                {item.kind === 'select' && (
                  <input
                    className="clarify-options"
                    value={(item.options ?? []).join(' | ')}
                    disabled={disabled}
                    placeholder="选项（用 | 分隔）"
                    onChange={(e) => onChange(item.id, {
                      options: e.target.value.split('|').map((s) => s.trim()).filter(Boolean),
                    })}
                  />
                )}
              </div>

              {!showAll && (
                <div className="clarify-step-actions">
                  {!isLast ? (
                    <button
                      className="btn-sm btn-primary"
                      disabled={disabled || requiredMissing}
                      onClick={() => setCurrentIndex((i) => Math.min(items.length - 1, i + 1))}
                      title="确定并自动切换到下一题"
                    >
                      确定并下一题 <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button
                      className="btn-sm btn-primary"
                      disabled={disabled || missingRequired}
                      onClick={onContinue}
                      title="提交所有答案并继续生成"
                    >
                      提交并继续生成 <PlayCircle size={14} />
                    </button>
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

function normalizeThemeAnswer(ans: string): string {
  return (ans ?? '').trim().toLowerCase();
}

function isThemeQuestion(item: ClarificationItem): boolean {
  const id = (item.id ?? '').toLowerCase();
  const q = (item.question ?? '').toLowerCase();
  return id.includes('theme') || q.includes('主题') || q.includes('模版') || q.includes('模板');
}

function getThemeCandidates(themes: ThemeDefinition[], item: ClarificationItem): ThemeDefinition[] {
  const opts = (item.options ?? []).map((s) => s.trim()).filter(Boolean);
  if (opts.length === 0) return themes;
  const lowered = new Set(opts.map((s) => s.toLowerCase()));
  const matches = themes.filter((t) => lowered.has(t.id.toLowerCase()) || lowered.has(t.name.toLowerCase()));
  return matches.length > 0 ? matches : themes;
}
