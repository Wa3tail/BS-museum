/* 北山博物馆 · 公共核心（云服务客户端 / Markdown / 通用组件） */

const PUBLIC_CONFIG = {
  endpoint: 'https://beishan-museum.app.workbuddy.host',
  publishableKey: 'wbpk_IV65AoQcpebbW87WWLnUoH_pGxB5lQm3MTueaLfGm6pPNmjEGpn6aAP',
};

/* ---------- GitHub Pages 部署支持 ----------
 * 云端后端的 CORS 预检白名单仅放行平台自身域名，GitHub Pages（*.github.io）
 * 无法直连，需经 Cloudflare Worker 反向代理（部署方法见 cloudflare/worker.js）。
 * Worker 部署后把分配的地址填到 GITHUB_PROXY_ENDPOINT；
 * 临时调试也可不动代码：localStorage.setItem('bs_proxy_endpoint', 'https://...') 后刷新。 */
const GITHUB_PROXY_ENDPOINT = ''; // 例: 'https://bs-museum-proxy.your-subdomain.workers.dev'

if (typeof location !== 'undefined' && location.hostname.endsWith('.github.io')) {
  PUBLIC_CONFIG.endpoint =
    localStorage.getItem('bs_proxy_endpoint') || GITHUB_PROXY_ENDPOINT || PUBLIC_CONFIG.endpoint;
}

/* ---------- 云服务客户端（全局唯一实例） ---------- */
const cloud = (function createClient() {
  if (typeof WorkBuddyCloud === 'undefined' || !WorkBuddyCloud.createWorkBuddyCloud) {
    console.error('[北山博物馆] 云服务 SDK 未加载');
    return null;
  }
  return WorkBuddyCloud.createWorkBuddyCloud({
    endpoint: PUBLIC_CONFIG.endpoint,
    publishableKey: PUBLIC_CONFIG.publishableKey,
  });
})();

window.cloud = cloud;

/* ---------- 小工具 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatBytes(n) {
  if (!n) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/* 简易 Markdown 兜底渲染（CDN 不可用时） */
function fallbackMarkdown(md) {
  const lines = String(md || '').split('\n');
  let out = '', inList = false;
  const inline = (s) => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      if (inList) { out += '</ul>'; inList = false; }
      const lv = line.match(/^#+/)[0].length;
      out += `<h${lv}>${inline(line.replace(/^#+\s/, ''))}</h${lv}>`;
    } else if (/^>\s?/.test(line)) {
      out += `<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`;
    } else if (/^[-*]\s/.test(line)) {
      if (!inList) { out += '<ul>'; inList = true; }
      out += `<li>${inline(line.replace(/^[-*]\s/, ''))}</li>`;
    } else if (line.trim() === '') {
      if (inList) { out += '</ul>'; inList = false; }
    } else {
      if (inList) { out += '</ul>'; inList = false; }
      out += `<p>${inline(line)}</p>`;
    }
  }
  if (inList) out += '</ul>';
  return out;
}

/* Markdown → HTML（marked + DOMPurify） */
function renderMarkdown(md) {
  if (!md) return '';
  let html;
  if (typeof marked !== 'undefined' && marked.parse) {
    try { html = marked.parse(md, { gfm: true, breaks: true }); } catch (e) { html = fallbackMarkdown(md); }
  } else {
    html = fallbackMarkdown(md);
  }
  if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
    html = DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] });
  }
  return html;
}

/* 提示条 */
let toastTimer = null;
function toast(message, ms = 2600) {
  let box = $('#toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    box.className = 'toast';
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('is-on'), ms);
}

/* ---------- 会话与权限 ---------- */
async function getSession() {
  if (!cloud) return null;
  const { data, error } = await cloud.auth.getSession();
  if (error) return null;
  return data || null;
}

async function getUserEmail() {
  const session = await getSession();
  return (session && session.user && session.user.email) || '';
}

async function currentRole() {
  if (!cloud) return 'guest';
  try {
    const { data, error } = await cloud.database.rpc('my_role');
    if (error) return 'guest';
    if (Array.isArray(data)) return data[0] === 'admin' ? 'admin' : 'guest';
    return data === 'admin' ? 'admin' : 'guest';
  } catch (e) {
    return 'guest';
  }
}

async function isAdmin() {
  return (await currentRole()) === 'admin';
}

/* ---------- 数据读取 ---------- */
async function fetchExhibits() {
  const { data, error } = await cloud.database
    .from('exhibits')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchStaff() {
  const { data, error } = await cloud.database
    .from('staff')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchPage(key) {
  const { data, error } = await cloud.database
    .from('site_pages')
    .select('*')
    .eq('page_key', key)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* 展品图片解析：dataURL / http / 相对路径 / 云端存储签名地址 */
async function resolveImageUrl(item) {
  if (!item) return '';
  if (item.image_url) return item.image_url;
  if (item.image_path && cloud) {
    try {
      const res = await cloud.storage.createSignedUrl(item.image_path, 3600);
      if (res && res.data && res.data.signedUrl) return res.data.signedUrl;
    } catch (e) { /* 访客无存储权限时静默回退 */ }
  }
  return 'assets/img/sealed.svg';
}

/* ---------- 站点外框 ---------- */
function initChrome(activePage) {
  $$('.site-nav a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.split('#')[0] === activePage) a.classList.add('is-active');
  });
  refreshAuthButton();
}

async function refreshAuthButton() {
  const btn = $('#authBtn');
  if (!btn || !cloud) return;
  try {
    const session = await getSession();
    if (!session) {
      btn.textContent = '登录 / 认证';
      btn.href = 'login.html';
      return;
    }
    const role = await currentRole();
    if (role === 'admin') {
      btn.textContent = '内部管理终端';
      btn.href = 'admin.html';
      btn.classList.add('btn-gold');
    } else {
      /* 已认证的访客：入口刻意保持低识别度，避免内廊被直接发现 */
      btn.textContent = '已认证';
      btn.href = 'inner.html';
      btn.classList.remove('btn-gold');
      btn.removeAttribute('title');
    }
  } catch (e) {
    btn.textContent = '登录 / 认证';
    btn.href = 'login.html';
  }
}

/* ---------- 弹窗 ---------- */
function openModal(html) {
  let mask = $('#modalMask');
  let modal = $('#modal');
  if (!modal) {
    mask = document.createElement('div');
    mask.id = 'modalMask';
    mask.className = 'modal-mask';
    modal = document.createElement('div');
    modal.id = 'modal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-head"><div class="row"><h2></h2><button class="modal-close" type="button" aria-label="关闭">✕</button></div></div><div class="modal-body"></div>';
    document.body.appendChild(mask);
    document.body.appendChild(modal);
    mask.addEventListener('click', closeModal);
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }
  modal.querySelector('.modal-body').innerHTML = html;
  modal.classList.add('is-open');
  mask.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  modal.scrollTop = 0;
}

function closeModal() {
  const modal = $('#modal');
  const mask = $('#modalMask');
  if (modal) modal.classList.remove('is-open');
  if (mask) mask.classList.remove('is-open');
  document.body.style.overflow = '';
}

/* 服务不可用提示 */
function showOffline(message) {
  const bar = document.createElement('div');
  bar.className = 'offline-banner';
  bar.textContent = message || '数据服务暂时不可用，请稍后重试。';
  document.body.insertBefore(bar, document.body.firstChild);
}

window.SiteCore = {
  $, $$, escapeHtml, formatDate, formatBytes, renderMarkdown, toast,
  getSession, getUserEmail, currentRole, isAdmin,
  fetchExhibits, fetchStaff, fetchPage, resolveImageUrl,
  initChrome, refreshAuthButton, openModal, closeModal, showOffline,
};
