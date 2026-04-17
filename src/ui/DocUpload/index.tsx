// ============================================================
//  DocUpload — 文档上传管理
//  支持拖拽上传、多格式解析、上下文预览
// ============================================================

import * as React from 'react';
import { useState, useCallback, useRef } from 'react';
import { useStore } from '../../store';
import { parseDocument, getSupportedExtensions } from '../../parsers';
import type { ParsedDocument } from '../../parsers';
import {
  FileUp,
  File,
  FileText,
  FileSpreadsheet,
  Image,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

export function DocUpload() {
  const { documents, addDocument, removeDocument, clearDocuments } = useStore();
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      // 检查是否已上传
      if (documents.some((d) => d.fileName === file.name)) {
        continue;
      }

      setParsing(file.name);
      try {
        const parsed = await parseDocument(file);
        addDocument(parsed);
      } catch (err: any) {
        setError(`解析 ${file.name} 失败: ${err.message}`);
      }
    }
    setParsing(null);
  }, [documents, addDocument]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
    e.target.value = ''; // 允许重复选择相同文件
  }, [handleFiles]);

  const supportedExts = getSupportedExtensions();

  return (
    <div className="doc-upload-panel">
      <div className="section-header">
        <h3>参考文档</h3>
        {documents.length > 0 && (
          <button className="btn-sm btn-ghost" onClick={clearDocuments}>
            <Trash2 size={12} /> 清空
          </button>
        )}
      </div>

      <p className="doc-desc">
        上传参考文档后，AI 将基于文档内容帮你修改 PPT
      </p>

      {/* 拖拽上传区 */}
      <div
        className={`drop-zone ${dragging ? 'drop-zone-active' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={supportedExts.join(',')}
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
        {parsing ? (
          <div className="drop-zone-parsing">
            <Loader2 size={24} className="spin" />
            <span>正在解析 {parsing}...</span>
          </div>
        ) : (
          <>
            <FileUp size={28} />
            <span className="drop-zone-text">拖拽文件到此处，或点击选择</span>
            <span className="drop-zone-hint">
              支持 PDF、Word、Excel、PPT、TXT、Markdown、图片等
            </span>
          </>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="doc-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* 文档列表 */}
      {documents.length > 0 && (
        <div className="doc-list">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.fileName}
              doc={doc}
              onRemove={() => removeDocument(doc.fileName)}
            />
          ))}
        </div>
      )}

      {/* 总字数统计 */}
      {documents.length > 0 && (
        <div className="doc-stats">
          共 {documents.length} 个文档，
          约 {documents.reduce((sum, d) => sum + d.textContent.length, 0).toLocaleString()} 字符
        </div>
      )}
    </div>
  );
}

function DocumentCard({
  doc,
  onRemove,
}: {
  doc: ParsedDocument;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const getIcon = () => {
    switch (doc.fileType) {
      case 'pdf': return <File size={16} />;
      case 'docx': return <FileText size={16} />;
      case 'xlsx': return <FileSpreadsheet size={16} />;
      case 'image': return <Image size={16} />;
      default: return <FileText size={16} />;
    }
  };

  return (
    <div className="doc-card">
      <div className="doc-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="doc-card-info">
          {getIcon()}
          <span className="doc-name">{doc.fileName}</span>
          <span className="doc-type-badge">{doc.fileType}</span>
        </div>
        <div className="doc-card-actions">
          <span className="doc-chars">{doc.textContent.length.toLocaleString()} 字符</span>
          <button className="btn-icon-sm" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
            <Trash2 size={12} />
          </button>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {expanded && (
        <div className="doc-card-preview">
          <pre>{doc.textContent}</pre>
        </div>
      )}
    </div>
  );
}
