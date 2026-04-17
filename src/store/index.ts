// ============================================================
//  全局状态管理 — Zustand Store
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChatMessage, ProviderConfig, ProxyConfig, ProviderHealth } from '../ai/types';
import type {
  PresentationInfo,
  SlideInfo,
  SelectionInfo,
  SlideOperation,
  OperationResult,
  SlideSnapshot,
} from '../adapters/interface';
import type { ParsedDocument } from '../parsers';
import type { ContextScope } from '../ai';
import { PROVIDER_PRESETS } from '../ai/types';
import type { ThemePack, ThemeSpec } from '../themes';
import { themeRegistry } from '../themes';

// ---- 类型 ----

export type ViewTab = 'chat' | 'outline' | 'preview' | 'settings' | 'documents' | 'history';

/** 聊天请求处理阶段 */
export type ChatStage =
  | 'idle'              // 空闲
  | 'reading_context'   // 读取 PPT 结构
  | 'sending'           // 发送请求
  | 'streaming'         // 流式生成中
  | 'parsing'           // 解析操作指令
  | 'ready'             // 等待用户确认
  | 'applying'          // 执行修改
  | 'done';             // 完成

export interface ChatProgress {
  stage: ChatStage;
  detail?: string;        // 具体描述
  startedAt: number;
  tokensReceived?: number;
}

/** 操作历史条目（一次 AI 交互产生的一批修改） */
export interface OperationHistoryEntry {
  id: string;
  timestamp: number;
  userMessage: string;
  aiResponse?: string;
  operations: SlideOperation[];
  results: OperationResult[];
  reverted?: boolean;
  pageNumber?: number;
  pageTitle?: string;
  snapshot?: SlideSnapshot;
  revertMode?: 'snapshot' | 'undo';
}

export interface EnterprisePageStatus {
  pageNumber: number;
  title: string;
  status: 'planned' | 'generating' | 'applying' | 'applied' | 'failed' | 'reverted';
  message?: string;
  failedCount?: number;
  historyEntryId?: string;
}

export interface ContextSnapshotMeta {
  scope: ContextScope;
  slideCount: number;
  currentSlideIndex: number | null;
  selectedShapeCount: number;
  documentCount: number;
  linkedMessageCount: number;
  recentOperationCount: number;
  capturedAt: number;
}

export interface StyleProfile {
  locked: boolean;
  optionId?: string;
  themeSpec?: ThemeSpec;
  languageTone?: 'default' | 'academic' | 'business' | 'teaching';
  tableStyle?: 'default' | 'academic' | 'finance' | 'teaching';
  layoutPreset?: 'standard' | 'defense' | 'report' | 'teaching';
  templateId?: string;
}

export type ClarificationKind = 'text' | 'select' | 'boolean' | 'template-select';

export interface TemplateOption {
  id: string;
  name: string;
  thumbnailUrl: string;
  base64?: string;
  url?: string;
}

export interface ClarificationItem {
  id: string;
  question: string;
  kind: ClarificationKind;
  options?: string[];
  templateOptions?: TemplateOption[];
  required?: boolean;
  answer: string;
}

export interface ClarificationSource {
  userText: string;
  userMessageId: string;
  capturedAt: number;
  contextSnapshot?: ContextSnapshotMeta;
}

export interface CanvaConfig {
  accessToken: string;
  enabled: boolean;
  templates: Record<string, string>; // e.g. cover -> DAxxxx
}

interface AppState {
  // ---- UI 状态 ----
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // ---- AI 配置 ----
  activeProvider: string;
  providers: Record<string, ProviderConfig>;
  setActiveProvider: (key: string) => void;
  updateProvider: (key: string, config: Partial<ProviderConfig>) => void;
  addProvider: (key: string, config: ProviderConfig) => void;
  removeProvider: (key: string) => void;

  // ---- Provider 健康状态 ----
  providerHealth: Record<string, ProviderHealth>;
  setProviderHealth: (key: string, health: ProviderHealth) => void;

  // ---- 代理 ----
  proxyConfig: ProxyConfig;
  setProxyConfig: (config: ProxyConfig) => void;

  // ---- 聊天 ----
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearMessages: () => void;

  // 细粒度进度
  chatProgress: ChatProgress;
  setChatProgress: (progress: Partial<ChatProgress>) => void;
  resetChatProgress: () => void;

  // 整体忙碌态（兼容旧接口）
  isStreaming: boolean;
  setStreaming: (v: boolean) => void;

  // ---- PPT 上下文 ----
  pptInfo: PresentationInfo | null;
  setPptInfo: (info: PresentationInfo | null) => void;
  activeSlideIndex: number;
  setActiveSlideIndex: (idx: number) => void;

  /** 当前页的完整详情（包括所有形状） */
  currentSlide: SlideInfo | null;
  setCurrentSlide: (slide: SlideInfo | null) => void;

  /** 当前选中的形状 */
  selection: SelectionInfo | null;
  setSelection: (sel: SelectionInfo | null) => void;

  /** AI 读取范围：全文 / 当前页 / 选中 */
  contextScope: ContextScope;
  setContextScope: (scope: ContextScope) => void;

  /** 最近一次发送给 AI 的 context token 数 */
  lastContextTokens: number;
  setLastContextTokens: (tokens: number) => void;
  lastContextSnapshot: ContextSnapshotMeta | null;
  setLastContextSnapshot: (snapshot: ContextSnapshotMeta | null) => void;

  // ---- 待应用操作 ----
  pendingOperations: SlideOperation[];
  setPendingOperations: (ops: SlideOperation[]) => void;

  // ---- 操作历史（可回滚） ----
  operationHistory: OperationHistoryEntry[];
  addHistoryEntry: (entry: OperationHistoryEntry) => void;
  markHistoryReverted: (id: string) => void;
  clearHistory: () => void;
  enterprisePageStatuses: EnterprisePageStatus[];
  setEnterprisePageStatuses: (statuses: EnterprisePageStatus[]) => void;
  updateEnterprisePageStatus: (pageNumber: number, updates: Partial<EnterprisePageStatus>) => void;
  clearEnterprisePageStatuses: () => void;

  // ---- 文档上下文 ----
  documents: ParsedDocument[];
  addDocument: (doc: ParsedDocument) => void;
  removeDocument: (fileName: string) => void;
  clearDocuments: () => void;

  // ---- 主题 / 风格 ----
  themePacks: ThemePack[];
  addThemePack: (pack: ThemePack) => void;
  removeThemePack: (id: string) => void;
  styleProfile: StyleProfile;
  setStyleProfile: (profile: Partial<StyleProfile>) => void;
  clearStyleProfile: () => void;

  // ---- 问题澄清（高级交互）----
  clarifications: ClarificationItem[];
  clarificationSource: ClarificationSource | null;
  setClarifications: (items: ClarificationItem[], source: ClarificationSource) => void;
  updateClarification: (id: string, patch: Partial<ClarificationItem>) => void;
  addClarification: (item?: Partial<ClarificationItem>) => void;
  removeClarification: (id: string) => void;
  clearClarifications: () => void;

  // ---- Canva 配置 ----
  canvaConfig: CanvaConfig;
  setCanvaConfig: (config: Partial<CanvaConfig>) => void;
}

// ---- 默认 Provider 配置 ----

function createDefaultProviders(): Record<string, ProviderConfig> {
  const providers: Record<string, ProviderConfig> = {};

  for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
    providers[key] = {
      provider: key as ProviderConfig['provider'],
      label: preset.label ?? key,
      apiKey: '',
      baseUrl: preset.baseUrl ?? '',
      model: preset.model ?? '',
      maxTokens: undefined,
      temperature: 0.7,
      enabled: false,
      protocol: preset.protocol,
      authStyle: preset.authStyle,
    };
  }

  return providers;
}

const initialProgress: ChatProgress = {
  stage: 'idle',
  startedAt: 0,
};

function normalizeProviders(providers: Record<string, ProviderConfig> | undefined): Record<string, ProviderConfig> {
  if (!providers) return createDefaultProviders();

  return Object.fromEntries(
    Object.entries(providers).map(([key, config]) => [
      key,
      {
        ...config,
        // 4096 是旧版本的硬编码默认值；迁移后留空表示不限制，避免长 JSON 操作被截断。
        maxTokens: config.maxTokens === 4096 ? undefined : config.maxTokens,
      },
    ]),
  );
}

// ---- Store ----

export const useStore = create<AppState>()(
  persist(
    (set, _get) => ({
      // UI
      activeTab: 'chat',
      setActiveTab: (tab) => set({ activeTab: tab }),
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // AI
      activeProvider: 'openai',
      providers: createDefaultProviders(),
      setActiveProvider: (key) => set({ activeProvider: key }),
      updateProvider: (key, config) =>
        set((s) => ({
          providers: {
            ...s.providers,
            [key]: { ...s.providers[key], ...config },
          },
        })),
      addProvider: (key, config) =>
        set((s) => ({
          providers: { ...s.providers, [key]: config },
        })),
      removeProvider: (key) =>
        set((s) => {
          const { [key]: _, ...rest } = s.providers;
          const { [key]: __, ...restHealth } = s.providerHealth;
          return { providers: rest, providerHealth: restHealth };
        }),

      // Health
      providerHealth: {},
      setProviderHealth: (key, health) =>
        set((s) => ({
          providerHealth: { ...s.providerHealth, [key]: health },
        })),

      // Canva Config
      canvaConfig: {
        accessToken: '',
        enabled: false,
        templates: {},
      },
      setCanvaConfig: (patch) => set((s) => ({ canvaConfig: { ...s.canvaConfig, ...patch } })),

      // Proxy
      proxyConfig: { enabled: false, mode: 'system' },
      setProxyConfig: (config) => set({ proxyConfig: config }),

      // Chat
      messages: [],
      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
      updateMessage: (id, updates) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, ...updates } : m,
          ),
        })),
      clearMessages: () => set({ messages: [] }),

      // Progress
      chatProgress: initialProgress,
      setChatProgress: (progress) =>
        set((s) => ({ chatProgress: { ...s.chatProgress, ...progress } })),
      resetChatProgress: () => set({ chatProgress: initialProgress }),

      isStreaming: false,
      setStreaming: (v) => set({ isStreaming: v }),

      // PPT
      pptInfo: null,
      setPptInfo: (info) => set({ pptInfo: info }),
      activeSlideIndex: 0,
      setActiveSlideIndex: (idx) => set({ activeSlideIndex: idx }),
      currentSlide: null,
      setCurrentSlide: (slide) => set({ currentSlide: slide }),
      selection: null,
      setSelection: (sel) => set({ selection: sel }),
      contextScope: 'current',        // 默认只读当前页（更省 tokens）
      setContextScope: (scope) => set({ contextScope: scope }),
      lastContextTokens: 0,
      setLastContextTokens: (tokens) => set({ lastContextTokens: tokens }),
      lastContextSnapshot: null,
      setLastContextSnapshot: (snapshot) => set({ lastContextSnapshot: snapshot }),

      // Operations
      pendingOperations: [],
      setPendingOperations: (ops) => set({ pendingOperations: ops }),

      // History
      operationHistory: [],
      addHistoryEntry: (entry) =>
        set((s) => ({ operationHistory: [entry, ...s.operationHistory].slice(0, 50) })),
      markHistoryReverted: (id) =>
        set((s) => ({
          operationHistory: s.operationHistory.map((h) =>
            h.id === id ? { ...h, reverted: true } : h,
          ),
        })),
      clearHistory: () => set({ operationHistory: [] }),
      enterprisePageStatuses: [],
      setEnterprisePageStatuses: (statuses) => set({ enterprisePageStatuses: statuses }),
      updateEnterprisePageStatus: (pageNumber, updates) =>
        set((s) => ({
          enterprisePageStatuses: s.enterprisePageStatuses.map((status) =>
            status.pageNumber === pageNumber ? { ...status, ...updates } : status,
          ),
        })),
      clearEnterprisePageStatuses: () => set({ enterprisePageStatuses: [] }),

      // Documents
      documents: [],
      addDocument: (doc) => set((s) => ({ documents: [...s.documents, doc] })),
      removeDocument: (fileName) =>
        set((s) => ({
          documents: s.documents.filter((d) => d.fileName !== fileName),
        })),
      clearDocuments: () => set({ documents: [] }),

      // Themes / Style
      themePacks: [],
      addThemePack: (pack) => set((s) => {
        try { themeRegistry.register(pack.theme); } catch { /* ignore */ }
        return {
          themePacks: [pack, ...s.themePacks.filter((p) => p.meta.id !== pack.meta.id)],
        };
      }),
      removeThemePack: (id) => set((s) => {
        try { themeRegistry.unregister(id); } catch { /* ignore */ }
        return { themePacks: s.themePacks.filter((p) => p.meta.id !== id) };
      }),
      styleProfile: { locked: false },
      setStyleProfile: (profile) => set((s) => ({ styleProfile: { ...s.styleProfile, ...profile } })),
      clearStyleProfile: () => set({ styleProfile: { locked: false } }),

      // Clarifications
      clarifications: [],
      clarificationSource: null,
      setClarifications: (items, source) => set({
        clarifications: items,
        clarificationSource: source,
      }),
      updateClarification: (id, patch) => set((s) => ({
        clarifications: s.clarifications.map((c) => c.id === id ? { ...c, ...patch } : c),
      })),
      addClarification: (item) => set((s) => ({
        clarifications: [
          ...s.clarifications,
          {
            id: item?.id ?? crypto.randomUUID(),
            question: item?.question ?? '（自定义问题）',
            kind: item?.kind ?? 'text',
            options: item?.options,
            required: item?.required ?? false,
            answer: item?.answer ?? '',
          },
        ],
      })),
      removeClarification: (id) => set((s) => ({
        clarifications: s.clarifications.filter((c) => c.id !== id),
      })),
      clearClarifications: () => set({
        clarifications: [],
        clarificationSource: null,
      }),
    }),
    {
      name: 'ai-ppt-plugin-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        try {
          state?.themePacks?.forEach((pack) => themeRegistry.register(pack.theme));
        } catch { /* ignore */ }
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState> | undefined;
        return {
          ...currentState,
          ...persisted,
          providers: normalizeProviders(persisted?.providers),
        };
      },
      partialize: (state) => ({
        activeProvider: state.activeProvider,
        providers: state.providers,
        proxyConfig: state.proxyConfig,
        contextScope: state.contextScope,
        themePacks: state.themePacks,
        styleProfile: state.styleProfile,
      }),
    },
  ),
);
