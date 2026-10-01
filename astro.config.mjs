// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

export default defineConfig({
  site: 'https://psychpedia.me',
  // 明确绑定 IPv4 回环：Node 默认可能只监听 [::1]，浏览器走 127.0.0.1 时会连接被拒
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  // 关闭 Dev Toolbar：它只在 astro dev 出现，生产构建本就不含；
  // 配置级关闭后所有设备（含手机调试）都不再显示，无需每人手动 astro preferences disable
  devToolbar: { enabled: false },
  integrations: [
    react(),
    AstroPWA({
      registerSW: 'auto',
      manifest: {
        name: 'PsychPedia 精神药理学临床速查',
        short_name: 'PsychPedia',
        description: '精神科药物与生物医学原理的临床速查百科',
        lang: 'zh-CN',
        // manifest 是静态资源:取站点默认(日间)模式的浅色;浏览器内顶栏色由 theme-color meta 动态跟随
        theme_color: '#ffffff',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2}', '!images/**'],
        navigateFallback: '/offline.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    // 词条正文不用 Astro 内置渲染，统一走 src/lib/markdown.ts 的自建管线
    // （CJK 强调修正、受体自动链接、标题 slug 与 TOC 同源）
    extendDefaultPlugins: false,
  },
});
