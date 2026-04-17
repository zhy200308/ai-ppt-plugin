# macOS 运行流程（Node 18.20）

## 适用范围

- 操作系统：`macOS`
- Node.js：`18.20.x`
- 项目路径：`ai-ppt-plugin`
- 目标：在 macOS 上跑起当前项目，并加载到 `PowerPoint`

## 先看结论

当前项目在 macOS 上的最小可运行流程是：

1. 安装依赖
2. 安装并信任本地 HTTPS 开发证书
3. 启动前端开发服务
4. 按需启动 sidecar 代理服务
5. 通过 `manifests/manifest.xml` 把插件加载到 PowerPoint

注意：

- 当前 `package.json` 里的 `npm run dev` 只启动 `Vite`
- 当前 `npm run sidecar` 需要单独开一个终端启动
- `manifest` 固定指向 `https://127.0.0.1:3000`（避免 macOS 某些环境下 localhost 解析异常）
- 如果 `3000` 端口被占用，插件不会正常加载

---

## 1. 环境准备

### 1.1 检查 Node 版本

```bash
node -v
npm -v
```

期望：

```bash
v18.20.x
```

### 1.2 安装 PowerPoint

建议使用以下任意一种：

- `Microsoft PowerPoint for Mac`
- `Microsoft 365 for Mac`

如果桌面版 sideload 遇到限制，也可以先用：

- `PowerPoint on the web`

---

## 2. 拉起项目

### 2.1 安装依赖

在项目根目录执行：

```bash
npm install
```

如果看到类似 `EBADENGINE` 或某些包的 warning：

- 先不用慌
- 当前项目在 Node 18 下是可以继续运行的
- 只要安装成功即可继续后续步骤

### 2.2 安装 Office 开发证书

首次运行必须执行：

```bash
npx office-addin-dev-certs install
```

执行后 macOS 可能会弹出系统授权或钥匙串相关提示。

如果系统没有自动信任证书，手动处理方法：

1. 打开 `钥匙串访问`
2. 选择 `登录` 或 `系统`
3. 找到开发证书（可能叫 `localhost` 或 `127.0.0.1`）
4. 双击打开
5. 在“信任”中把该证书改为 `始终信任`

> 重要：本项目默认使用 `https://127.0.0.1:3000`（manifest 也指向 127.0.0.1）。
> 但 `office-addin-dev-certs install` 默认只生成 `localhost` 证书。
> 你有两种选择：
>
> A) **推荐：为 127.0.0.1 生成证书**（让 manifest / dev server / 证书三者一致）
>    - 使用 mkcert 或 openssl 生成 `127.0.0.1.crt` 和 `127.0.0.1.key`
>    - 放到目录：`~/.office-addin-dev-certs/127.0.0.1.crt` 与 `~/.office-addin-dev-certs/127.0.0.1.key`
>    - Vite 会优先读取这对文件（见 `vite.config.ts`）
>
> B) 继续用 localhost 证书：临时把 `VITE_DEV_HOST=localhost` 启动（并相应把 manifest 改回 localhost）

完成后，最好重启一次 PowerPoint。

### 2.3 启动前端开发服务

```bash
npm run dev
```

正常输出应类似：

```bash
VITE v6.x ready
Local: https://127.0.0.1:3000/
```

然后在浏览器里访问：

```text
https://127.0.0.1:3000/
```

确认页面可打开，并且浏览器没有证书报错。

### 2.4 启动 sidecar（按需）

如果你需要：

- 使用本地代理
- 走系统代理 / PAC / HTTP / SOCKS5 转发
- 避免某些中转站直连失败

再开第二个终端执行：

```bash
npm run sidecar
```

说明：

- 当前项目不会随 `npm run dev` 自动带起 sidecar
- 所以你需要手动开两个终端

建议终端布局：

- 终端 1：`npm run dev`
- 终端 2：`npm run sidecar`

---

## 3. PowerPoint 加载方式

当前 manifest 路径是：

```text
manifests/manifest.xml
```

当前 manifest 中的资源地址固定为：

```text
https://127.0.0.1:3000/index.html
```

### 3.1 方式 A：PowerPoint 桌面版手动加载

在 PowerPoint for Mac 中：

1. 打开 `PowerPoint`
2. 进入一个演示文稿
3. 找到 `插入`
4. 进入 `我的加载项`
5. 选择 `管理我的加载项` 或 `上传我的加载项`
6. 选择项目中的文件：

```text
manifests/manifest.xml
```

成功后，你应该能看到插件入口，并打开右侧任务窗格。

如果你的 PowerPoint 菜单里没有明显的“上传我的加载项”入口，可以试：

- `插入 -> Office 加载项`
- `我的加载项`
- `管理加载项`
- 或在 Web 版本中先上传 manifest，再同步到桌面版账号

### 3.2 方式 B：PowerPoint Web 加载

如果桌面版不好 sideload，推荐先在 Web 版验证：

1. 打开 [https://www.office.com/launch/powerpoint](https://www.office.com/launch/powerpoint)
2. 登录你的 Microsoft 账号
3. 打开任意 PPT
4. 插入 -> 加载项 -> 我的加载项
5. 上传：

```text
manifests/manifest.xml
```

这通常是最省事的验证方式。

---

## 4. 推荐运行顺序

每次开发建议按以下顺序：

### 4.1 首次运行

```bash
npm install
npx office-addin-dev-certs install
npm run dev
```

如果需要 sidecar，再开新终端：

```bash
npm run sidecar
```

然后加载：

```text
manifests/manifest.xml
```

### 4.2 日常开发

终端 1：

```bash
npm run dev
```

终端 2（按需）：

```bash
npm run sidecar
```

然后重开或刷新 PowerPoint 插件面板。

---

## 5. 与当前项目强相关的注意事项

### 5.1 端口必须是 3000

当前 manifest 写死了：

```text
https://127.0.0.1:3000/index.html
```

所以：

- 不能随意换端口
- 不能让 Vite 漂移到 `3001`、`3002`

如果 `3000` 被占用，先释放再启动项目。

### 5.2 sidecar 不是自动启动的

当前脚本如下：

```json
"dev": "vite",
"sidecar": "node sidecar/server.js"
```

所以必须明确记住：

- `dev` 只管前端
- `sidecar` 需单独跑

### 5.3 如果你使用中转站

推荐流程：

1. 先确认 `Vite` 正常
2. 再确认 `sidecar` 正常
3. 插件里优先走：
   - 系统代理
   - sidecar
   - 或中转站明确支持的代理方式

如果你遇到：

- TLS 握手失败
- `Unexpected token '<'`
- 返回 HTML

优先检查：

- Base URL 是否正确
- 是否缺少 `/v1`
- 是否需要系统代理 / sidecar

---

## 6. 常见问题

### 6.1 浏览器能打开 `https://127.0.0.1:3000`，但 PowerPoint 加载失败

优先检查：

1. 开发证书是否在 macOS 中被设为 `始终信任`
2. PowerPoint 是否重启过
3. `manifest.xml` 是否真的指向 `https://127.0.0.1:3000`
4. 是否访问的是同一个 Microsoft 账号环境

### 6.2 PowerPoint 看不到“上传我的加载项”

可替代方案：

- 先在 `PowerPoint Web` 上传 `manifest.xml`
- 再回到桌面版查看是否同步

### 6.3 启动时报端口占用

先查占用：

```bash
lsof -i :3000
```

再结束相关进程：

```bash
kill -9 <PID>
```

然后重新：

```bash
npm run dev
```

### 6.4 安装证书后仍提示不安全

尝试：

1. 删除旧证书
2. 重新执行

```bash
npx office-addin-dev-certs install
```

3. 在 `钥匙串访问` 里再次手动设为 `始终信任`
4. 重启浏览器和 PowerPoint

### 6.5 Node 18.20 能不能跑？

可以，当前项目可在 `Node 18.20` 下运行。

但你可能会看到某些 warning：

- 某些依赖声明偏向 Node 20+
- 这不一定阻塞当前开发运行

只要：

- `npm install` 成功
- `npm run dev` 正常
- `https://127.0.0.1:3000` 可访问

就可以继续。

---

## 7. 一套可直接复制的流程

### 7.1 首次

```bash
cd /path/to/ai-ppt-plugin
npm install
npx office-addin-dev-certs install
npm run dev
```

新开一个终端（按需）：

```bash
cd /path/to/ai-ppt-plugin
npm run sidecar
```

然后在 PowerPoint 中上传：

```text
manifests/manifest.xml
```

### 7.2 之后每次开发

```bash
cd /path/to/ai-ppt-plugin
npm run dev
```

需要代理时再执行：

```bash
cd /path/to/ai-ppt-plugin
npm run sidecar
```

---

## 8. 建议

如果你在 macOS 上主要做 PowerPoint 插件开发，我建议实际使用时分成两套：

- **验证加载链路**：优先用 `PowerPoint Web`
- **验证宿主能力**：再用 `PowerPoint for Mac`

原因：

- Web 版更适合快速验证 manifest / HTTPS / UI 是否正常
- 桌面版更适合验证真实 PowerPoint API 行为

---

## 9. 当前项目的关键路径

- 前端入口：`src/index.tsx`
- PowerPoint manifest：`manifests/manifest.xml`
- WPS manifest：`manifests/jsa_publish.json`
- 前端开发命令：`npm run dev`
- 代理 sidecar：`npm run sidecar`
