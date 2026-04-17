// ============================================================
//  ProgressIndicator — 聊天处理阶段可视化指示器
// ============================================================

import React, { useEffect, useState } from 'react';
import type { ChatStage, ChatProgress } from '../../store';
import {
  FileSearch,
  Send,
  MessageSquare,
  Wand2,
  CheckCircle2,
  Loader2,
  PlayCircle,
} from 'lucide-react';

interface Stage {
  key: ChatStage;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
}

const STAGES: Stage[] = [
  { key: 'reading_context',  label: '读取 PPT',  icon: FileSearch },
  { key: 'sending',          label: '发送请求',  icon: Send },
  { key: 'streaming',        label: '生成中',    icon: MessageSquare },
  { key: 'parsing',          label: '解析指令',  icon: Wand2 },
  { key: 'ready',            label: '就绪',      icon: PlayCircle },
  { key: 'applying',         label: '应用修改',  icon: Wand2 },
];

export function ProgressIndicator({ progress }: { progress: ChatProgress }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (progress.stage === 'idle' || progress.stage === 'done') {
      setElapsed(0);
      return;
    }

    const tick = () => setElapsed(Math.round((Date.now() - progress.startedAt) / 100) / 10);
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [progress.stage, progress.startedAt]);

  if (progress.stage === 'idle' || progress.stage === 'done') {
    return null;
  }

  const activeIdx = STAGES.findIndex((s) => s.key === progress.stage);

  return (
    <div className="progress-indicator">
      <div className="progress-stages">
        {STAGES.filter(s => s.key !== 'ready').map((stage, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          const pending = i > activeIdx;

          return (
            <React.Fragment key={stage.key}>
              <div className={`progress-stage ${done ? 'done' : ''} ${active ? 'active' : ''} ${pending ? 'pending' : ''}`}>
                <div className="progress-dot">
                  {active ? (
                    <Loader2 size={10} className="spin" />
                  ) : done ? (
                    <CheckCircle2 size={10} />
                  ) : (
                    <stage.icon size={10} />
                  )}
                </div>
                <span className="progress-label">{stage.label}</span>
              </div>
              {i < STAGES.length - 2 && (
                <div className={`progress-connector ${done ? 'done' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="progress-detail">
        <span className="progress-text">
          {progress.detail ?? STAGES.find(s => s.key === progress.stage)?.label}
        </span>
        <span className="progress-meta">
          {progress.tokensReceived !== undefined && progress.tokensReceived > 0 && (
            <span className="progress-tokens">{progress.tokensReceived} tokens</span>
          )}
          <span className="progress-elapsed">{elapsed.toFixed(1)}s</span>
        </span>
      </div>
    </div>
  );
}
