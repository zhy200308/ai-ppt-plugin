import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

function readIfExists(path: string): Buffer | null {
  try {
    return fs.readFileSync(path);
  } catch {
    return null;
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@adapters': resolve(__dirname, 'src/adapters'),
      '@ai': resolve(__dirname, 'src/ai'),
      '@parsers': resolve(__dirname, 'src/parsers'),
      '@store': resolve(__dirname, 'src/store'),
      '@ui': resolve(__dirname, 'src/ui'),
    },
  },

  server: {
    // macOS 某些环境下 localhost 可能解析到 IPv6 ::1，导致宿主/浏览器访问异常；
    // 这里默认绑定 127.0.0.1（仍可通过 VITE_DEV_HOST 覆盖）。
    host: process.env.VITE_DEV_HOST || '127.0.0.1',
    port: 3000,
    https: (() => {
      // Office Add-in 要求 HTTPS
      // 开发环境使用自签名证书（首次运行需要 npx office-addin-dev-certs install）
      try {
        const certDir = resolve(process.env.HOME || '', '.office-addin-dev-certs');
        const devHost = process.env.VITE_DEV_HOST || '127.0.0.1';
        const key =
          readIfExists(resolve(certDir, `${devHost}.key`))
          ?? readIfExists(resolve(certDir, 'localhost.key'));
        const cert =
          readIfExists(resolve(certDir, `${devHost}.crt`))
          ?? readIfExists(resolve(certDir, 'localhost.crt'));
        const ca = readIfExists(resolve(certDir, 'ca.crt'));

        if (!key || !cert || !ca) {
          throw new Error('Missing dev cert files');
        }

        return {
          // 优先读取 {devHost}.key/.crt（便于使用 mkcert/自签名证书为 127.0.0.1 或自定义域名生成证书）
          // 若不存在则回退到 office-addin-dev-certs 默认生成的 localhost.key/.crt
          key,
          cert,
          ca,
        };
      } catch {
        console.warn('⚠ 未找到 Office 开发证书，使用 HTTP 模式');
        console.warn('  运行 npx office-addin-dev-certs install 生成证书');
        return undefined;
      }
    })(),
    headers: {
      // Office Add-in 需要的 CORS 头
      'Access-Control-Allow-Origin': '*',
    },
  },

  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },

  // 确保 PDF.js Worker 能正确加载
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
});
