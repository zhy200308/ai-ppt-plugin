// ============================================================
//  ChatPanel — 聊天面板组件
//  集成: 流式响应 · 阶段进度指示器 · 快捷指令 · 操作历史
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import {
  AIService,
  extractTextContent,
  extractCompleteOperationsFromPartial,
  groupOperationsBySequentialSlide,
  hasOperationsStarted,
  isLikelyIncompleteOperations,
  parseOperations,
  parseStyleOptions,
  parseClarifications,
  shouldUseEnterprisePageMode,
} from '../../ai';
import { adapterRef } from '../App';
import type { ChatMessage } from '../../ai/types';
import type { SlideOperation, OperationResult } from '../../adapters/interface';
import type { OperationHistoryEntry } from '../../store';
import { captureSlideSnapshot } from '../../adapters/snapshot';
import { ProgressIndicator } from '../components/ProgressIndicator';
import { QuickActions } from '../components/QuickActions';
import { LatencyBadge } from '../components/LatencyBadge';
import { ContextScopeSelector } from '../components/ContextScopeSelector';
import { ClarificationPanel } from '../components/ClarificationPanel';
import { SCOPE_LABELS } from '../../ai';
import type { ContextScope } from '../../ai';
import { themeRegistry, resolveTheme } from '../../themes';
import { loadAllSkills } from '../../skills';
import type { PptContext } from '../../ai';
import {
  Send,
  Square,
  Loader2,
  Check,
  X,
  Play,
  AlertCircle,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

export function ChatPanel() {
  const {
    messages,
    addMessage,
    updateMessage,
    clearMessages,
    isStreaming,
    setStreaming,
    chatProgress,
    setChatProgress,
    resetChatProgress,
    pptInfo,
    setPptInfo,
    currentSlide,
    setCurrentSlide,
    selection,
    setSelection,
    contextScope,
    setContextScope,
    lastContextTokens,
    setLastContextTokens,
    lastContextSnapshot,
    setLastContextSnapshot,
    activeProvider,
    providers,
    providerHealth,
    documents,
    pendingOperations,
    setPendingOperations,
    operationHistory,
    addHistoryEntry,
    enterprisePageStatuses,
    setEnterprisePageStatuses,
    updateEnterprisePageStatus,
    clearEnterprisePageStatuses,
    styleProfile,
    setStyleProfile,
    clarifications,
    clarificationSource,
    setClarifications,
    updateClarification,
    addClarification,
    removeClarification,
    clearClarifications,
  } = useStore();

  const [input, setInput] = useState('');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [skills, setSkills] = useState<Array<{ name: string; title: string; description: string }>>([]);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [styleWizard, setStyleWizard] = useState<null | {
    userText: string;
    assistantId: string;
    options: NonNullable<ReturnType<typeof parseStyleOptions>>;
    selectedId: string | null;
    planContext: {
      aiService: AIService;
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
      pptContext: PptContext;
      docContext?: string;
      sessionContext?: string;
    };
  }>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserMsgRef = useRef<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoAppliedBatchCountRef = useRef(0);
  const autoApplyingRef = useRef(false);
  const autoAppliedBatchKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatProgress]);

  useEffect(() => {
    void (async () => {
      const all = await loadAllSkills();
      setSkills(all.map((s) => ({
        name: s.meta.name,
        title: s.meta.title,
        description: s.meta.description,
      })));
    })();
  }, []);

  const adjustHeight = useCallback(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, []);

  const collectWorkspaceContext = useCallback(async (opts?: { forceFull?: boolean; forceScope?: ContextScope }): Promise<PptContext> => {
    const capturedAt = Date.now();
    const store = useStore.getState();
    const scope = opts?.forceScope ?? (opts?.forceFull ? 'full' : contextScope);

    if (!adapterRef.current) {
      return {
        scope,
        presentation: store.pptInfo,
        currentSlide: store.currentSlide,
        selection: store.selection,
        capturedAt,
      };
    }

    const shouldRefreshPresentation = scope === 'full' || !store.pptInfo;
    const presentationPromise = shouldRefreshPresentation
      ? adapterRef.current.getPresentation()
      : Promise.resolve(store.pptInfo);

    const [presentation, currentSlide, selection] = await Promise.all([
      presentationPromise,
      adapterRef.current.getCurrentSlide(),
      adapterRef.current.getSelection(),
    ]);

    if (presentation) setPptInfo(presentation);
    setCurrentSlide(currentSlide);
    setSelection(selection);

    return {
      scope,
      presentation,
      currentSlide,
      selection,
      capturedAt,
    };
  }, [contextScope, setPptInfo, setCurrentSlide, setSelection]);

  const buildSessionContext = useCallback((
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    pptContext: PptContext,
  ): string | undefined => {
    const sections: string[] = [];

    const recentTurns = history.slice(-6);
    if (recentTurns.length > 0) {
      sections.push('### 最近对话\n' + recentTurns
        .map((m, idx) => `${idx + 1}. ${m.role === 'user' ? '用户' : 'AI'}: ${m.content.slice(0, 240)}`)
        .join('\n'));
    }

    const recentOps = operationHistory
      .filter((entry) => !entry.reverted)
      .slice(0, 3);
    if (recentOps.length > 0) {
      sections.push('### 最近已应用修改\n' + recentOps
        .map((entry, idx) => `${idx + 1}. 指令: ${entry.userMessage.slice(0, 120)}；操作数: ${entry.operations.length}`)
        .join('\n'));
    }

    const focusInfo: string[] = [];
    if (pptContext.presentation?.slideCount) {
      focusInfo.push(`总页数 ${pptContext.presentation.slideCount} 页`);
    }
    if (pptContext.currentSlide) {
      focusInfo.push(`当前活动页 第 ${pptContext.currentSlide.index + 1} 页`);
    }
    if (pptContext.selection?.hasSelection) {
      focusInfo.push(`当前选中 ${pptContext.selection.shapes.length} 个元素`);
    }
    if (focusInfo.length > 0) {
      sections.push('### 当前编辑焦点\n' + focusInfo.map((item) => `- ${item}`).join('\n'));
    }

    return sections.length > 0 ? sections.join('\n\n') : undefined;
  }, [operationHistory]);

  const autoContinueOperations = useCallback(async (
    aiService: AIService,
    rawText: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    pptContext: PptContext,
    docContext?: string,
    sessionContext?: string,
  ): Promise<string> => {
    let combined = rawText;
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!isLikelyIncompleteOperations(combined)) break;

      setChatProgress({
        stage: 'parsing',
        detail: `检测到操作输出被截断，正在自动补全（${attempt}/${maxAttempts}）...`,
      });

      const tail = combined.slice(-4000);
      const continuation = await aiService.chat(
        [
          '你上一条回复中的 json:operations 操作数组已经开始输出，但内容被截断了。',
          '请严格从中断位置继续补完剩余 JSON 内容。',
          '要求：',
          '1. 不要重复前面已经输出的内容；',
          '2. 不要解释，不要总结，不要加自然语言；',
          '3. 如果前文已经输出了代码块开头，则不要重新输出开头说明；',
          '4. 只输出剩余的 JSON 片段，直到整个数组和代码块闭合。',
          '',
          '下面是上一条回复的末尾片段，请从这里继续：',
          tail,
        ].join('\n'),
        [...history.slice(-4), { role: 'assistant', content: tail }],
        pptContext,
        docContext,
        sessionContext,
      );

      const continuationRaw = continuation.response.content.trim();
      if (!continuationRaw) break;

      combined = `${combined}\n${continuationRaw}`;
      if (parseOperations(combined).length > 0) break;
    }

    return combined;
  }, [setChatProgress]);

  const applyOperationBatch = useCallback(async (
    ops: SlideOperation[],
    options?: {
      userMessage?: string;
      aiResponse?: string;
      progressDetail?: string;
      markAsPendingOnFailure?: boolean;
      historyMeta?: Partial<OperationHistoryEntry>;
    },
  ): Promise<{ results: OperationResult[]; entry: OperationHistoryEntry | null }> => {
    if (!adapterRef.current || ops.length === 0) return { results: [], entry: null };

    if (options?.progressDetail) {
      setChatProgress({
        stage: 'applying',
        startedAt: Date.now(),
        detail: options.progressDetail,
      });
    }

    const results = await adapterRef.current.executeBatch(ops);
    const entry: OperationHistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      userMessage: options?.userMessage ?? (lastUserMsgRef.current || '(未知指令)'),
      aiResponse: options?.aiResponse,
      operations: ops,
      results,
      ...options?.historyMeta,
    };
    addHistoryEntry(entry);

    const failed = results.filter((r) => !r.success);
    if (failed.length > 0 && options?.markAsPendingOnFailure) {
      setPendingOperations(failed.map((item) => item.operation));
    }

    return { results, entry };
  }, [addHistoryEntry, setChatProgress, setPendingOperations]);

  const autoApplyStreamedBatches = useCallback(async (
    rawText: string,
    finalPass: boolean,
    options: {
      userMessage: string;
      aiResponse?: string;
    },
  ) => {
    if (autoApplyingRef.current) return;

    const completeOps = extractCompleteOperationsFromPartial(rawText);
    if (completeOps.length === 0) return;

    const batches = groupOperationsBySequentialSlide(completeOps);
    const stableBatches = finalPass ? batches : batches.slice(0, -1);
    if (stableBatches.length <= autoAppliedBatchCountRef.current) return;

    autoApplyingRef.current = true;
    try {
      for (let i = autoAppliedBatchCountRef.current; i < stableBatches.length; i++) {
        const batch = stableBatches[i];
        const label = batch.slideIndex !== null ? `第 ${batch.slideIndex + 1} 页` : '全局操作';
        const batchSignature = JSON.stringify(batch.operations);
        if (autoAppliedBatchKeysRef.current.has(batchSignature)) {
          autoAppliedBatchCountRef.current = i + 1;
          continue;
        }

        autoAppliedBatchKeysRef.current.add(batchSignature);
        const { results } = await applyOperationBatch(batch.operations, {
          userMessage: `${options.userMessage} · 自动应用 ${label}`,
          aiResponse: options.aiResponse,
          progressDetail: `${label} 自动应用中...`,
          markAsPendingOnFailure: true,
        });

        const failed = results.filter((r) => !r.success).length;
        setChatProgress({
          stage: failed > 0 ? 'ready' : 'applying',
          detail: failed > 0 ? `${label} 自动应用部分失败，请检查后驳回或重试` : `${label} 已自动应用`,
        });

        autoAppliedBatchCountRef.current = i + 1;
        await collectWorkspaceContext({ forceFull: true });
      }
    } finally {
      autoApplyingRef.current = false;
    }
  }, [applyOperationBatch, collectWorkspaceContext, setChatProgress]);

  const runEnterprisePageGeneration = useCallback(async (
    aiService: AIService,
    userText: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    initialContext: PptContext,
    docContext: string | undefined,
    sessionContext: string | undefined,
    assistantId: string,
    lockedStyle?: typeof styleProfile,
  ) => {
    setChatProgress({
      stage: 'sending',
      startedAt: Date.now(),
      detail: '企业模式 · 生成页级蓝图...',
    });

    const styleForAI = lockedStyle?.locked
      ? {
        themeSpec: lockedStyle.themeSpec,
        languageTone: lockedStyle.languageTone,
        tableStyle: lockedStyle.tableStyle,
        layoutPreset: lockedStyle.layoutPreset,
      }
      : undefined;

    const { plan } = await aiService.generateDeckPlan(
      userText,
      history,
      initialContext,
      docContext,
      sessionContext,
      styleForAI,
    );

    // 将页级计划提炼出的主题同步到适配器（WebPptxAdapter 会使用它做默认样式/插件布局）
    try {
      (adapterRef.current as any)?.setTheme?.(plan.theme);
    } catch {
      // ignore
    }

      const pages = plan.pages.slice(0, plan.totalPages);
      setEnterprisePageStatuses(
        pages.map((page) => ({
          pageNumber: page.pageNumber,
          title: page.title,
          status: 'planned',
          message: '等待生成',
        })),
      );
    const themeSummary = [
      plan.theme.themeName,
      plan.theme.styleSummary,
      plan.theme.primaryColor ? `主色 ${plan.theme.primaryColor}` : '',
      plan.theme.fontFamily ? `字体 ${plan.theme.fontFamily}` : '',
    ].filter(Boolean).join(' · ');

    updateMessage(assistantId, {
      content: [
        '企业版按页生成中',
        `主题：${themeSummary || '已生成页级主题蓝图'}`,
        `计划页数：${pages.length} 页`,
        '状态：准备逐页生成并自动应用',
      ].join('\n'),
      streaming: true,
    });

    const failedOps: SlideOperation[] = [];
    const executionHistory = [...history];

    for (let idx = 0; idx < pages.length; idx++) {
      const page = pages[idx];
      updateEnterprisePageStatus(page.pageNumber, {
        status: 'generating',
        message: `正在生成第 ${page.pageNumber} 页`,
      });
      const currentContext = await collectWorkspaceContext({ forceFull: true });
      const currentSessionContext = buildSessionContext(executionHistory, currentContext);

      setChatProgress({
        stage: 'sending',
        startedAt: Date.now(),
        detail: `企业模式 · 生成第 ${page.pageNumber}/${pages.length} 页：${page.title}`,
      });

      const pageResult = await aiService.generatePageOperations(
        userText,
        plan,
        page,
        executionHistory.slice(-8),
        currentContext,
        docContext,
        currentSessionContext,
        styleForAI,
      );

      if (pageResult.operations.length === 0) {
        updateEnterprisePageStatus(page.pageNumber, {
          status: 'failed',
          message: '未生成有效操作',
          failedCount: 1,
        });
        throw new Error(`第 ${page.pageNumber} 页未生成有效操作`);
      }

      updateEnterprisePageStatus(page.pageNumber, {
        status: 'applying',
        message: `正在应用第 ${page.pageNumber} 页`,
      });

      const snapshot = await captureSlideSnapshot(adapterRef.current!, page.pageNumber - 1);
      const { results, entry } = await applyOperationBatch(pageResult.operations, {
        userMessage: `${userText} · 企业版第 ${page.pageNumber} 页 · ${page.title}`,
        aiResponse: pageResult.text || pageResult.response.content,
        progressDetail: `企业模式 · 应用第 ${page.pageNumber}/${pages.length} 页：${page.title}`,
        markAsPendingOnFailure: true,
        historyMeta: {
          pageNumber: page.pageNumber,
          pageTitle: page.title,
          snapshot,
          revertMode: 'snapshot',
        },
      });

      const pageFailures = results.filter((item) => !item.success).map((item) => item.operation);
      failedOps.push(...pageFailures);
      updateEnterprisePageStatus(page.pageNumber, {
        status: pageFailures.length > 0 ? 'failed' : 'applied',
        message: pageFailures.length > 0 ? `本页失败 ${pageFailures.length} 项` : '本页已自动应用',
        failedCount: pageFailures.length,
        historyEntryId: entry?.id,
      });

      executionHistory.push({
        role: 'assistant',
        content: `第 ${page.pageNumber} 页《${page.title}》已处理，成功 ${results.length - pageFailures.length} 项，失败 ${pageFailures.length} 项`,
      });

      updateMessage(assistantId, {
        content: [
          '企业版按页生成中',
          `主题：${themeSummary || '已生成页级主题蓝图'}`,
          `进度：${idx + 1} / ${pages.length}`,
          `当前页：第 ${page.pageNumber} 页《${page.title}》`,
          pageFailures.length > 0
            ? `结果：本页有 ${pageFailures.length} 项失败，已保留待处理`
            : '结果：本页已自动应用',
        ].join('\n'),
      });
    }

    updateMessage(assistantId, {
      content: [
        '企业版按页生成完成',
        `主题：${themeSummary || '已生成页级主题蓝图'}`,
        `总页数：${pages.length}`,
        failedOps.length > 0
          ? `剩余待处理操作：${failedOps.length} 项`
          : '所有页面已自动应用完成',
      ].join('\n'),
      streaming: false,
      operations: failedOps.length > 0 ? failedOps : undefined,
    });

    setPendingOperations(failedOps);
    setChatProgress({
      stage: failedOps.length > 0 ? 'ready' : 'done',
      startedAt: Date.now(),
      detail: failedOps.length > 0
        ? `企业模式完成，剩余 ${failedOps.length} 项待确认`
        : `企业模式完成，${pages.length} 页已全部自动应用`,
    });

    if (failedOps.length === 0) {
      setTimeout(() => resetChatProgress(), 1800);
    }
  }, [
    applyOperationBatch,
    buildSessionContext,
    collectWorkspaceContext,
    clearEnterprisePageStatuses,
    resetChatProgress,
    setChatProgress,
    setEnterprisePageStatuses,
    setPendingOperations,
    updateMessage,
    updateEnterprisePageStatus,
  ]);

  // ---- Send message ----

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isStreaming) return;
    // 有澄清问题时，不允许再次发送（必须先点击“继续生成”）
    // 注意：点击“继续生成”会通过 overrideText 触发下一轮，此时需要绕过该守卫
    if (!overrideText && clarifications.length > 0) return;

    const config = providers[activeProvider];
    if (!config?.apiKey) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '请先在"设置"里配置 API Key。可以点击"快速配置"按钮粘贴环境变量一键导入。',
        timestamp: Date.now(),
      });
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    lastUserMsgRef.current = text;
    clearEnterprisePageStatuses();

    if (!overrideText) {
      setInput('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
    }

    const assistantId = crypto.randomUUID();
    addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    });

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    autoAppliedBatchCountRef.current = 0;
    autoApplyingRef.current = false;
    autoAppliedBatchKeysRef.current = new Set();

    const startedAt = Date.now();
    setChatProgress({
      stage: 'reading_context',
      startedAt,
        detail: `读取 ${(text.trim().startsWith('/') ? '当前页（技能模式）' : '整个 PPT')}...`,
    });

    try {
      const history = messages
        .filter((m) => m.role !== 'system' && m.id !== assistantId)
        .slice(-10)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // 普通生成/修改：强制全量上下文；Slash 命令（/skill-name）：只取当前页上下文，避免 Claude tools 请求过长
      const isSlashCommand = text.trim().startsWith('/');
      const pptContext = await collectWorkspaceContext(isSlashCommand ? { forceScope: 'current' } : { forceScope: 'full' });
      const sessionContext = buildSessionContext(history, pptContext);

      setLastContextSnapshot({
        scope: pptContext.scope,
        slideCount: pptContext.presentation?.slideCount ?? pptInfo?.slideCount ?? 0,
        currentSlideIndex: pptContext.currentSlide?.index ?? null,
        selectedShapeCount: pptContext.selection?.hasSelection ? pptContext.selection.shapes.length : 0,
        documentCount: documents.length,
        linkedMessageCount: history.length,
        recentOperationCount: operationHistory.filter((entry) => !entry.reverted).slice(0, 3).length,
        capturedAt: pptContext.capturedAt ?? Date.now(),
      });

      setChatProgress({
        stage: 'sending',
        detail: `已读取 · 准备发送`,
      });

      const aiService = new AIService(config);
      // Web 端：把当前 provider 配置同步给适配器，用于 bg-image 等图片生成插件
      try {
        (adapterRef.current as any)?.setImageConfig?.(config);
      } catch {
        // ignore
      }

      const docContext = documents.length > 0
        ? documents
          .map((d) => `--- ${d.fileName} (${d.fileType}) ---\n${d.textContent}`)
          .join('\n\n')
        : undefined;

      // ---- Style Wizard（生成前风格决策）----
      const wantEnterprise = shouldUseEnterprisePageMode(text, pptContext);
      const emptyDeck = (pptContext.presentation?.slideCount ?? 0) <= 1;

      if (wantEnterprise && emptyDeck && !styleProfile.locked) {
        setChatProgress({
          stage: 'sending',
          startedAt: Date.now(),
          detail: '生成前风格决策：正在生成 3 套主题/排版方案...',
        });

        const styleResp = await aiService.generateStyleOptions(
          text,
          history,
          pptContext,
          docContext,
          sessionContext,
        );

        const options = styleResp.result;
        const recommended = options.recommendedId || options.options[0]?.id;

        updateMessage(assistantId, {
          content: [
            '已生成 3 套风格方案，请在右侧（设置→主题模板）或下方卡片中选择后再开始逐页生成。',
            '（你也可以直接点“应用推荐方案”）',
          ].join('\n'),
          streaming: false,
        });

        setStyleWizard({
          userText: text,
          assistantId,
          options,
          selectedId: recommended ?? null,
          planContext: {
            aiService,
            history,
            pptContext,
            docContext,
            sessionContext,
          },
        });

        setChatProgress({ stage: 'ready', detail: '等待选择风格方案' });
        setStreaming(false);
        abortRef.current = null;
        return;
      }

      if (wantEnterprise) {
        await runEnterprisePageGeneration(
          aiService,
          text,
          history,
          pptContext,
          docContext,
          sessionContext,
          assistantId,
          styleProfile,
        );
        return;
      }

      let accumulated = '';
      let tokenCount = 0;
      let firstToken = true;

      await aiService.chatStream(
        text,
        history,
        {
          onContextReady: ({ tokens, scope }) => {
            setLastContextTokens(tokens);
            setChatProgress({
              stage: 'sending',
              detail: `发送中 · ${scope === 'full' ? '整个 PPT' : scope === 'current' ? '当前页' : '选中内容'} · ~${tokens.toLocaleString()} tokens`,
            });
          },
          onToken: (token) => {
            if (firstToken) {
              firstToken = false;
              setChatProgress({
                stage: 'streaming',
                detail: 'AI 正在生成内容',
                tokensReceived: 0,
              });
            }
            accumulated += token;
            tokenCount += Math.max(1, Math.round(token.length / 4));
            updateMessage(assistantId, { content: accumulated });
            void autoApplyStreamedBatches(accumulated, false, {
              userMessage: lastUserMsgRef.current,
              aiResponse: accumulated,
            });
            if (tokenCount % 20 === 0) {
              setChatProgress({ tokensReceived: tokenCount });
            }
          },
          onComplete: () => {},
          onCompleteRaw: async (rawText, cleanText) => {
            setChatProgress({
              stage: 'parsing',
              detail: '解析操作指令...',
              tokensReceived: tokenCount,
            });

            const completedRawText = hasOperationsStarted(rawText) && isLikelyIncompleteOperations(rawText)
              ? await autoContinueOperations(aiService, rawText, history, pptContext, docContext, sessionContext)
              : rawText;

            const finalCleanText = extractTextContent(completedRawText) || cleanText || completedRawText;
            await autoApplyStreamedBatches(completedRawText, true, {
              userMessage: lastUserMsgRef.current,
              aiResponse: finalCleanText,
            });
            const ops = parseOperations(completedRawText);
            const questions = parseClarifications(completedRawText);

            updateMessage(assistantId, {
              content: finalCleanText,
              streaming: false,
              operations: undefined,
            });

            if (ops.length > 0) {
              const autoAppliedCount = groupOperationsBySequentialSlide(extractCompleteOperationsFromPartial(completedRawText))
                .slice(0, autoAppliedBatchCountRef.current)
                .reduce((sum, batch) => sum + batch.operations.length, 0);
              const remainingOps = ops.slice(autoAppliedCount);
              updateMessage(assistantId, {
                operations: remainingOps.length > 0 ? remainingOps : undefined,
              });
              setPendingOperations(remainingOps);
              setChatProgress({
                stage: remainingOps.length > 0 ? 'ready' : 'done',
                detail: remainingOps.length > 0
                  ? `已自动应用 ${autoAppliedBatchCountRef.current} 页，剩余 ${remainingOps.length} 项待确认`
                  : `已自动应用 ${autoAppliedBatchCountRef.current} 页，全部完成`,
                tokensReceived: tokenCount,
              });
              if (remainingOps.length === 0) {
                setTimeout(() => resetChatProgress(), 1800);
              }
            } else {
              if (questions?.questions?.length) {
                // 进入“待确认问题”流程：在输入框上方展示问题列表，用户填写后继续生成
                setClarifications(
                  questions.questions.map((q) => ({
                    id: q.id,
                    question: q.question,
                    kind: q.kind,
                    options: q.options,
                    required: q.required,
                    answer: '',
                  })),
                  {
                    userText: lastUserMsgRef.current,
                    userMessageId: userMsg.id,
                    capturedAt: Date.now(),
                    contextSnapshot: lastContextSnapshot ?? undefined,
                  },
                );
                updateMessage(assistantId, {
                  content: finalCleanText || '需要你确认一些信息后才能继续生成（请在下方问题列表填写）。',
                });
                setChatProgress({ stage: 'ready', detail: '等待回答问题' });
              } else {
                setChatProgress({
                  stage: 'done',
                  detail: hasOperationsStarted(completedRawText)
                    ? '检测到操作输出但未能完整解析，建议改用分批生成'
                    : '未解析到可执行操作，已返回文本建议',
                  tokensReceived: tokenCount,
                });
                setTimeout(() => resetChatProgress(), 1500);
              }
            }
          },
          onError: (err) => {
            updateMessage(assistantId, {
              content: `出错了: ${err.message}`,
              streaming: false,
            });
            setChatProgress({ stage: 'done', detail: '出错' });
            setTimeout(() => resetChatProgress(), 2000);
          },
          onOperations: () => {},
        },
        pptContext,
        docContext,
        sessionContext,
        controller.signal,
        styleProfile.locked
          ? {
            themeSpec: styleProfile.themeSpec,
            languageTone: styleProfile.languageTone,
            tableStyle: styleProfile.tableStyle,
            layoutPreset: styleProfile.layoutPreset,
          }
          : undefined,
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        updateMessage(assistantId, {
          content: `请求失败: ${err.message}`,
          streaming: false,
        });
      }
      setChatProgress({ stage: 'done' });
      setTimeout(() => resetChatProgress(), 1500);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [
    input, isStreaming, providers, activeProvider, messages,
    documents, contextScope, addMessage, updateMessage, setStreaming,
    setPendingOperations, collectWorkspaceContext, buildSessionContext, setChatProgress, resetChatProgress,
    setLastContextTokens, setLastContextSnapshot, pptInfo, operationHistory,
    autoContinueOperations, autoApplyStreamedBatches, runEnterprisePageGeneration, clearEnterprisePageStatuses,
    styleProfile, setStyleProfile,
  ]);

  const applyStyleAndGenerate = useCallback(async (mode: 'recommended' | 'selected') => {
    if (!styleWizard) return;
    const pickedId = mode === 'recommended'
      ? (styleWizard.options.recommendedId || styleWizard.options.options[0]?.id)
      : styleWizard.selectedId;
    const picked = styleWizard.options.options.find((o: any) => o.id === pickedId);
    if (!picked) return;

    // 锁定风格到 store（后续所有生成/修改都遵守）
    setStyleProfile({
      locked: true,
      optionId: picked.id,
      themeSpec: picked.theme,
      languageTone: picked.languageTone,
      tableStyle: picked.tableStyle,
      layoutPreset: picked.layoutPreset,
    });

    // Web 适配器可即时应用主题
    try {
      (adapterRef.current as any)?.setTheme?.(picked.theme);
    } catch { /* ignore */ }

    // 清掉 wizard UI 并开始逐页生成
    const ctx = styleWizard.planContext;
    setStyleWizard(null);
    clearEnterprisePageStatuses();

    // 重新插入一个 assistant message 用于展示企业模式进度
    const assistantId = crypto.randomUUID();
    addMessage({
      id: assistantId,
      role: 'assistant',
      content: '已锁定风格方案，开始逐页生成...',
      timestamp: Date.now(),
      streaming: true,
    });

    setStreaming(true);
    await runEnterprisePageGeneration(
      ctx.aiService,
      styleWizard.userText,
      ctx.history,
      ctx.pptContext,
      ctx.docContext,
      ctx.sessionContext,
      assistantId,
      {
        locked: true,
        optionId: picked.id,
        themeSpec: picked.theme,
        languageTone: picked.languageTone,
        tableStyle: picked.tableStyle,
        layoutPreset: picked.layoutPreset,
      } as any,
    );
  }, [
    addMessage,
    clearEnterprisePageStatuses,
    runEnterprisePageGeneration,
    setStyleProfile,
    setStreaming,
    styleWizard,
  ]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setChatProgress({ stage: 'done', detail: '已中断' });
    setTimeout(() => resetChatProgress(), 1000);
  }, [setStreaming, setChatProgress, resetChatProgress]);

  // ---- Apply operations ----

  const handleApplyOperations = useCallback(async (ops: SlideOperation[]) => {
    if (!adapterRef.current) return;

    setChatProgress({
      stage: 'applying',
      startedAt: Date.now(),
      detail: `执行 ${ops.length} 项修改...`,
    });

    try {
      const { results } = await applyOperationBatch(ops, {
        userMessage: lastUserMsgRef.current || '(未知指令)',
        aiResponse: [...messages].reverse().find((m) => m.role === 'assistant')?.content,
      });

      // 记录到历史
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `已执行 ${results.length} 项操作: ${succeeded} 项成功${failed > 0 ? `, ${failed} 项失败` : ''}`,
        timestamp: Date.now(),
      });

      await collectWorkspaceContext({ forceFull: true });
      setPendingOperations([]);

      setChatProgress({ stage: 'done', detail: '修改已应用' });
      setTimeout(() => resetChatProgress(), 2000);
    } catch (err: any) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `执行操作失败: ${err.message}`,
        timestamp: Date.now(),
      });
      setChatProgress({ stage: 'done', detail: '执行失败' });
      setTimeout(() => resetChatProgress(), 2000);
    }
  }, [messages, applyOperationBatch, addMessage, collectWorkspaceContext, setPendingOperations, setChatProgress, resetChatProgress]);

  // ---- Keyboard ----

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 有澄清问题时，回车不触发发送（必须点击“继续生成”）
    if (clarifications.length > 0) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ---- Quick action ----

  const handleQuickAction = useCallback((prompt: string) => {
    setShowQuickActions(false);
    handleSend(prompt);
  }, [handleSend]);

  const handleContinueFromClarifications = useCallback(() => {
    if (!clarificationSource || clarifications.length === 0) return;
    const missing = clarifications.some((c) => c.required && !c.answer.trim());
    if (missing) return;

    // 若问题中包含主题选择，则锁定主题并立刻应用到 Web 适配器（可视化预览一致）
    const themeAnswer = clarifications.find((c) =>
      c.id.toLowerCase().includes('theme') || c.question.includes('主题') || c.question.includes('模板') || c.question.includes('模版'),
    )?.answer?.trim();
    if (themeAnswer) {
      const def = themeRegistry.get(themeAnswer) ?? themeRegistry.get(themeAnswer.toLowerCase());
      if (def) {
        const themeSpec = {
          themeName: def.id,
          primaryColor: def.primaryColor,
          backgroundColor: def.backgroundColor,
          accentColor: def.accentColor,
          fontFamily: def.fontFamily,
        };
        setStyleProfile({ locked: true, themeSpec });
        try { (adapterRef.current as any)?.setTheme?.(themeSpec); } catch { /* ignore */ }
      }
    }

    const confirmed = clarifications
      .map((c) => `- ${c.question.trim()}: ${c.answer.trim()}`)
      .join('\n');
    const nextPrompt = `${clarificationSource.userText}\n\n## 已确认信息（请严格遵守）\n${confirmed}\n`;

    setChatProgress({ stage: 'sending', detail: '已提交答案 · 继续生成...' });
    clearClarifications();
    handleSend(nextPrompt);
  }, [clarificationSource, clarifications, clearClarifications, handleSend, setChatProgress, setStyleProfile]);

  const currentHealth = providerHealth[activeProvider];

  return (
    <div className="chat-panel">
      {/* 读取范围选择器 - 始终显示在顶部 */}
      <ContextScopeSelector
        scope={contextScope}
        onChange={setContextScope}
        pptInfo={pptInfo}
        currentSlide={currentSlide}
        selection={selection}
        lastTokens={lastContextTokens}
      />

      <div className="chat-messages" ref={scrollRef}>
        {styleWizard && (
          <div className="ops-panel" style={{ marginBottom: 10 }}>
            <div className="ops-header">
              <span className="ops-title">
                <Sparkles size={14} />
                生成前风格方案（请选择其一）
              </span>
            </div>
            <div className="enterprise-page-list" style={{ padding: 10 }}>
              {styleWizard.options.options.map((opt: any) => (
                <div
                  key={opt.id}
                  className={`enterprise-page-item ${styleWizard.selectedId === opt.id ? 'status-applied' : 'status-planned'}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setStyleWizard((s) => s ? ({ ...s, selectedId: opt.id }) : s)}
                >
                  <div className="enterprise-page-main">
                    <span className="enterprise-page-index">{opt.id}</span>
                    <span className="enterprise-page-title">{opt.name}</span>
                  </div>
                  <span className="enterprise-page-message">
                    {opt.summary}
                    {opt.theme?.primaryColor ? ` · 主色 ${opt.theme.primaryColor}` : ''}
                    {opt.theme?.backgroundColor ? ` · 背景 ${opt.theme.backgroundColor}` : ''}
                    {opt.theme?.fontFamily ? ` · 字体 ${opt.theme.fontFamily}` : ''}
                  </span>
                </div>
              ))}
            </div>
            <div className="ops-actions" style={{ paddingTop: 0 }}>
              <button className="btn-sm btn-primary" onClick={() => void applyStyleAndGenerate('selected')} disabled={!styleWizard.selectedId}>
                应用所选方案并开始生成
              </button>
              <button className="btn-sm btn-ghost" onClick={() => void applyStyleAndGenerate('recommended')}>
                应用推荐方案
              </button>
              <button className="btn-sm btn-ghost" onClick={() => setStyleWizard(null)}>
                稍后再说
              </button>
            </div>
          </div>
        )}

        {messages.length === 0 && (
          <div className="chat-empty">
            <Sparkles size={32} />
            <p>你好！我是 AI PPT 助手</p>
            <p className="chat-empty-sub">
              用自然语言告诉我你想怎么改 PPT
            </p>
            <div className="chat-suggestions">
              {[
                '帮我优化每一页的标题',
                '根据上传的文档重写内容',
                '给所有幻灯片加上页码',
                '翻译为英文',
              ].map((s) => (
                <button
                  key={s}
                  className="suggestion-btn"
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onApply={handleApplyOperations}
          />
        ))}

        {/* 进度指示器 */}
        <ProgressIndicator progress={chatProgress} />

        {enterprisePageStatuses.length > 0 && (
          <EnterprisePageStatusPanel statuses={enterprisePageStatuses} />
        )}

        {/* 待执行操作面板（独立于消息，更显眼） */}
        {pendingOperations.length > 0 && !isStreaming && chatProgress.stage !== 'applying' && (
          <OperationsPanel
            operations={pendingOperations}
            onApply={handleApplyOperations}
            onDismiss={() => { setPendingOperations([]); resetChatProgress(); }}
          />
        )}
      </div>

      {/* 快捷指令浮窗 */}
      {showQuickActions && (
        <div className="quick-actions-panel">
          <QuickActions onSelect={handleQuickAction} />
          <button className="quick-actions-close" onClick={() => setShowQuickActions(false)}>
            <X size={12} /> 关闭
          </button>
        </div>
      )}

      {/* 输入区 */}
      <div className="chat-input-area">
        {clarifications.length > 0 && !isStreaming && (
          <ClarificationPanel
            items={clarifications}
            themes={themeRegistry.all()}
            disabled={isStreaming}
            onChange={updateClarification}
            onAdd={() => addClarification()}
            onRemove={removeClarification}
            onClear={clearClarifications}
            onContinue={handleContinueFromClarifications}
          />
        )}
        <div className="chat-input-wrapper">
          <button
            className="btn-icon-sm chat-input-action-left"
            onClick={() => setShowQuickActions(!showQuickActions)}
            title="快捷指令"
          >
            <Sparkles size={14} />
          </button>
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={isStreaming ? 'AI 正在回复...' : '描述你想如何修改 PPT...'}
            value={input}
            onChange={(e) => {
              const v = e.target.value;
              setInput(v);
              adjustHeight();
              setShowSkillPicker(v.trim().startsWith('/'));
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSkillPicker(input.trim().startsWith('/'))}
            onBlur={() => setTimeout(() => setShowSkillPicker(false), 120)}
            rows={1}
            disabled={isStreaming}
          />
          {showSkillPicker && input.trim().startsWith('/') && skills.length > 0 && !isStreaming && (
            <div className="skill-picker">
              {skills
                .filter((s) => {
                  const q = input.trim().slice(1).toLowerCase();
                  return !q || s.name.toLowerCase().includes(q) || s.title.toLowerCase().includes(q);
                })
                .slice(0, 8)
                .map((s) => (
                  <button
                    key={s.name}
                    className="skill-picker-item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setInput(`/${s.name} `);
                      setShowSkillPicker(false);
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                  >
                    <div className="skill-picker-name">/{s.name}</div>
                    <div className="skill-picker-desc">{s.description || s.title}</div>
                  </button>
                ))}
            </div>
          )}
          <div className="chat-input-actions">
            {isStreaming ? (
              <button className="btn-icon btn-stop" onClick={handleStop} title="停止">
                <Square size={16} />
              </button>
            ) : (
              <button
                className="btn-icon btn-send"
                onClick={() => handleSend()}
                disabled={!input.trim()}
                title="发送 (Enter)"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="chat-input-footer">
          <span className="provider-badge">
            {providers[activeProvider]?.label ?? activeProvider}
          </span>
          <LatencyBadge health={currentHealth} compact />
          {lastContextSnapshot && (
            <span className="provider-badge" title={`最近一次上下文采集时间：${new Date(lastContextSnapshot.capturedAt).toLocaleString()}`}>
              {SCOPE_LABELS[lastContextSnapshot.scope]} · {lastContextSnapshot.linkedMessageCount} 轮上下文
            </span>
          )}
          {documents.length > 0 && (
            <span className="doc-badge">{documents.length} 个文档</span>
          )}
          {pptInfo && (
            <span className="ppt-badge">{pptInfo.slideCount} 页</span>
          )}
          {lastContextSnapshot && lastContextSnapshot.selectedShapeCount > 0 && (
            <span className="doc-badge">已选中 {lastContextSnapshot.selectedShapeCount} 项</span>
          )}
          {lastContextSnapshot && lastContextSnapshot.recentOperationCount > 0 && (
            <span className="ppt-badge">关联 {lastContextSnapshot.recentOperationCount} 次最近修改</span>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn-text" onClick={clearMessages}>清空对话</button>
        </div>
      </div>
    </div>
  );
}

// ---- Message bubble ----

function MessageBubble({
  message,
  onApply,
}: {
  message: ChatMessage;
  onApply: (ops: SlideOperation[]) => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-content">
        {message.streaming && !message.content && (
          <div className="message-loading">
            <Loader2 size={14} className="spin" />
            <span>思考中...</span>
          </div>
        )}
        {message.content && (
          <div
            className="message-text"
            dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
          />
        )}
        {message.operations && message.operations.length > 0 && (
          <div className="message-ops-hint">
            <Play size={12} />
            <span>{message.operations.length} 项修改就绪</span>
            <button
              className="btn-sm btn-primary"
              onClick={() => onApply(message.operations!)}
            >
              应用修改
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Pending operations banner ----

function OperationsPanel({
  operations,
  onApply,
  onDismiss,
}: {
  operations: SlideOperation[];
  onApply: (ops: SlideOperation[]) => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { addHistoryEntry } = useStore();
  const [items, setItems] = useState<Array<{ op: SlideOperation; status: 'pending' | 'running' | 'ok' | 'fail'; error?: string }>>(
    () => operations.map((op) => ({ op, status: 'pending' })),
  );
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [successCount, setSuccessCount] = useState(0);

  useEffect(() => {
    setItems(operations.map((op) => ({ op, status: 'pending' })));
    setRunning(false);
    setCursor(0);
    setSuccessCount(0);
  }, [operations]);

  const execOne = useCallback(async (index: number): Promise<OperationResult | null> => {
    if (!adapterRef.current) throw new Error('Adapter 未就绪');
    const op = items[index]?.op;
    if (!op) return null;

    setRunning(true);
    setItems((prev) => prev.map((it, i) => i === index ? { ...it, status: 'running', error: undefined } : it));
    const [result] = await adapterRef.current.executeBatch([op]);
    if (result?.success) {
      setItems((prev) => prev.map((it, i) => i === index ? { ...it, status: 'ok' } : it));
      setSuccessCount((c) => c + 1);
      setCursor((c) => Math.max(c, index + 1));
    } else {
      setItems((prev) => prev.map((it, i) => i === index ? { ...it, status: 'fail', error: result?.error ?? '未知错误' } : it));
      setCursor((c) => Math.max(c, index + 1));
    }
    setRunning(false);
    return result ?? null;
  }, [items]);

  const execAll = useCallback(async () => {
    const results: OperationResult[] = [];
    for (let i = cursor; i < items.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const r = await execOne(i);
      if (r) results.push(r);
    }
    // 写入历史（用于后续驳回/审计）
    addHistoryEntry({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      userMessage: '手动执行待确认操作（逐条）',
      operations: items.map((it) => it.op),
      results,
      revertMode: 'undo',
    } as any);
  }, [addHistoryEntry, cursor, execOne, items]);

  const rollback = useCallback(async () => {
    if (!adapterRef.current) return;
    if (!confirm(`确认回滚本批次？将尝试撤销已成功执行的 ${successCount} 项操作。`)) return;
    for (let i = 0; i < successCount; i++) {
      // eslint-disable-next-line no-await-in-loop
      await adapterRef.current.undo();
    }
    onDismiss();
  }, [onDismiss, successCount]);

  return (
    <div className="ops-panel">
      <div className="ops-header">
        <span className="ops-title">
          <AlertCircle size={14} />
          {operations.length} 项待执行操作
        </span>
        <button className="btn-icon-sm" onClick={() => setExpanded(!expanded)}>
          <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>

      {expanded && (
        <div className="ops-list">
          {items.map((it, i) => (
            <div key={i} className={`ops-item ${it.status}`}>
              <span className="ops-action">{it.op.action}</span>
              <span className="ops-detail">
                {'slideIndex' in it.op ? `幻灯片 ${(it.op as any).slideIndex + 1}` : ''}
                {'text' in it.op ? ` — "${String((it.op as any).text).slice(0, 30)}..."` : ''}
                {it.status === 'running' && ' · 执行中...'}
                {it.status === 'ok' && ' · ✅'}
                {it.status === 'fail' && ` · ❌ ${it.error ?? ''}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="ops-actions">
        <button className="btn-sm btn-primary" onClick={() => void execAll()} disabled={running || cursor >= items.length}>
          <Play size={12} /> 全部执行（逐条）
        </button>
        <button className="btn-sm btn-ghost" onClick={() => void execOne(cursor)} disabled={running || cursor >= items.length}>
          <Play size={12} /> 执行下一条
        </button>
        <button className="btn-sm btn-ghost" onClick={rollback} disabled={running || successCount === 0}>
          <X size={12} /> 回滚本批次
        </button>
        <button className="btn-sm btn-ghost" onClick={() => onApply(operations)} disabled={running}>
          <Check size={12} /> 一键快速应用
        </button>
        <button className="btn-sm btn-ghost" onClick={onDismiss}>
          <X size={12} /> 取消
        </button>
      </div>
    </div>
  );
}

function EnterprisePageStatusPanel({
  statuses,
}: {
  statuses: Array<{
    pageNumber: number;
    title: string;
    status: 'planned' | 'generating' | 'applying' | 'applied' | 'failed' | 'reverted';
    message?: string;
    failedCount?: number;
  }>;
}) {
  const [expanded, setExpanded] = useState(true);

  const completed = statuses.filter((status) => status.status === 'applied' || status.status === 'reverted').length;

  return (
    <div className="ops-panel enterprise-panel">
      <div className="ops-header">
        <span className="ops-title">
          <Sparkles size={14} />
          企业版页状态 · {completed}/{statuses.length}
        </span>
        <button className="btn-icon-sm" onClick={() => setExpanded(!expanded)}>
          <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>

      {expanded && (
        <div className="enterprise-page-list">
          {statuses.map((status) => (
            <div key={status.pageNumber} className={`enterprise-page-item status-${status.status}`}>
              <div className="enterprise-page-main">
                <span className="enterprise-page-index">P{status.pageNumber}</span>
                <span className="enterprise-page-title">{status.title}</span>
              </div>
              <span className="enterprise-page-state">
                {status.status === 'planned' && '待处理'}
                {status.status === 'generating' && '生成中'}
                {status.status === 'applying' && '应用中'}
                {status.status === 'applied' && '已应用'}
                {status.status === 'failed' && `失败${status.failedCount ? ` ${status.failedCount}` : ''}`}
                {status.status === 'reverted' && '已驳回'}
              </span>
              {status.message && <span className="enterprise-page-message">{status.message}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatMessage(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}
