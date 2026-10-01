/**
 * GitHub 图床上传核心（本地工具专用，切勿部署到线上）。
 *
 * 配置来源：v2/.env（已被 .gitignore 忽略），或进程环境变量：
 *   GITHUB_TOKEN   必填，GitHub PAT（细粒度令牌需对该仓库有 Contents: Read and write）
 *   GITHUB_REPO    默认 oneyokiman/obsidian-images
 *   GITHUB_BRANCH  默认 main
 *   IMAGE_CDN      默认 https://gcore.jsdelivr.net/gh/<repo>@<branch>（与词条中现有图片一致）
 */
import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(rootDir) {
  const file = path.join(rootDir, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, '');
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

export function getConfig() {
  const repo = process.env.GITHUB_REPO || 'oneyokiman/obsidian-images';
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN || '';
  const cdn = (process.env.IMAGE_CDN || `https://gcore.jsdelivr.net/gh/${repo}@${branch}`).replace(/\/$/, '');
  const raw = `https://raw.githubusercontent.com/${repo}/${branch}`;
  return { repo, branch, token, cdn, raw };
}

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
};

export function extOf(filename = '', mime = '') {
  const fromName = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName === 'jpeg' ? 'jpg' : fromName;
  return MIME_EXT[mime] || 'png';
}

function slugify(name) {
  const base = (name || 'image').replace(/\.[^.]+$/, '');
  return (
    base
      .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'image'
  );
}

/**
 * 上传图片到 GitHub 仓库，返回 CDN 直链与 Markdown 片段。
 * @param {{buffer: Buffer, filename: string, mime?: string, alt?: string, width?: number}} input
 */
export async function uploadImage({ buffer, filename, mime = '', alt = '', width }) {
  const { repo, branch, token, cdn, raw } = getConfig();
  if (!token) {
    throw new Error(
      '缺少 GITHUB_TOKEN。请在 v2/.env 中填入（可参考 v2/.env.example），或在终端设置同名环境变量。'
    );
  }
  if (!buffer?.length) throw new Error('图片内容为空');

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const repoPath = `img/${yyyy}/${mm}/${Date.now()}-${slugify(filename)}-${Math.random()
    .toString(36)
    .slice(2, 7)}.${extOf(filename, mime)}`;

  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodeURI(repoPath)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'psychpedia-image-host',
      },
      body: JSON.stringify({
        message: `upload image: ${repoPath}`,
        content: buffer.toString('base64'),
        branch,
      }),
    }
  );
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`GitHub 上传失败（HTTP ${res.status}）：${detail}`);
  }

  const url = `${cdn}/${repoPath}`;
  const label = alt.trim() || '描述';
  const size = width && Number(width) > 0 ? `|${Math.round(Number(width))}` : '';
  return {
    url,
    rawUrl: `${raw}/${repoPath}`,
    path: repoPath,
    markdown: `![${label}${size}](${url})`,
  };
}
