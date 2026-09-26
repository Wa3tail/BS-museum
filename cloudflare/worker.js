/**
 * 北山博物馆 · Cloudflare Worker 反向代理
 * ================================================
 * 为什么需要：WorkBuddy 云端后端（beishan-museum.app.workbuddy.host）的 CORS
 * 预检白名单只放行平台自身域名，GitHub Pages（wa3tail.github.io）上的页面
 * 跨域调用会被浏览器拦截。本 Worker 以服务器身份转发请求并自行应答 CORS，
 * 使 GitHub Pages 前端可以正常访问后端。
 *
 * ── 部署步骤（网页方式，无需安装任何工具）──
 * 1. 打开 https://dash.cloudflare.com 注册/登录（免费计划即可）
 * 2. 左侧菜单 Workers & Pages → Create → Create Worker → 取名（如 bs-museum-proxy）→ Deploy
 * 3. 点 Edit code，把本文件全部内容粘贴进去，替换原有代码 → Deploy
 * 4. 记下分配的地址，形如 https://bs-museum-proxy.<你的子域>.workers.dev
 * 5. 回到前端仓库，把该地址填入 assets/js/core.js 的 GITHUB_PROXY_ENDPOINT 常量，提交推送
 *
 * ── 命令行方式（可选）──
 * npm install -g wrangler && wrangler login && 在本目录执行 wrangler deploy
 */

/* 允许跨域访问本代理的来源。换了域名/想本地调试就在这里加 */
const ALLOWED_ORIGINS = [
  'https://wa3tail.github.io',      // GitHub Pages 项目页（Origin 不含 /BS-museum 路径）
  'http://localhost:8000',          // 本地调试
  'http://127.0.0.1:8000',
];

/* 上游：WorkBuddy 云端后端 */
const UPSTREAM = 'https://beishan-museum.app.workbuddy.host';

/* 只转发云服务 API 路径，其它一律 404，避免代理被当成通用跳板 */
const ALLOWED_PREFIX = '/.cloud/';

function corsHeaders(origin, preflightHeaders) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': preflightHeaders ||
      'Authorization,X-Wb-Webapp-Access-Key,Content-Type,Accept,Prefer,Range,Content-Range,If-Match,If-None-Match,X-Request-Id,X-Device-Id,X-Wb-Webapp-Language',
    'Access-Control-Expose-Headers': 'X-Request-ID,X-Trace-Id',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // 来源校验：浏览器请求必带 Origin；curl 等无 Origin 的放行（便于调试）
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 浏览器跨域预检：由本 Worker 直接应答，不转发（后端白名单只认平台域名）
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(
          origin,
          request.headers.get('Access-Control-Request-Headers') || undefined
        ),
      });
    }

    if (!url.pathname.startsWith(ALLOWED_PREFIX)) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 转发到上游：剥掉暴露来源的头，其余（含 Authorization 登录令牌）原样透传
    const upstreamUrl = UPSTREAM + url.pathname + url.search;
    const headers = new Headers(request.headers);
    for (const h of ['origin', 'referer', 'host', 'x-forwarded-host', 'x-forwarded-proto']) {
      headers.delete(h);
    }

    const upstreamResp = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
      redirect: 'manual',
    });

    // 原样返回上游响应，并叠加 CORS 头
    const respHeaders = new Headers(upstreamResp.headers);
    Object.entries(corsHeaders(origin || ALLOWED_ORIGINS[0])).forEach(([k, v]) => respHeaders.set(k, v));
    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: respHeaders,
    });
  },
};
