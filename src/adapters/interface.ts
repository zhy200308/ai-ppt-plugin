// ============================================================
//  Unified Slide API — 统一幻灯片操作接口
//  PowerPoint (Office.js) 和 WPS (JSA) 共用同一套接口
// ============================================================

/** 文本样式 */
export interface TextStyle {
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;          // hex, e.g. "#FF6600"
  alignment?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  lineSpacing?: number;
}

/** 形状/文本框信息 */
export interface ShapeInfo {
  id: string;
  name: string;
  type: 'textBox' | 'image' | 'shape' | 'table' | 'chart' | 'group' | 'unknown';
  text?: string;
  left: number;   // points
  top: number;
  width: number;
  height: number;
  style?: TextStyle;
}

export interface SlideSnapshotShape {
  name: string;
  type: ShapeInfo['type'];
  text?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  style?: TextStyle;
}

/** 幻灯片信息 */
export interface SlideInfo {
  index: number;          // 0-based
  id: string;
  layoutName?: string;
  shapes: ShapeInfo[];
  notes?: string;
  backgroundColor?: string;
  thumbnailBase64?: string;
}

export interface SlideSnapshot {
  slideIndex: number;
  existed: boolean;
  notes?: string;
  backgroundColor?: string;
  shapes: SlideSnapshotShape[];
  unsupportedShapeCount: number;
}

/** 当前选中的形状信息（来自宿主应用的实时选中状态） */
export interface SelectionInfo {
  slideIndex: number;               // 选中所在的幻灯片
  shapeIds: string[];               // 选中的形状 ID 列表
  shapes: ShapeInfo[];              // 选中形状的详细信息
  hasSelection: boolean;            // 是否有选中（无选中时为 false）
}

/** 整个演示文稿摘要 */
export interface PresentationInfo {
  title?: string;
  slideCount: number;
  slideWidth: number;     // points
  slideHeight: number;
  slides: SlideInfo[];
}

/** 插入文本框参数 */
export interface InsertTextBoxParams {
  slideIndex: number;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  style?: TextStyle;
}

/** 插入图片参数 */
export interface InsertImageParams {
  slideIndex: number;
  base64: string;          // 不含 data:xxx;base64, 前缀
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/svg+xml';
  left: number;
  top: number;
  width: number;
  height: number;
  /** 可选：用于标记图片用途（例如 wordart:<assetId>），方便后续识别与二次编辑 */
  name?: string;
}

/** 更新形状文本参数 */
export interface UpdateShapeTextParams {
  slideIndex: number;
  shapeId: string;
  text: string;
  style?: TextStyle;
}

/** AI 返回的操作指令（结构化 JSON） */
export type SlideOperation =
  | { action: 'updateText';   slideIndex: number; shapeId: string; text: string; style?: TextStyle }
  | { action: 'updateGeometry'; slideIndex: number; shapeId: string; left: number; top: number; width?: number; height?: number }
  | { action: 'insertText';   params: InsertTextBoxParams }
  | { action: 'insertImage';  params: InsertImageParams }
  | { action: 'replaceImage'; slideIndex: number; shapeId: string; base64: string; mimeType: InsertImageParams['mimeType']; name?: string }
  | { action: 'deleteShape';  slideIndex: number; shapeId: string }
  /**
   * 调用“页面操作插件”（高阶布局/组件宏），由引擎展开为基础操作再执行。
   * - pluginId: 插件标识（例如 "cover" / "title-content"）
   * - args: 插件参数（不同插件定义不同）
   */
  | { action: 'callPlugin';   slideIndex: number; pluginId: string; args?: Record<string, any> }
  | { action: 'addSlide';     afterIndex?: number; layoutName?: string }
  | { action: 'deleteSlide';  slideIndex: number }
  | { action: 'reorderSlide'; fromIndex: number; toIndex: number }
  | { action: 'setNotes';     slideIndex: number; notes: string }
  | { action: 'setBackground'; slideIndex: number; color?: string; imageBase64?: string };

/** 操作执行结果 */
export interface OperationResult {
  success: boolean;
  operation: SlideOperation;
  error?: string;
}

// ============================================================
//  ISlideAdapter — 适配器必须实现的接口
// ============================================================

export interface ISlideAdapter {
  /** 适配器名称 */
  readonly name: 'officejs' | 'wpsjsa' | 'webpptx';

  /** 初始化（在宿主环境 ready 后调用） */
  init(): Promise<void>;

  /** 获取完整的演示文稿信息 */
  getPresentation(): Promise<PresentationInfo>;

  /** 获取单页幻灯片详情 */
  getSlide(index: number): Promise<SlideInfo>;

  /** 获取当前选中的幻灯片索引 */
  getActiveSlideIndex(): Promise<number>;

  /** 获取当前页的完整信息（等同于 getSlide(activeSlideIndex) 的便捷方法） */
  getCurrentSlide(): Promise<SlideInfo>;

  /** 获取用户当前选中的形状（文本框/图片/表格等） */
  getSelection(): Promise<SelectionInfo>;

  /** 更新指定形状的文本 */
  updateShapeText(params: UpdateShapeTextParams): Promise<void>;

  /** 更新形状位置/尺寸（若宿主不支持可自行忽略或抛错） */
  updateShapeGeometry?(params: { slideIndex: number; shapeId: string; left: number; top: number; width?: number; height?: number }): Promise<void>;

  /** 插入文本框 */
  insertTextBox(params: InsertTextBoxParams): Promise<string>;  // 返回新形状的 id

  /** 插入图片 */
  insertImage(params: InsertImageParams): Promise<string>;

  /** 删除形状 */
  deleteShape(slideIndex: number, shapeId: string): Promise<void>;

  /** 添加幻灯片 */
  addSlide(afterIndex?: number, layoutName?: string): Promise<number>;  // 返回新幻灯片 index

  /** 删除幻灯片 */
  deleteSlide(index: number): Promise<void>;

  /** 调整幻灯片顺序 */
  reorderSlide(fromIndex: number, toIndex: number): Promise<void>;

  /** 设置幻灯片备注 */
  setNotes(slideIndex: number, notes: string): Promise<void>;

  /** 设置幻灯片背景 */
  setBackground(slideIndex: number, color?: string, imageBase64?: string): Promise<void>;

  /** 批量执行操作 */
  executeBatch(operations: SlideOperation[]): Promise<OperationResult[]>;

  /** 撤销上一步操作 */
  undo(): Promise<void>;

  /** 获取幻灯片缩略图（base64） */
  getSlideThumbnail(index: number): Promise<string | null>;
}
