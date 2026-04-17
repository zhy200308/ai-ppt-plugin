// ============================================================
//  QuickSetupDialog — 快速配置对话框
//  支持粘贴 ccswitch / Claude Code / 环境变量格式
// ============================================================

import React, { useState, useCallback } from 'react';
import { parseQuickSetup, generateProviderKey } from '../../ai/quick-setup';
import type { ProviderConfig } from '../../ai/types';
import { Zap, X, Check, AlertCircle, Clipboard } from 'lucide-react';

const EXAMPLE_CONFIGS = [
  {
    label: 'Claude Code / AnyRouter',
    text: `export ANTHROPIC_AUTH_TOKEN=sk-your-token-here
export ANTHROPIC_BASE_URL=https://anyrouter.top`,
  },
  {
    label: 'OpenAI 中转',
    text: `export OPENAI_API_KEY=sk-your-key
export OPENAI_BASE_URL=https://your-relay.com/v1`,
  },
  {
    label: 'PowerShell 格式',
    text: `$env:ANTHROPIC_AUTH_TOKEN = "sk-your-token"
$env:ANTHROPIC_BASE_URL = "https://anyrouter.top"`,
  },
];

interface Props {
  onAdd: (key: string, config: ProviderConfig) => void;
  onClose: () => void;
}

export function QuickSetupDialog({ onAdd, onClose }: Props) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Partial<ProviderConfig> | null>(null);
  const [message, setMessage] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);

  const handleParse = useCallback((input: string) => {
    setText(input);
    if (!input.trim()) {
      setPreview(null);
      setMessage(null);
      return;
    }

    const result = parseQuickSetup(input);
    if (result.success && result.config) {
      setPreview(result.config);
      setMessage({ type: 'success', text: `✓ ${result.message}（来自 ${result.detectedFrom}）` });
    } else {
      setPreview(null);
      setMessage({ type: 'error', text: result.message });
    }
  }, []);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        handleParse(clipText);
      }
    } catch {
      setMessage({ type: 'error', text: '无法读取剪贴板，请手动粘贴' });
    }
  }, [handleParse]);

  const handleConfirm = useCallback(() => {
    if (!preview || !preview.provider) return;

    const key = generateProviderKey(preview.provider, preview.baseUrl ?? '');
    onAdd(key, {
      provider: preview.provider,
      label: preview.label ?? preview.provider,
      apiKey: preview.apiKey ?? '',
      baseUrl: preview.baseUrl ?? '',
      model: preview.model ?? '',
      maxTokens: preview.maxTokens,
      temperature: preview.temperature ?? 0.7,
      enabled: true,
      protocol: preview.protocol,
      authStyle: preview.authStyle,
    });
  }, [preview, onAdd]);

  const handleExample = useCallback((exampleText: string) => {
    handleParse(exampleText);
  }, [handleParse]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">
            <Zap size={16} />
            快速配置
          </span>
          <button className="btn-icon-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">
          <p className="quick-setup-desc">
            粘贴环境变量配置即可自动识别并添加。支持 <code>export</code>、
            <code>$env:</code>、<code>set</code> 等多种格式。
          </p>

          <div className="quick-setup-input-wrap">
            <textarea
              className="quick-setup-input"
              value={text}
              onChange={(e) => handleParse(e.target.value)}
              placeholder={`example:\nexport ANTHROPIC_AUTH_TOKEN=sk-xxx\nexport ANTHROPIC_BASE_URL=https://anyrouter.top`}
              rows={6}
              spellCheck={false}
            />
            <button className="quick-setup-paste" onClick={handlePasteFromClipboard}>
              <Clipboard size={12} />
              从剪贴板粘贴
            </button>
          </div>

          {message && (
            <div className={`quick-setup-msg quick-setup-msg-${message.type}`}>
              {message.type === 'error' && <AlertCircle size={12} />}
              <span>{message.text}</span>
            </div>
          )}

          {preview && (
            <div className="quick-setup-preview">
              <h4>识别结果</h4>
              <div className="preview-row">
                <span className="preview-label">服务类型</span>
                <span className="preview-value">{preview.label}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">API 地址</span>
                <span className="preview-value mono">{preview.baseUrl}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">模型</span>
                <span className="preview-value mono">{preview.model}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">API Key</span>
                <span className="preview-value mono">
                  {preview.apiKey ? `${preview.apiKey.slice(0, 8)}...${preview.apiKey.slice(-4)}` : '(无)'}
                </span>
              </div>
              <div className="preview-row">
                <span className="preview-label">鉴权方式</span>
                <span className="preview-value">
                  {preview.authStyle === 'bearer' ? 'Bearer Token（推荐用于中转）' :
                   preview.authStyle === 'x-api-key' ? 'x-api-key（官方 SDK）' :
                   'URL 参数'}
                </span>
              </div>
            </div>
          )}

          <div className="quick-setup-examples">
            <span className="examples-label">示例模板:</span>
            {EXAMPLE_CONFIGS.map((ex) => (
              <button
                key={ex.label}
                className="example-chip"
                onClick={() => handleExample(ex.text)}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-sm btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn-sm btn-primary"
            onClick={handleConfirm}
            disabled={!preview}
          >
            <Check size={12} />
            添加并启用
          </button>
        </div>
      </div>
    </div>
  );
}
