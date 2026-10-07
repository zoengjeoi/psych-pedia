// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

export default defineConfig({
  site: 'https://psychpedia.me',
  // host: true 监听所有网卡：本机 localhost 与局域网设备（手机同一 Wi-Fi 下
  // 访问 http://<局域网IP>:4321）都能连。Vite 对 host:true 走双栈监听，
  // IPv4 回环 127.0.0.1 与 IPv6 的 ::1 均可连通，不会重现早期
  // 「Node 默认只听 [::1] 导致 127.0.0.1 被拒」的问题
  server: { host: true },
  preview: { host: true },
  // 关闭 Dev Toolbar：它只在 astro dev 出现，生产构建本就不含；
  // 配置级关闭后所有设备（含手机调试）都不再显示，无需每人手动 astro preferences disable
  devToolbar: { enabled: false },
  // 悬停预取内部链接：切词条基本瞬时完成，加载转圈只在慢网兜底出现。
  // 必须显式开 prefetchAll——只写 true 时，不带 data-astro-prefetch 属性的链接不会匹配任何策略，预取等于空转；
  // 慢连接（2G/省流）下 Astro 自动降级为 tap 策略，触屏也能获得预启动
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
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
