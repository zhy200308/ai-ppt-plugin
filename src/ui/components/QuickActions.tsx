// ============================================================
//  QuickActions — 快捷任务预设
//  一键触发常用 PPT 修改任务
// ============================================================

import React from 'react';
import {
  Languages,
  Hash,
  Palette,
  Minimize2,
  FileText,
  Type,
  Sparkles,
  Zap,
} from 'lucide-react';

export interface QuickAction {
  id: string;
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  prompt: string;
  category: '内容' | '样式' | '结构';
}

export const QUICK_ACTIONS: QuickAction[] = [
  // 内容类
  {
    id: 'translate_en',
    icon: Languages,
    label: '翻译为英文',
    prompt: '请将全部幻灯片内容翻译为英文，保持专业语气和原有结构',
    category: '内容',
  },
  {
    id: 'translate_zh',
    icon: Languages,
    label: '翻译为中文',
    prompt: '请将全部幻灯片内容翻译为简体中文，保持专业语气和原有结构',
    category: '内容',
  },
  {
    id: 'condense',
    icon: Minimize2,
    label: '精简内容',
    prompt: '请精简每一页的文字，突出核心要点，去除冗余表达。每页正文不超过 80 字',
    category: '内容',
  },
  {
    id: 'generate_notes',
    icon: FileText,
    label: '生成演讲备注',
    prompt: '请为每一页幻灯片生成对应的演讲备注，帮助演讲者在现场进行详细讲解，每页备注 100-200 字',
    category: '内容',
  },
  {
    id: 'polish',
    icon: Sparkles,
    label: '优化措辞',
    prompt: '请优化所有幻灯片的用词和表达，使其更加专业、准确、有说服力',
    category: '内容',
  },

  // 样式类
  {
    id: 'business_color',
    icon: Palette,
    label: '商务配色',
    prompt: '请将所有幻灯片调整为专业商务风格的配色：标题使用深蓝色 #0F4C81，正文使用深灰 #333333，强调使用金色 #C9A961',
    category: '样式',
  },
  {
    id: 'modern_color',
    icon: Palette,
    label: '现代配色',
    prompt: '请将所有幻灯片调整为现代简约风格：主色 #2563EB，强调色 #F59E0B，背景使用 #F8FAFC',
    category: '样式',
  },
  {
    id: 'unify_font',
    icon: Type,
    label: '统一字体',
    prompt: '请将所有幻灯片的字体统一：标题使用 "微软雅黑" 28-36号加粗，正文使用 "微软雅黑" 16-18号常规',
    category: '样式',
  },

  // 结构类
  {
    id: 'add_numbers',
    icon: Hash,
    label: '添加页码',
    prompt: '请在每一页右下角添加页码，格式为 "当前页/总页数"，字号 12，颜色 #9CA3AF',
    category: '结构',
  },
];

interface Props {
  onSelect: (prompt: string) => void;
  compact?: boolean;
}

export function QuickActions({ onSelect, compact }: Props) {
  return (
    <div className={`quick-actions ${compact ? 'quick-actions-compact' : ''}`}>
      {(['内容', '样式', '结构'] as const).map((category) => (
        <div key={category} className="quick-actions-group">
          <span className="quick-actions-cat">{category}</span>
          <div className="quick-actions-list">
            {QUICK_ACTIONS.filter(a => a.category === category).map((action) => (
              <button
                key={action.id}
                className="quick-action-btn"
                onClick={() => onSelect(action.prompt)}
                title={action.prompt}
              >
                <action.icon size={12} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 简化版 — 只显示图标，用于输入框旁边 */
export function QuickActionsMenu({ onSelect }: { onSelect: (prompt: string) => void }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="quick-actions-menu">
      <button
        className="btn-icon-sm"
        onClick={() => setOpen(!open)}
        title="快捷指令"
      >
        <Zap size={14} />
      </button>

      {open && (
        <>
          <div className="quick-actions-overlay" onClick={() => setOpen(false)} />
          <div className="quick-actions-popover">
            <div className="popover-header">快捷指令</div>
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                className="popover-item"
                onClick={() => {
                  onSelect(action.prompt);
                  setOpen(false);
                }}
              >
                <action.icon size={12} />
                <span>{action.label}</span>
                <span className="popover-cat">{action.category}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
