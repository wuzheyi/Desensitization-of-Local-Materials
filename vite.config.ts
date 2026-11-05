import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base: './' 让构建产物用相对路径，既能部署到 GitHub Pages 的 /<repo>/ 子路径，
// 也能直接本地预览，无需为仓库名改配置。
export default defineConfig({
  base: './',
  plugins: [react()],
  // 缓存写到项目内，避免落在系统临时目录
  cacheDir: 'node_modules/.vite',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    cache: false,
    // 单文件串行：测试量小，避免并发 worker 争用临时目录
    fileParallelism: false,
  },
});
