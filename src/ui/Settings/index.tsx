// ============================================================
//  Settings — 设置面板
//  - 官方服务：只开放 API Key + 模型，其他字段锁死
//  - 中转站：所有字段都可编辑（URL / 鉴权方式 / 模型等）
// ============================================================

import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useStore } from '../../store';
import { AIService, detectSystemProxy, parseProxyUrl } from '../../ai';
import { importThemePackFromZip, importThemePackFromFolder, importThemePackFromPptx, themeRegistry } from '../../themes';
import { importSkillFromMarkdown, importSkillFromZip, saveUserSkill, deleteUserSkill, loadAllSkills } from '../../skills';
import {
  isFieldEditable,
  isRelayProvider,
  isOfficialProvider,
  RELAY_TEMPLATES,
} from '../../ai/types';
import type { ProviderConfig, ProxyConfig, ProviderHealth, AIProvider } from '../../ai/types';
import { QuickSetupDialog, type QuickSetupDialogProps } from '../components/QuickSetupDialog';
import { LatencyBadge } from '../components/LatencyBadge';
import {
  X,
  Loader2,
  Trash2,
  Wifi,
  Eye,
  EyeOff,
  Globe,
  Server,
  ChevronRight,
  Zap,
  RefreshCw,
  Lock,
  Plus,
  Info,
  Paintbrush,
  Upload,
  Wrench,
} from 'lucide-react';

export function Settings() {
  const {
    activeProvider,
    setActiveProvider,
    providers,
    updateProvider,
    addProvider,
    removeProvider,
    providerHealth,
    setProviderHealth,
    proxyConfig,
    setProxyConfig,
    themePacks,
    addThemePack,
    removeThemePack,
    styleProfile,
    setStyleProfile,
    clearStyleProfile,
  } = useStore();

  const [section, setSection] = useState<'providers' | 'proxy' | 'themes' | 'skills' | 'canva'>('providers');
  const [showQuickSetup, setShowQuickSetup] = useState(false);
  const [showAddRelay, setShowAddRelay] = useState<'claude-relay' | 'openai-relay' | null>(null);

  return (
    <div className="settings-panel">
      <div className="settings-nav">
        <button
          className={`settings-nav-btn ${section === 'providers' ? 'active' : ''}`}
          onClick={() => setSection('providers')}
        >
          <Server size={14} />
          AI 服务
        </button>
        <button
          className={`settings-nav-btn ${section === 'themes' ? 'active' : ''}`}
          onClick={() => setSection('themes')}
        >
          <Paintbrush size={14} />
          主题模板
        </button>
        <button
          className={`settings-nav-btn ${section === 'skills' ? 'active' : ''}`}
          onClick={() => setSection('skills')}
        >
          <Wrench size={14} />
          技能
        </button>
        <button
          className={`settings-nav-btn ${section === 'canva' ? 'active' : ''}`}
          onClick={() => setSection('canva')}
        >
          <Paintbrush size={14} />
          Canva
        </button>
        <button
          className={`settings-nav-btn ${section === 'proxy' ? 'active' : ''}`}
          onClick={() => setSection('proxy')}
        >
          <Globe size={14} />
          网络代理
        </button>
      </div>

      {section === 'providers' && (
        <ProvidersSection
          activeProvider={activeProvider}
          providers={providers}
          providerHealth={providerHealth}
          onSetActive={setActiveProvider}
          onUpdate={updateProvider}
          onRemove={removeProvider}
          onSetHealth={setProviderHealth}
          onOpenQuickSetup={() => setShowQuickSetup(true)}
          onAddRelay={(kind) => setShowAddRelay(kind)}
        />
      )}

      {section === 'proxy' && (
        <ProxySection config={proxyConfig} onChange={setProxyConfig} />
      )}

      {section === 'themes' && (
        <ThemesSection
          themePacks={themePacks}
          styleProfile={styleProfile}
          onAddPack={addThemePack}
          onRemovePack={removeThemePack}
          onSetStyle={setStyleProfile}
          onClearStyle={clearStyleProfile}
        />
      )}

      {section === 'skills' && <SkillsSection />}

      {section === 'canva' && <CanvaSection />}

      <QuickSetupDialog 
        open={showQuickSetup} 
        onOpenChange={setShowQuickSetup} 
        onApply={(config) => {
          let hostname = 'api';
          if (config.baseUrl) {
            try { hostname = new URL(config.baseUrl).hostname.replace(/\./g, '_'); } catch {}
          }
          const key = `${config.provider}_${hostname}_${Date.now().toString(36)}`;
          addProvider(key, config);
          setActiveProvider(key);
          setShowQuickSetup(false);
        }} 
      />

      {showAddRelay && (
        <AddRelayDialog
          kind={showAddRelay}
          onAdd={(key, config) => {
            addProvider(key, config);
            setActiveProvider(key);
            setShowAddRelay(null);
          }}
          onClose={() => setShowAddRelay(null)}
        />
      )}
    </div>
  );
}

function CanvaSection() {
  const { canvaConfig, setCanvaConfig } = useStore();
  const [token, setToken] = useState(canvaConfig.accessToken);
  const [enabled, setEnabled] = useState(canvaConfig.enabled);
  const [templatesStr, setTemplatesStr] = useState(() => JSON.stringify(canvaConfig.templates, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(() => {
    try {
      const parsed = JSON.parse(templatesStr);
      setCanvaConfig({ accessToken: token, enabled, templates: parsed });
      setError(null);
      alert('Canva 配置已保存');
    } catch (e: any) {
      setError('模板配置 JSON 格式错误: ' + e.message);
    }
  }, [token, enabled, templatesStr, setCanvaConfig]);

  return (
    <div className="settings-content">
      <div className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <Paintbrush size={16} />
            Canva 集成配置 (Brand Templates)
          </div>
          <div className="settings-card-desc">
            配置 Canva Connect API，允许 AI 在生成时使用您的 Canva 品牌模板，获得降维打击的排版效果。
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="checkbox-label" style={{ fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            启用 Canva 混合渲染模式
          </label>
        </div>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label>Access Token (Bearer Token)</label>
          <input
            type="password"
            className="input-text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="您的 Canva API 访问令牌"
          />
          <div className="text-xs text-gray-500 mt-1">
            请前往 Canva Developers 平台申请应用并获取长期有效的 Token。
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label>版式到 Canva 模板 ID 映射 (JSON)</label>
          <textarea
            className="input-text"
            rows={8}
            value={templatesStr}
            onChange={(e) => setTemplatesStr(e.target.value)}
            placeholder={'{\n  "cover": "DAxxxxxx",\n  "two-column": "DAyyyyyy"\n}'}
            style={{ fontFamily: 'monospace' }}
          />
          <div className="text-xs text-gray-500 mt-1">
            键名为我们的版式名（如 cover, two-column），键值为 Canva 中对应的 Brand Template ID。
            模板中需提前定义好文本变量 (如 title, subtitle) 或图片变量。
          </div>
        </div>

        {error && (
          <div className="text-red-600 text-sm mt-2">{error}</div>
        )}

        <div className="mt-4">
          <button className="btn-primary" onClick={handleSave}>
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillsSection() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [skills, setSkills] = useState<import('../../skills').SkillPackage[]>([]);

  const refresh = useCallback(async () => {
    setErr(null);
    const all = await loadAllSkills();
    setSkills(all);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleZip = useCallback(async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const pkg = await importSkillFromZip(file);
      await saveUserSkill(pkg);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleMd = useCallback(async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const pkg = await importSkillFromMarkdown(file);
      await saveUserSkill(pkg);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return (
    <div className="settings-section">
      <div className="section-header">
        <h3>技能（/skill-name）</h3>
      </div>

      <p className="section-hint">
        支持内置技能与用户导入技能。你可以在聊天框输入 <code>/skill-name</code> 或 <code>/skill-name {'{...json}'}</code> 调用。
        Claude（Anthropic 协议）会优先走官方 tool_use/tool_result 模式。
      </p>

      <div className="provider-actions" style={{ padding: 0, marginBottom: 10 }}>
        <label className="btn-sm btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Upload size={12} />
          导入技能(zip)
          <input
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            disabled={busy}
            onChange={(e) => void handleZip(e.target.files?.[0])}
          />
        </label>

        <label className="btn-sm btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Upload size={12} />
          导入技能(md)
          <input
            type="file"
            accept=".md,text/markdown"
            style={{ display: 'none' }}
            disabled={busy}
            onChange={(e) => void handleMd(e.target.files?.[0])}
          />
        </label>

        <button className="btn-sm btn-ghost" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw size={12} /> 刷新
        </button>
      </div>

      {err && (
        <div className="form-error" style={{ marginBottom: 10 }}>
          <X size={12} />
          <span>{err}</span>
        </div>
      )}

      <div className="provider-group-label">技能列表</div>
      <div className="provider-list">
        {skills.length === 0 && (
          <div className="provider-card">
            <div className="provider-body">
              <div style={{ color: '#6B7280' }}>暂无技能。你可以导入 zip 或 markdown 技能文件。</div>
            </div>
          </div>
        )}

        {skills.map((s) => (
          <div key={s.meta.name} className="provider-card">
            <div className="provider-header" style={{ cursor: 'default' }}>
              <div className="provider-info">
                <span className="provider-name">{s.meta.title}</span>
                <span className="provider-badge">{s.meta.source}</span>
                <span className="provider-badge">{s.meta.name}</span>
              </div>
            </div>
            <div className="provider-body" style={{ paddingTop: 10 }}>
              <div style={{ color: '#6B7280', fontSize: 13, marginBottom: 10 }}>{s.meta.description}</div>
              <div className="provider-actions" style={{ paddingTop: 0 }}>
                <label className="btn-sm btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={12} />
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={async (e) => {
                      if (s.meta.source !== 'user') return;
                      setBusy(true);
                      try {
                        await saveUserSkill({ ...s, enabled: e.target.checked, meta: { ...s.meta, updatedAt: Date.now() } });
                        await refresh();
                      } finally {
                        setBusy(false);
                      }
                    }}
                    disabled={busy || s.meta.source !== 'user'}
                  />
                  启用
                </label>

                {s.meta.source === 'user' && (
                  <button
                    className="btn-sm btn-danger"
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await deleteUserSkill(s.meta.name);
                        await refresh();
                      } finally {
                        setBusy(false);
                      }
                    }}
                    disabled={busy}
                  >
                    <Trash2 size={12} /> 删除
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemesSection({
  themePacks,
  styleProfile,
  onAddPack,
  onRemovePack,
  onSetStyle,
  onClearStyle,
}: {
  themePacks: import('../../themes').ThemePack[];
  styleProfile: import('../../store').StyleProfile;
  onAddPack: (pack: import('../../themes').ThemePack) => void;
  onRemovePack: (id: string) => void;
  onSetStyle: (profile: Partial<import('../../store').StyleProfile>) => void;
  onClearStyle: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const themes = themeRegistry.all();

  const handleZip = useCallback(async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const pack = await importThemePackFromZip(file);
      onAddPack(pack);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [onAddPack]);

  const handlePptx = useCallback(async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const pack = await importThemePackFromPptx(file);
      onAddPack(pack);
      // 同时锁定为当前主题（更贴合“用户只能上传 pptx 模板”的用法）
      onSetStyle({
        locked: true,
        themeSpec: {
          themeName: pack.theme.id,
          primaryColor: pack.theme.primaryColor,
          backgroundColor: pack.theme.backgroundColor,
          accentColor: pack.theme.accentColor,
          fontFamily: pack.theme.fontFamily,
        },
      });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [onAddPack, onSetStyle]);

  const handleFolder = useCallback(async (files?: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const pack = await importThemePackFromFolder(files);
      onAddPack(pack);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [onAddPack]);

  return (
    <div className="settings-section">
      <div className="section-header">
        <h3>主题模板（Web 优先）</h3>
      </div>

      <p className="section-hint">
        你可以选择内置主题，也可以上传主题包（zip 或文件夹：theme.json + assets/）。
        主题会被 Style Wizard 与企业版逐页生成自动引用。
      </p>

      <p className="section-hint">
        关于 PPTX 模板：当前 Web 端会从 PPTX 中<strong>提取主题色/字体</strong>并用于生成；若你希望“真正基于模板母版/布局”生成，请在 PowerPoint/WPS 中先打开该模板文件，再通过插件进行逐页生成与替换（这是当前最稳定的企业级工作流）。
      </p>

      <div className="provider-actions" style={{ padding: 0, marginBottom: 10 }}>
        <label className="btn-sm btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Upload size={12} />
          上传 PPTX 模板
          <input
            type="file"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            style={{ display: 'none' }}
            disabled={busy}
            onChange={(e) => void handlePptx(e.target.files?.[0])}
          />
        </label>

        <label className="btn-sm btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Upload size={12} />
          上传主题包(zip)
          <input
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            disabled={busy}
            onChange={(e) => void handleZip(e.target.files?.[0])}
          />
        </label>

        <label className="btn-sm btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Upload size={12} />
          上传主题文件夹
          <input
            type="file"
            // @ts-ignore - webkitdirectory is non-standard but widely supported
            webkitdirectory="true"
            multiple
            style={{ display: 'none' }}
            disabled={busy}
            onChange={(e) => void handleFolder(e.target.files)}
          />
        </label>

        {styleProfile.locked && (
          <button className="btn-sm btn-danger" onClick={onClearStyle}>
            <Trash2 size={12} /> 清除已锁定风格
          </button>
        )}
      </div>

      {err && (
        <div className="form-error" style={{ marginBottom: 10 }}>
          <X size={12} />
          <span>{err}</span>
        </div>
      )}

      <div className="provider-group-label">可用主题（内置 + 已上传）</div>
      <div className="provider-list">
        {themes.map((t) => {
          const active = styleProfile.themeSpec?.themeName?.toLowerCase() === t.id
            || styleProfile.themeSpec?.themeName?.toLowerCase() === t.name.toLowerCase();
          return (
            <div key={t.id} className={`provider-card ${active ? 'active' : ''}`} style={{ cursor: 'default' }}>
              <div className="provider-header" style={{ cursor: 'default' }}>
                <div className="provider-info">
                  <span className="provider-name">{t.name}</span>
                  {active && <span className="badge-active">已选中</span>}
                  <span className="provider-badge" style={{ marginLeft: 8 }}>主色 {t.primaryColor}</span>
                  <span className="provider-badge">背景 {t.backgroundColor}</span>
                </div>
              </div>
              <div className="provider-body" style={{ paddingTop: 10 }}>
                <div className="provider-actions" style={{ paddingTop: 0 }}>
                  <button
                    className="btn-sm btn-primary"
                    onClick={() => onSetStyle({
                      locked: true,
                      themeSpec: {
                        themeName: t.id,
                        primaryColor: t.primaryColor,
                        backgroundColor: t.backgroundColor,
                        accentColor: t.accentColor,
                        fontFamily: t.fontFamily,
                      },
                    })}
                  >
                    设为默认主题
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {themePacks.length > 0 && (
        <>
          <div className="provider-group-label" style={{ marginTop: 14 }}>已上传主题包</div>
          <div className="provider-list">
            {themePacks.map((p) => (
              <div key={p.meta.id} className="provider-card">
                <div className="provider-header" style={{ cursor: 'default' }}>
                  <div className="provider-info">
                    <span className="provider-name">{p.meta.name}</span>
                    <span className="provider-badge">{p.meta.source}</span>
                  </div>
                </div>
                <div className="provider-body" style={{ paddingTop: 10 }}>
                  <div className="provider-actions" style={{ paddingTop: 0 }}>
                    <button className="btn-sm btn-danger" onClick={() => onRemovePack(p.meta.id)}>
                      <Trash2 size={12} /> 删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Providers ----

function ProvidersSection({
  activeProvider,
  providers,
  providerHealth,
  onSetActive,
  onUpdate,
  onRemove,
  onSetHealth,
  onOpenQuickSetup,
  onAddRelay,
}: {
  activeProvider: string;
  providers: Record<string, ProviderConfig>;
  providerHealth: Record<string, ProviderHealth>;
  onSetActive: (key: string) => void;
  onUpdate: (key: string, config: Partial<ProviderConfig>) => void;
  onRemove: (key: string) => void;
  onSetHealth: (key: string, health: ProviderHealth) => void;
  onOpenQuickSetup: () => void;
  onAddRelay: (kind: 'claude-relay' | 'openai-relay') => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // 自动对当前使用的 provider 做健康检查
  useEffect(() => {
    const config = providers[activeProvider];
    if (!config?.apiKey) return;

    let cancelled = false;
    let timer: any;

    const runHealthCheck = async () => {
      try {
        const svc = new AIService(config);
        const result = await svc.testConnection();
        if (cancelled) return;
        onSetHealth(activeProvider, {
          status: result.ok
            ? (result.latencyMs < 1500 ? 'healthy' : result.latencyMs < 3000 ? 'slow' : 'degraded')
            : 'down',
          latencyMs: result.latencyMs,
          lastChecked: Date.now(),
          errorMessage: result.errorMessage,
          model: result.model,
        });
      } catch { /* ignore */ }
    };

    const health = providerHealth[activeProvider];
    const stale = !health || (Date.now() - health.lastChecked > 120_000);
    if (stale) timer = setTimeout(runHealthCheck, 500);

    const interval = setInterval(runHealthCheck, 120_000);
    return () => { cancelled = true; clearTimeout(timer); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProvider]);

  const isUserAdded = (key: string) => key.includes('_') && key.split('_').length >= 3;

  // 分组：官方 vs 中转站
  const entries = Object.entries(providers);
  const officialEntries = entries.filter(([, c]) => isOfficialProvider(c.provider));
  const relayEntries = entries.filter(([, c]) => isRelayProvider(c.provider));

  return (
    <div className="settings-section">
      <div className="section-header">
        <h3>AI 服务配置</h3>
        <button className="btn-sm btn-primary" onClick={onOpenQuickSetup}>
          <Zap size={12} /> 快速配置
        </button>
      </div>

      <p className="section-hint">
        官方服务只需填 API Key；中转站可自定义 URL 和鉴权方式。
      </p>

      <div className="provider-group-label">官方服务</div>
      <div className="provider-list">
        {officialEntries.map(([key, config]) => (
          <ProviderCard
            key={key}
            providerKey={key}
            config={config}
            health={providerHealth[key]}
            isActive={key === activeProvider}
            isExpanded={key === expandedKey}
            onToggleExpand={() => setExpandedKey(expandedKey === key ? null : key)}
            onSetActive={() => onSetActive(key)}
            onUpdate={(updates) => onUpdate(key, updates)}
            onRemove={undefined}
            onSetHealth={(h) => onSetHealth(key, h)}
          />
        ))}
      </div>

      <div className="provider-group-label">
        中转站
        <div className="provider-group-actions">
          <button className="btn-sm btn-ghost" onClick={() => onAddRelay('claude-relay')}>
            <Plus size={11} /> Claude 中转
          </button>
          <button className="btn-sm btn-ghost" onClick={() => onAddRelay('openai-relay')}>
            <Plus size={11} /> OpenAI 中转
          </button>
        </div>
      </div>
      <div className="provider-list">
        {relayEntries.length === 0 ? (
          <div className="empty-hint">
            <Info size={14} />
            <span>还未添加中转站，点击上方按钮添加</span>
          </div>
        ) : (
          relayEntries.map(([key, config]) => (
            <ProviderCard
              key={key}
              providerKey={key}
              config={config}
              health={providerHealth[key]}
              isActive={key === activeProvider}
              isExpanded={key === expandedKey}
              onToggleExpand={() => setExpandedKey(expandedKey === key ? null : key)}
              onSetActive={() => onSetActive(key)}
              onUpdate={(updates) => onUpdate(key, updates)}
              onRemove={isUserAdded(key) ? () => onRemove(key) : undefined}
              onSetHealth={(h) => onSetHealth(key, h)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProviderCard({
  config,
  health,
  isActive,
  isExpanded,
  onToggleExpand,
  onSetActive,
  onUpdate,
  onRemove,
  onSetHealth,
}: {
  providerKey: string;
  config: ProviderConfig;
  health?: ProviderHealth;
  isActive: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSetActive: () => void;
  onUpdate: (updates: Partial<ProviderConfig>) => void;
  onRemove?: () => void;
  onSetHealth: (h: ProviderHealth) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTest = useCallback(async () => {
    setTesting(true);
    try {
      const svc = new AIService(config);
      const result = await svc.testConnection();
      onSetHealth({
        status: result.ok
          ? (result.latencyMs < 1500 ? 'healthy' : result.latencyMs < 3000 ? 'slow' : 'degraded')
          : 'down',
        latencyMs: result.latencyMs,
        lastChecked: Date.now(),
        errorMessage: result.errorMessage,
        model: result.model,
      });
    } catch (err: any) {
      onSetHealth({
        status: 'down',
        latencyMs: null,
        lastChecked: Date.now(),
        errorMessage: err?.message ?? String(err),
      });
    }
    setTesting(false);
  }, [config, onSetHealth]);

  const canEditBaseUrl = isFieldEditable(config.provider, 'baseUrl');
  const canEditAuthStyle = isFieldEditable(config.provider, 'authStyle');
  const isOfficial = isOfficialProvider(config.provider);

  return (
    <div className={`provider-card ${isActive ? 'active' : ''}`}>
      <div className="provider-header" onClick={onToggleExpand}>
        <div className="provider-info">
          <span className="provider-name">{config.label}</span>
          {isOfficial && <Lock size={9} className="icon-locked" />}
          {isActive && <span className="badge-active">当前使用</span>}
          {config.apiKey && !health && <Wifi size={12} className="icon-connected" />}
          <LatencyBadge health={health} testing={testing} compact />
        </div>
        <ChevronRight
          size={14}
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
        />
      </div>

      {isExpanded && (
        <div className="provider-body">
          <div className="form-group">
            <label>API Key</label>
            <div className="input-with-icon">
              <input
                type={showKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => onUpdate({ apiKey: e.target.value })}
                placeholder="sk-..."
              />
              <button className="btn-icon-sm" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>
              Base URL
              {!canEditBaseUrl && <Lock size={10} className="inline-lock-icon" />}
            </label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => canEditBaseUrl && onUpdate({ baseUrl: e.target.value })}
              placeholder="https://..."
              disabled={!canEditBaseUrl}
              className={!canEditBaseUrl ? 'input-locked' : ''}
            />
            {config.provider === 'claude-relay' && (
              <span className="form-help">
                填到根域名即可（如 <code>https://lanyiapi.com</code>），
                自动拼接 <code>/v1/messages</code>
              </span>
            )}
          </div>

          <div className="form-group">
            <label>模型</label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => onUpdate({ model: e.target.value })}
              placeholder="gpt-4o"
            />
          </div>

          <div className="form-group">
            <label>
              鉴权方式
              {!canEditAuthStyle && <Lock size={10} className="inline-lock-icon" />}
            </label>
            <select
              value={config.authStyle ?? 'bearer'}
              onChange={(e) => canEditAuthStyle && onUpdate({ authStyle: e.target.value as any })}
              disabled={!canEditAuthStyle}
              className={!canEditAuthStyle ? 'input-locked' : ''}
            >
              <option value="x-api-key">x-api-key (Anthropic 原生 / lanyiapi)</option>
              <option value="bearer">Bearer Token (OpenAI / AnyRouter / Claude Code)</option>
              <option value="api-key-param">URL 参数 (Google Gemini)</option>
            </select>
            {config.provider === 'claude-relay' && (
              <span className="form-help">
                <strong>lanyiapi.com 等主流中转</strong>用 x-api-key；
                <strong>AnyRouter / Claude Code</strong> 用 Bearer
              </span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group half">
              <label>温度</label>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature ?? 0.7}
                onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
              />
            </div>
            <div className="form-group half">
              <label>最大 Tokens</label>
              <input
                type="number"
                min="1"
                max="128000"
                step="100"
                value={config.maxTokens ?? ''}
                onChange={(e) => onUpdate({
                  maxTokens: e.target.value.trim() ? parseInt(e.target.value, 10) : undefined,
                })}
                placeholder="留空表示不限制"
              />
              <span className="form-help">留空表示不主动限制输出长度，适合长篇操作 JSON</span>
            </div>
          </div>

          {health?.status === 'down' && health.errorMessage && (
            <div className="form-error">
              <X size={12} />
              <span>{health.errorMessage}</span>
            </div>
          )}

          <div className="provider-actions">
            {!isActive && (
              <button className="btn-sm btn-primary" onClick={onSetActive}>
                设为默认
              </button>
            )}
            <button
              className="btn-sm btn-ghost"
              onClick={handleTest}
              disabled={testing || !config.apiKey}
            >
              {testing ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
              测试连接
            </button>
            {onRemove && (
              <button className="btn-sm btn-danger" onClick={onRemove}>
                <Trash2 size={12} /> 删除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- 添加中转站对话框 ----

function AddRelayDialog({
  kind,
  onAdd,
  onClose,
}: {
  kind: 'claude-relay' | 'openai-relay';
  onAdd: (key: string, config: ProviderConfig) => void;
  onClose: () => void;
}) {
  const tpl = RELAY_TEMPLATES[kind];
  const [label, setLabel] = useState(tpl.label ?? '');
  const [baseUrl, setBaseUrl] = useState(tpl.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(tpl.model ?? '');
  const [authStyle, setAuthStyle] = useState(tpl.authStyle ?? 'x-api-key');

  const handleSubmit = () => {
    if (!baseUrl || !apiKey) return;

    let hostname = 'relay';
    try { hostname = new URL(baseUrl).hostname.replace(/\./g, '_'); } catch {}
    const key = `${kind}_${hostname}_${Date.now().toString(36)}`;

    onAdd(key, {
      provider: kind as AIProvider,
      label: label || tpl.label!,
      apiKey,
      baseUrl,
      model,
      protocol: tpl.protocol!,
      authStyle,
      maxTokens: undefined,
      temperature: 0.7,
      enabled: true,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">
            <Plus size={16} />
            添加{tpl.label}
          </span>
          <button className="btn-icon-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">
          <p className="quick-setup-desc">{tpl.description}</p>

          <div className="form-group">
            <label>名称（随意）</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="我的中转"
            />
          </div>

          <div className="form-group">
            <label>Base URL</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={kind === 'claude-relay' ? 'https://lanyiapi.com' : 'https://your-relay.com/v1'}
            />
          </div>

          <div className="form-group">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
          </div>

          <div className="form-group">
            <label>模型</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={kind === 'claude-relay' ? 'claude-sonnet-4-20250514' : 'gpt-4o'}
            />
          </div>

          {kind === 'claude-relay' && (
            <div className="form-group">
              <label>鉴权方式</label>
              <select
                value={authStyle}
                onChange={(e) => setAuthStyle(e.target.value as any)}
              >
                <option value="x-api-key">x-api-key (lanyiapi 等主流)</option>
                <option value="bearer">Bearer Token (AnyRouter / Claude Code)</option>
              </select>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-sm btn-ghost" onClick={onClose}>取消</button>
          <button
            className="btn-sm btn-primary"
            onClick={handleSubmit}
            disabled={!baseUrl || !apiKey}
          >
            <Plus size={12} /> 添加
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- 代理配置 ----

function ProxySection({
  config,
  onChange,
}: {
  config: ProxyConfig;
  onChange: (config: ProxyConfig) => void;
}) {
  const [detecting, setDetecting] = useState(false);
  const [systemProxy, setSystemProxy] = useState<string | null>(null);

  const handleDetect = useCallback(async () => {
    setDetecting(true);
    try {
      const info = await detectSystemProxy();
      if (info?.httpsProxy || info?.httpProxy) {
        const proxyUrl = info.httpsProxy || info.httpProxy || '';
        setSystemProxy(proxyUrl);
        const parsed = parseProxyUrl(proxyUrl);
        onChange({
          ...config,
          enabled: true,
          mode: parsed.mode ?? 'http',
          host: parsed.host,
          port: parsed.port,
        });
      } else {
        setSystemProxy('未检测到系统代理');
      }
    } catch {
      setSystemProxy('检测失败（sidecar 未运行？）');
    }
    setDetecting(false);
  }, [config, onChange]);

  return (
    <div className="settings-section">
      <div className="section-header">
        <h3>网络代理</h3>
      </div>

      <div className="form-group">
        <label className="toggle-label">
          <span>启用代理</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
            />
            <span className="toggle-track"></span>
          </label>
        </label>
      </div>

      {config.enabled && (
        <>
          <div className="form-group">
            <label>代理模式</label>
            <select
              value={config.mode}
              onChange={(e) => onChange({ ...config, mode: e.target.value as ProxyConfig['mode'] })}
            >
              <option value="system">系统代理</option>
              <option value="http">HTTP 代理</option>
              <option value="socks5">SOCKS5 代理</option>
              <option value="pac">PAC 脚本</option>
            </select>
          </div>

          {config.mode === 'system' && (
            <div className="proxy-detect">
              <button className="btn-sm btn-ghost" onClick={handleDetect} disabled={detecting}>
                {detecting ? <Loader2 size={12} className="spin" /> : <Wifi size={12} />}
                检测系统代理
              </button>
              {systemProxy && <span className="proxy-info">{systemProxy}</span>}
            </div>
          )}

          {(config.mode === 'http' || config.mode === 'socks5') && (
            <>
              <div className="form-row">
                <div className="form-group flex-grow">
                  <label>地址</label>
                  <input
                    value={config.host ?? ''}
                    onChange={(e) => onChange({ ...config, host: e.target.value })}
                    placeholder="127.0.0.1"
                  />
                </div>
                <div className="form-group" style={{ width: 100 }}>
                  <label>端口</label>
                  <input
                    type="number"
                    value={config.port ?? (config.mode === 'http' ? 7890 : 1080)}
                    onChange={(e) => onChange({ ...config, port: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group half">
                  <label>用户名（可选）</label>
                  <input
                    value={config.username ?? ''}
                    onChange={(e) => onChange({ ...config, username: e.target.value })}
                  />
                </div>
                <div className="form-group half">
                  <label>密码（可选）</label>
                  <input
                    type="password"
                    value={config.password ?? ''}
                    onChange={(e) => onChange({ ...config, password: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}

          {config.mode === 'pac' && (
            <div className="form-group">
              <label>PAC 脚本 URL</label>
              <input
                value={config.pacUrl ?? ''}
                onChange={(e) => onChange({ ...config, pacUrl: e.target.value })}
                placeholder="http://127.0.0.1:1080/proxy.pac"
              />
            </div>
          )}
        </>
      )}

      <div className="proxy-tip">
        <p>代理模式说明：</p>
        <ul>
          <li><strong>系统代理</strong> — 自动使用操作系统代理</li>
          <li><strong>HTTP 代理</strong> — Clash / V2Ray（默认端口 7890）</li>
          <li><strong>SOCKS5 代理</strong> — SSH 隧道等（默认端口 1080）</li>
          <li><strong>PAC 脚本</strong> — 自动代理配置脚本</li>
        </ul>
      </div>
    </div>
  );
}
