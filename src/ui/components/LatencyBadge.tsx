// ============================================================
//  LatencyBadge — 连接状态与延时显示
// ============================================================

import React from 'react';
import type { ProviderHealth } from '../../ai/types';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

/** 根据延时评级 */
export function rateLatency(ms: number): {
  status: ProviderHealth['status'];
  label: string;
  color: string;
} {
  if (ms < 500)   return { status: 'healthy',  label: '优秀', color: 'var(--success)' };
  if (ms < 1500)  return { status: 'healthy',  label: '良好', color: 'var(--success)' };
  if (ms < 3000)  return { status: 'slow',     label: '一般', color: 'var(--warning)' };
  if (ms < 8000)  return { status: 'degraded', label: '较慢', color: '#f97316' };
  return             { status: 'down',     label: '超时', color: 'var(--danger)' };
}

interface Props {
  health?: ProviderHealth;
  testing?: boolean;
  compact?: boolean;
}

export function LatencyBadge({ health, testing, compact }: Props) {
  if (testing) {
    return (
      <span className="latency-badge latency-testing">
        <Loader2 size={10} className="spin" />
        <span>测试中...</span>
      </span>
    );
  }

  if (!health || health.status === 'unknown') {
    return null;
  }

  if (health.status === 'down' || !health.latencyMs) {
    return (
      <span
        className="latency-badge latency-down"
        title={health.errorMessage ?? '连接失败'}
      >
        <span className="latency-dot" style={{ background: 'var(--danger)' }} />
        {!compact && <span>不通</span>}
      </span>
    );
  }

  const rating = rateLatency(health.latencyMs);
  const age = Date.now() - health.lastChecked;
  const ageStr = age < 60000
    ? `${Math.round(age / 1000)}秒前`
    : `${Math.round(age / 60000)}分钟前`;

  return (
    <span
      className="latency-badge"
      title={`${rating.label} · ${ageStr}检测${health.model ? ' · ' + health.model : ''}`}
    >
      <span
        className="latency-dot"
        style={{ background: rating.color }}
      />
      <span className="latency-ms">{health.latencyMs}ms</span>
      {!compact && <span className="latency-label">{rating.label}</span>}
    </span>
  );
}
