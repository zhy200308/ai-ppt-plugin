# AI PPT 插件

AI 驱动的演示文稿智能编辑助手，同时适配 **PowerPoint** 和 **WPS Office**，兼容 **Windows** 和 **macOS**。

---

## 功能特性

### AI 多平台集成
- **原生支持**: OpenAI (GPT-4o)、Anthropic (Claude)、Google (Gemini)、DeepSeek、通义千问、文心一言
- **中转平台兼容**: 支持 AnyRouter / one-api / new-api 等所有主流中转站
- **双鉴权方式**: 同时支持 `x-api-key`（官方）和 `Authorization: Bearer`（中转站）
- **自定义端点**: 支持任意 Base URL + API Key
- **流式输出**: 实时显示 AI 生成内容

### 🆕 快速配置（粘贴即用）
兼容 `ccswitch` / `Claude Code` / 环境变量格式，一键导入：

```bash
export ANTHROPIC_AUTH_TOKEN=sk-your-token
export ANTHROPIC_BASE_URL=https://anyrouter.top
```

粘贴到"快速配置"对话框后自动识别服务类型、Base URL、鉴权方式并创建配置。支持 bash/zsh/PowerShell/cmd 多种格式。

### 🆕 连接状态实时显示
- 信号灯 + 毫秒延时 + 色阶评级（优秀/良好/一般/较慢/超时）
- 悬停显示最后检测时间和实际模型
- 对当前使用的 provider 每 2 分钟自动 ping 一次
- 连接失败时直接显示错误原因

### 🆕 细化的对话进度可视化
每次交互显示五个阶段的处理状态：
1. 📖 **读取 PPT** — 获取当前演示文稿结构
2. 📤 **发送请求** — 构造上下文并发往 AI
3. 💬 **生成中** — 流式接收 tokens（实时显示 tokens 数）
4. 🪄 **解析指令** — 从回复中提取操作 JSON
5. ⚡ **应用修改** — 执行到 PPT

附带实时耗时计数器，阶段间可视化连接线。

### 🆕 操作历史与回滚
- 每批修改自动记录
- 展开查看原始指令、AI 回复、每项操作结果
- 一键回滚整批修改
- 已回滚的条目保留展示（标灰）

### 🆕 快捷指令预设
内置 10+ 常用 prompts，分三类快速触发：
- **内容**：翻译 / 精简 / 生成备注 / 优化措辞
- **样式**：商务配色 / 现代配色 / 统一字体
- **结构**：添加页码等

### 🆕 PPT 读取范围控制
插件会实时读取当前 PPT 内容作为 AI 上下文。顶部有三个可切换的范围模式：

| 模式 | 读取内容 | 适用场景 | Token 消耗 |
|---|---|---|---|
| 📚 **整个 PPT** | 所有幻灯片的文本、形状、备注 | 翻译、统一风格、跨页协同修改 | 高 |
| 📄 **当前页** *(默认)* | 当前页完整结构 + 其他页标题摘要 | 精修单页内容、日常编辑 | 低 |
| 🎯 **选中内容** | 你在 PPT 里选中的形状 + 同页参考 | 改标题、润色某段文字 | 最低 |

关键特性：
- 每 1.5 秒自动同步当前页索引和选中状态，切页或点击形状会立刻反映
- 切换模式后点击"预览 AI 能看到的内容"可实时查看发送内容
- 发送后显示实际消耗的 token 数（基于中英文差异估算）
- "选中内容"模式无选中时自动降级为"当前页"

### 交互式 PPT 编辑
- 自然语言描述修改意图，AI 返回结构化操作指令
- 操作预览 → 确认 → 批量执行
- 支持: 修改文本/样式、插入文本框/图片、添加/删除/排序幻灯片、设置背景/备注

### 文档导入
- **全格式**: PDF、Word、Excel、PPT、TXT、Markdown、HTML、图片
- 浏览器端解析，无需后端
- 文档内容作为 AI 上下文

### 网络代理
- 自动检测系统代理（Windows 注册表 / macOS scutil）
- 手动配置 HTTP / SOCKS5 代理
- PAC 自动代理脚本
- 独立 Sidecar 代理服务（Node.js）

---

## 技术架构

```
┌─────────────────────────────────────────────┐
│         宿主应用 (PowerPoint / WPS)           │
├─────────────────────────────────────────────┤
│         UI 层 — React 18 + TypeScript        │
│ ChatPanel │ Settings │ DocUpload │ History    │
│    Progress · Latency · QuickSetup           │
├─────────────────────────────────────────────┤
│      PPT 操作抽象层 — Adapter Pattern         │
│   OfficeJsAdapter  │  WpsJsaAdapter          │
├──────────────────┬──────────────────────────┤
│   AI 服务层       │   文档解析层              │
│ OpenAI/Claude/   │  pdf.js / mammoth.js     │
│ Gemini/中转       │  SheetJS / FileReader    │
├──────────────────┴──────────────────────────┤
│          网络代理层 + Sidecar 服务             │
└─────────────────────────────────────────────┘
```

---

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn
- PowerPoint 2016+ 或 WPS Office 2019+

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 1. 安装 Office 开发证书 (仅首次)
npx office-addin-dev-certs install

# 2. 启动开发服务器
npm run dev

# 3. (可选) 启动 Sidecar 代理服务
npm run sidecar
```

---

## 🆕 独立 Web 应用（生成并导出 .pptx）

本项目现在支持“纯浏览器”形态：不依赖 PowerPoint/WPS 宿主，也能完成 **对话式生成 → 逐页生成 → 可迭代修改 → 导出 .pptx** 的闭环。

### 启动

```bash
npm install
npm run dev
```

打开开发服务器地址后：
- 在「对话」里让 AI 生成/修改内容
- 在顶部点击「导出 PPTX」即可下载生成的 PowerPoint 文件

### 迭代修改（推荐用法）

Web 模式没有“真实 PPT 选中态”，所以新增了「大纲」页签：
- 点击某一页：切换“当前页”
- 点击某个元素：进入“选中内容”模式，AI 会拿到真实 shapeId，从而能 **精准 updateText/deleteShape**（而不是盲插新文本框）

---

## 🆕 内置主题引擎 + 页面操作插件（给 AI 的工具箱）

AI 除了可以输出基础操作（insertText/updateText/addSlide...），还可以输出：

```json:operations
[
  {"action":"callPlugin","slideIndex":0,"pluginId":"cover","args":{"title":"标题","subtitle":"副标题"}},
  {"action":"callPlugin","slideIndex":1,"pluginId":"title-content","args":{"title":"关键结论","bullets":["要点1","要点2"]}}
]
```

目前内置插件（pluginId）：
- `cover`：封面
- `section`：章节页
- `title-content`：标题 + 要点
- `two-column`：双栏对比
- `thank-you`：致谢页

主题引擎会在“企业版按页生成”产出页级蓝图后，自动把 themeSpec 同步到 Web 适配器，用于插件布局/默认字体与配色（后续可扩展更多主题/模板）。

### 加载到 PowerPoint

1. 打开 PowerPoint
2. 文件 → 选项 → 信任中心 → 信任中心设置 → 受信任的加载项目录
3. 添加目录: `https://127.0.0.1:3000/manifests`
4. 插入 → 我的加载项 → 共享文件夹 → AI PPT 助手

### 加载到 WPS

1. 打开 WPS 演示
2. 开发工具 → 加载项管理 → 加载本地加载项
3. 选择 `dist/wps/jsa_publish.json`

### 生产构建

```bash
npm run build:office    # PowerPoint 版本
npm run build:wps       # WPS 版本
npm run build:all       # 两个版本同时构建
```

---

## 🚀 使用 AnyRouter / 中转站

最快的配置方式：

1. 打开插件 → 设置 → 点击 **"快速配置"** 按钮
2. 粘贴你的中转站环境变量：
   ```bash
   export ANTHROPIC_AUTH_TOKEN=sk-ant-xxxxx
   export ANTHROPIC_BASE_URL=https://anyrouter.top
   ```
3. 自动识别为"Claude 中转 · anyrouter.top"，Bearer 鉴权方式自动选中
4. 点击"添加并启用"
5. 回到对话面板，信号灯会自动开始 ping，显示当前延时

配置完成后就可以像用 Claude Code 一样使用了。

---

## 项目结构

```
ai-ppt-plugin/
├── src/
│   ├── index.tsx              # 应用入口
│   ├── adapters/              # PPT 操作适配器
│   │   ├── interface.ts       # 统一接口定义
│   │   ├── officejs.ts        # PowerPoint 适配器
│   │   ├── wpsjsa.ts          # WPS 适配器
│   │   └── index.ts           # 宿主检测 + 工厂
│   ├── ai/                    # AI 服务层
│   │   ├── types.ts           # 类型 + Provider 预设
│   │   ├── providers/         # 各平台适配器
│   │   ├── proxy.ts           # 代理配置
│   │   ├── quick-setup.ts     # 🆕 粘贴配置解析器
│   │   └── index.ts           # 统一服务入口
│   ├── parsers/               # 文档解析器
│   ├── store/                 # Zustand 状态管理
│   │   └── index.ts           # 🆕 新增进度/健康/历史状态
│   └── ui/                    # React 界面
│       ├── App.tsx            # 🆕 加入 History tab
│       ├── ChatPanel/         # 🆕 集成进度/快捷指令
│       ├── Settings/          # 🆕 集成快速配置/延时显示
│       ├── DocUpload/
│       ├── components/        # 🆕 新增可复用组件
│       │   ├── ProgressIndicator.tsx
│       │   ├── LatencyBadge.tsx
│       │   ├── QuickSetupDialog.tsx
│       │   ├── HistoryPanel.tsx
│       │   └── QuickActions.tsx
│       └── styles/globals.css
├── sidecar/
│   └── server.js              # 本地代理服务
├── manifests/
│   ├── manifest.xml           # Office Add-in 清单
│   └── jsa_publish.json       # WPS 插件清单
├── vite.config.ts
├── webpack.office.config.js
├── webpack.wps.config.js
├── tsconfig.json
└── package.json
```

---

## License

MIT
