#!/usr/bin/env node
/**
 * 本地图床小工具：把图片粘贴或拖进来 -> 自动上传到 GitHub 仓库 -> 返回 Markdown 片段。
 *
 *   npm run image-host        然后打开 http://127.0.0.1:5199
 *
 * 说明：仅在本机运行（只监听 127.0.0.1）。GitHub Token 只从本地 .env 读取、
 * 只在上传请求里使用，不会发送到浏览器页面；请勿把这个服务部署到线上。
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, getConfig, uploadImage } from './image-upload-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(root);

const PORT = Number(process.env.IMAGE_HOST_PORT || 5199);
const HOST = '127.0.0.1';
const MAX_BODY = 30 * 1024 * 1024; // 30MB

const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PsychPedia 图床上传</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 2.5rem 1.25rem;
    font-family: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
    background: #f8fafc; color: #0f172a;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1115; color: #ccd4de; }
    .card { background: #1a2029 !important; border-color: #232b36 !important; }
    .drop { background: #161b22 !important; border-color: #2c3742 !important; }
    .drop.hot { border-color: #0ea5e9 !important; background: #10202e !important; }
    code, pre { background: #12161c !important; }
    input { background: #12161c !important; color: #ccd4de !important; border-color: #232b36 !important; }
  }
  .wrap { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 1.35rem; margin: 0 0 .3rem; letter-spacing: -.01em; }
  .sub { color: #64748b; font-size: .85rem; margin-bottom: 1.25rem; }
  .status { font-size: .8rem; margin-bottom: 1rem; }
  .status b { font-weight: 600; }
  .status .ok { color: #059669; }
  .status .bad { color: #dc2626; }
  .drop {
    border: 2px dashed #cbd5e1; border-radius: 16px; background: #fff;
    padding: 2.4rem 1rem; text-align: center; cursor: pointer;
    transition: border-color .18s, background .18s;
  }
  .drop.hot { border-color: #0ea5e9; background: #f0f9ff; }
  .drop .big { font-size: 1rem; font-weight: 600; }
  .drop .hint { font-size: .8rem; color: #64748b; margin-top: .4rem; }
  .opts { display: flex; gap: .75rem; margin-top: 1rem; flex-wrap: wrap; }
  .opts label { font-size: .8rem; color: #64748b; display: flex; flex-direction: column; gap: .3rem; }
  input {
    border: 1px solid #cbd5e1; border-radius: 9px; padding: .5rem .7rem;
    font-size: .9rem; background: #fff; color: inherit; width: 190px;
  }
  #results { margin-top: 1.4rem; display: grid; gap: .9rem; }
  .card {
    border: 1px solid #e2e8f0; border-radius: 14px; background: #fff;
    padding: .9rem 1rem; display: flex; gap: 1rem; align-items: flex-start;
  }
  .card img { width: 84px; height: 84px; object-fit: cover; border-radius: 10px; border: 1px solid #e2e8f0; background: #f1f5f9; }
  .card .body { flex: 1; min-width: 0; }
  .card .name { font-size: .78rem; color: #64748b; word-break: break-all; margin-bottom: .45rem; }
  pre {
    margin: 0 0 .5rem; padding: .55rem .7rem; background: #f1f5f9; border-radius: 9px;
    font-size: .78rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }
  button {
    border: 1px solid #cbd5e1; background: #fff; color: inherit; cursor: pointer;
    border-radius: 8px; padding: .32rem .7rem; font-size: .78rem;
  }
  button:hover { border-color: #0ea5e9; color: #0284c7; }
  .err { color: #dc2626; font-size: .82rem; }
  .spinner { font-size: .82rem; color: #0284c7; }
</style>
</head>
<body>
<div class="wrap">
  <h1>PsychPedia 图床上传</h1>
  <p class="sub">把图片粘贴（Ctrl+V）或拖进下面的区域，自动传到 GitHub 并返回 Markdown 片段。</p>
  <p class="status" id="status">检查配置…</p>

  <div class="drop" id="drop">
    <div class="big">拖入图片，或点击选择，或直接 Ctrl+V 粘贴</div>
    <div class="hint">PNG / JPG / GIF / WebP / SVG · 单张最大 30MB</div>
    <input type="file" id="file" accept="image/*" multiple hidden />
  </div>

  <div class="opts">
    <label>图片描述（alt）
      <input id="alt" placeholder="如：喹硫平剂量依赖性受体占有" />
    </label>
    <label>显示宽度 px（可留空）
      <input id="width" type="number" min="0" step="10" placeholder="如：400" />
    </label>
  </div>

  <div id="results"></div>
</div>

<script>
const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
const results = document.getElementById('results');
const altInput = document.getElementById('alt');
const widthInput = document.getElementById('width');

fetch('/config').then(r => r.json()).then(cfg => {
  const el = document.getElementById('status');
  el.innerHTML = cfg.tokenReady
    ? '配置：<b>' + cfg.repo + '</b> @ ' + cfg.branch + ' · Token <span class="ok">已就绪</span>'
    : '配置：<b>' + cfg.repo + '</b> @ ' + cfg.branch + ' · Token <span class="bad">未配置</span>'
      + ' —— 请在 v2/.env 填入 GITHUB_TOKEN（参考 .env.example）后重启本工具';
});

drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => [...fileInput.files].forEach(handleFile));

['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => {
  e.preventDefault(); drop.classList.add('hot');
}));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => {
  e.preventDefault(); drop.classList.remove('hot');
}));
drop.addEventListener('drop', e => [...e.dataTransfer.files].forEach(handleFile));

document.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'));
  if (files.length) { e.preventDefault(); files.forEach(handleFile); }
});

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleFile(file) {
  if (!file.type.startsWith('image/')) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<div class="body"><div class="name">' + file.name + '</div><div class="spinner">上传中…</div></div>';
  results.prepend(card);

  try {
    const data = await readBase64(file);
    const res = await fetch('/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name || 'clipboard.png',
        mime: file.type,
        data,
        alt: altInput.value,
        width: widthInput.value,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));

    card.innerHTML =
      '<img src="' + json.rawUrl + '" alt="" loading="lazy" />' +
      '<div class="body">' +
      '<div class="name">' + json.path + '</div>' +
      '<pre>' + json.markdown.replace(/</g, '&lt;') + '</pre>' +
      '<button data-copy>复制 Markdown</button> ' +
      '<button data-copy-raw>复制直链</button>' +
      '</div>';
    const md = json.markdown, url = json.url;
    card.querySelector('[data-copy]').onclick = () => copy(md);
    card.querySelector('[data-copy-raw]').onclick = () => copy(url);
  } catch (err) {
    card.innerHTML = '<div class="body"><div class="name">' + file.name + '</div><div class="err">上传失败：' + err.message + '</div></div>';
  }
}

function copy(text) {
  navigator.clipboard.writeText(text).then(
    () => { const t = document.createElement('div'); t.className = 'spinner'; t.textContent = '已复制'; document.body.append(t); setTimeout(() => t.remove(), 900); },
    () => {}
  );
}
</script>
</body>
</html>`;

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    return send(res, 200, PAGE, 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && req.url === '/config') {
    const { repo, branch, token, cdn } = getConfig();
    return send(res, 200, JSON.stringify({ repo, branch, cdn, tokenReady: Boolean(token) }));
  }
  if (req.method === 'POST' && req.url === '/upload') {
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) throw new Error('图片超过 30MB 上限');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      const result = await uploadImage({
        buffer: Buffer.from(body.data || '', 'base64'),
        filename: body.name || 'image.png',
        mime: body.mime || '',
        alt: body.alt || '',
        width: body.width,
      });
      return send(res, 200, JSON.stringify(result));
    } catch (error) {
      return send(res, 500, JSON.stringify({ error: error.message }));
    }
  }
  send(res, 404, JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, HOST, () => {
  const { repo, token } = getConfig();
  console.log(`\n🖼  PsychPedia 图床上传工具已启动`);
  console.log(`   地址：http://${HOST}:${PORT}`);
  console.log(`   仓库：${repo}`);
  console.log(
    token
      ? `   Token：已就绪\n`
      : `   Token：未配置 —— 请在 v2/.env 写入 GITHUB_TOKEN（参考 .env.example）后重启\n`
  );
});
