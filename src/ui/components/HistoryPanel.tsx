// ============================================================
//  HistoryPanel — 操作历史面板
//  显示所有 AI 执行过的修改批次，可回滚
// ============================================================

import React, { useState, useCallback } from 'react';
import { useStore } from '../../store';
import type { OperationHistoryEntry } from '../../store';
import { adapterRef } from '../App';
import { restoreSlideSnapshot } from '../../adapters/snapshot';
import {
  History,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Trash2,
  Clock,
} from 'lucide-react';

export function HistoryPanel() {
  const { operationHistory, markHistoryReverted, clearHistory, updateEnterprisePageStatus } = useStore();

  return (
    <div className="history-panel">
      <div className="section-header">
        <h3>操作历史</h3>
        {operationHistory.length > 0 && (
          <button className="btn-sm btn-ghost" onClick={clearHistory}>
            <Trash2 size={12} />
            清空
          </button>
        )}
      </div>

      {operationHistory.length === 0 ? (
        <div className="history-empty">
          <History size={28} />
          <p>暂无操作历史</p>
          <p className="history-empty-sub">
            自动按页应用后也会记录在此，可逐页驳回
          </p>
        </div>
      ) : (
        <div className="history-list">
          {operationHistory.map((entry) => (
            <HistoryCard
              key={entry.id}
              entry={entry}
              onRevert={() => {
                markHistoryReverted(entry.id);
                if (entry.pageNumber) {
                  updateEnterprisePageStatus(entry.pageNumber, {
                    status: 'reverted',
                    message: '已按快照驳回',
                  });
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryCard({
  entry,
  onRevert,
}: {
  entry: OperationHistoryEntry;
  onRevert: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reverting, setReverting] = useState(false);

  const success = entry.results.filter(r => r.success).length;
  const failed = entry.results.filter(r => !r.success).length;

  const handleRevert = useCallback(async () => {
    if (!adapterRef.current || entry.reverted) return;
    if (!confirm(`确认驳回此次修改？将尝试撤销 ${success} 项操作。`)) return;

    setReverting(true);
    try {
      if (entry.snapshot) {
        await restoreSlideSnapshot(adapterRef.current, entry.snapshot);
      } else {
        // fallback: 连续调用 undo，尝试回滚所有操作
        for (let i = 0; i < success; i++) {
          await adapterRef.current.undo();
        }
      }
      onRevert();
    } catch (err) {
      console.error('[HistoryPanel] Revert failed:', err);
    }
    setReverting(false);
  }, [entry.reverted, success, onRevert]);

  const timeStr = new Date(entry.timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`history-card ${entry.reverted ? 'reverted' : ''}`}>
      <div className="history-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="history-card-info">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <div className="history-card-main">
            <span className="history-message" title={entry.userMessage}>
              {entry.userMessage.length > 40
                ? entry.userMessage.slice(0, 40) + '...'
                : entry.userMessage}
            </span>
            <span className="history-meta">
              <Clock size={10} /> {timeStr}
              <span className="history-stats">
                {success > 0 && (
                  <span className="stat-success">
                    <CheckCircle2 size={10} /> {success}
                  </span>
                )}
                {failed > 0 && (
                  <span className="stat-fail">
                    <XCircle size={10} /> {failed}
                  </span>
                )}
              </span>
              {entry.reverted && <span className="history-reverted-badge">已驳回</span>}
              {entry.pageNumber && !entry.reverted && (
                <span className="history-reverted-badge">第 {entry.pageNumber} 页</span>
              )}
            </span>
          </div>
        </div>
        {!entry.reverted && success > 0 && (
          <button
            className="btn-sm btn-ghost"
            onClick={(e) => { e.stopPropagation(); handleRevert(); }}
            disabled={reverting}
          >
            <RotateCcw size={12} />
            {reverting ? '...' : '驳回'}
          </button>
        )}
      </div>

      {expanded && (
        <div className="history-card-body">
          {entry.aiResponse && (
            <div className="history-section">
              <span className="history-section-label">AI 回复</span>
              <div className="history-ai-response">{entry.aiResponse}</div>
            </div>
          )}

          <div className="history-section">
            <span className="history-section-label">执行的操作 ({entry.operations.length})</span>
            <div className="history-ops">
              {entry.operations.map((op, i) => {
                const result = entry.results[i];
                return (
                  <div
                    key={i}
                    className={`history-op ${result?.success ? 'op-success' : 'op-fail'}`}
                  >
                    <span className="op-action-tag">{op.action}</span>
                    <span className="op-summary">
                      {describeOperation(op)}
                    </span>
                    {result?.success ? (
                      <CheckCircle2 size={11} className="op-icon-ok" />
                    ) : (
                      <XCircle size={11} className="op-icon-fail" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function describeOperation(op: any): string {
  switch (op.action) {
    case 'updateText':
      return `幻灯片 ${op.slideIndex + 1} · "${String(op.text).slice(0, 30)}..."`;
    case 'insertText':
      return `幻灯片 ${op.params.slideIndex + 1} · 插入文本`;
    case 'insertImage':
      return `幻灯片 ${op.params.slideIndex + 1} · 插入图片`;
    case 'deleteShape':
      return `幻灯片 ${op.slideIndex + 1} · 删除形状`;
    case 'addSlide':
      return `添加新幻灯片 ${op.afterIndex !== undefined ? '在第 ' + (op.afterIndex + 1) + ' 页后' : '末尾'}`;
    case 'deleteSlide':
      return `删除幻灯片 ${op.slideIndex + 1}`;
    case 'reorderSlide':
      return `移动幻灯片 ${op.fromIndex + 1} → ${op.toIndex + 1}`;
    case 'setNotes':
      return `幻灯片 ${op.slideIndex + 1} · 设置备注`;
    case 'setBackground':
      return `幻灯片 ${op.slideIndex + 1} · 设置背景`;
    default:
      return '未知操作';
  }
}
