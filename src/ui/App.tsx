// ============================================================
//  App — 主应用入口组件
// ============================================================

import * as React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store';
import { ChatPanel } from './ChatPanel';
import { OutlinePanel } from './OutlinePanel';
import { PreviewPanel } from './PreviewPanel';
import { Settings } from './Settings';
import { DocUpload } from './DocUpload';
import { HistoryPanel } from './components/HistoryPanel';
import { createAdapter, detectHost } from '../adapters';
import type { ISlideAdapter } from '../adapters/interface';
import {
  MessageSquare,
  Settings as SettingsIcon,
  FileUp,
  History,
  Sparkles,
  Download,
  List,
  Eye,
} from 'lucide-react';
import './styles/globals.css';

/** 全局适配器引用 */
export const adapterRef: { current: ISlideAdapter | null } = { current: null };

export function App() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setPptInfo = useStore((s) => s.setPptInfo);
  const setCurrentSlide = useStore((s) => s.setCurrentSlide);
  const setSelection = useStore((s) => s.setSelection);
  const setActiveSlideIndex = useStore((s) => s.setActiveSlideIndex);
  const operationHistory = useStore((s) => s.operationHistory);
  const initialized = useRef(false);
  const [canExport, setCanExport] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    const adapter: any = adapterRef.current;
    if (!adapter || typeof adapter.exportPptx !== 'function') return;
    if (exporting) return;

    setExporting(true);
    try {
      const blob: Blob = await adapter.exportPptx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-generated-${new Date().toISOString().slice(0, 10)}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  // 初始化宿主适配器
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      try {
        const host = detectHost();
        const adapter = createAdapter(host);
        await adapter.init();
        adapterRef.current = adapter;
        setCanExport(typeof (adapter as any).exportPptx === 'function');

        const pptInfo = await adapter.getPresentation();
        setPptInfo(pptInfo);

        // 初始化当前页和选中状态
        const currentSlide = await adapter.getCurrentSlide();
        setCurrentSlide(currentSlide);
        setActiveSlideIndex(currentSlide.index);

        const selection = await adapter.getSelection();
        setSelection(selection);

        console.log(`[App] Initialized for host: ${host}, slides: ${pptInfo.slideCount}`);
      } catch (err) {
        console.error('[App] Initialization failed:', err);
      }
    })();
  }, [setPptInfo, setCurrentSlide, setSelection, setActiveSlideIndex]);

  // 轮询当前页 + 选中状态（每 1.5 秒）
  // Office.js / WPS JSA 都不暴露完善的事件系统，轮询是最可靠的方式
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!adapterRef.current) return;
      try {
        const [slide, selection] = await Promise.all([
          adapterRef.current.getCurrentSlide(),
          adapterRef.current.getSelection(),
        ]);

        const store = useStore.getState();

        // 只在真正变化时更新，避免无谓 re-render
        if (slide.index !== store.activeSlideIndex ||
            slide.shapes.length !== store.currentSlide?.shapes.length) {
          setCurrentSlide(slide);
          setActiveSlideIndex(slide.index);
        }

        const selChanged =
          selection.hasSelection !== store.selection?.hasSelection ||
          selection.shapeIds.join(',') !== store.selection?.shapeIds.join(',');
        if (selChanged) {
          setSelection(selection);
        }
      } catch { /* ignore */ }
    }, 1500);

    return () => clearInterval(interval);
  }, [setCurrentSlide, setSelection, setActiveSlideIndex]);

  const tabs = [
    { key: 'chat' as const,       icon: MessageSquare, label: '对话' },
    { key: 'outline' as const,    icon: List,          label: '大纲' },
    { key: 'preview' as const,    icon: Eye,           label: '预览' },
    { key: 'documents' as const,  icon: FileUp,        label: '文档' },
    { key: 'history' as const,    icon: History,       label: '历史', badge: operationHistory.length },
    { key: 'settings' as const,   icon: SettingsIcon,  label: '设置' },
  ];

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-logo">
          <Sparkles size={18} />
          <span>AI PPT 助手</span>
        </div>
        <nav className="app-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              title={tab.label}
            >
              <tab.icon size={16} />
              <span className="tab-label">{tab.label}</span>
              {'badge' in tab && tab.badge !== undefined && tab.badge > 0 && (
                <span className="tab-badge">{tab.badge > 99 ? '99+' : tab.badge}</span>
              )}
            </button>
          ))}
        </nav>
        {canExport && (
          <button
            className="btn-sm btn-primary"
            style={{ marginLeft: 12 }}
            onClick={handleExport}
            disabled={exporting}
            title="导出为 .pptx"
          >
            <Download size={14} />
            <span style={{ marginLeft: 6 }}>{exporting ? '导出中...' : '导出 PPTX'}</span>
          </button>
        )}
      </header>

      <main className="app-content">
        {/* Web：仍保持左右分栏；插件端：增加独立“预览”Tab（集成 Web 预览编辑能力） */}
        {canExport && (activeTab === 'chat' || activeTab === 'outline') ? (
          <div className="web-split">
            <div className="web-split-left">
              {activeTab === 'chat' && <ChatPanel />}
              {activeTab === 'outline' && <OutlinePanel />}
            </div>
            <div className="web-split-right">
              <PreviewPanel />
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'chat' && <ChatPanel />}
            {activeTab === 'outline' && <OutlinePanel />}
            {activeTab === 'preview' && <PreviewPanel />}
            {activeTab === 'documents' && <DocUpload />}
            {activeTab === 'history' && <HistoryPanel />}
            {activeTab === 'settings' && <Settings />}
          </>
        )}
      </main>
    </div>
  );
}
