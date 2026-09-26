/* 内容页（博物馆介绍 / 关于）—— 由云端数据库 site_pages 驱动 */

(function () {
  if (!window.cloud) { SiteCore.showOffline(); return; }

  const key = document.body.dataset.page || 'museum';

  async function boot() {
    SiteCore.initChrome(document.body.dataset.nav || 'museum.html');
    try {
      const page = await SiteCore.fetchPage(key);
      if (!page) {
        SiteCore.$('#pageContent').innerHTML = '<div class="empty">内容尚未发布。</div>';
        return;
      }
      document.title = `${page.title} · 北山博物馆虚拟导览`;
      SiteCore.$('#pageTitle').textContent = page.title;
      if (page.subtitle) SiteCore.$('#pageSubtitle').textContent = page.subtitle;
      SiteCore.$('#pageContent').innerHTML = SiteCore.renderMarkdown(page.content_md || '');
    } catch (e) {
      SiteCore.$('#pageContent').innerHTML = '<div class="empty">内容加载失败，请稍后刷新重试。</div>';
    }
    renderFloorMap();
  }

  async function renderFloorMap() {
    const box = SiteCore.$('#floorMap');
    if (!box) return;
    try {
      const exhibits = await SiteCore.fetchExhibits();
      const byFloor = new Map();
      exhibits.forEach((it) => {
        const f = it.floor || '—';
        if (!byFloor.has(f)) byFloor.set(f, []);
        byFloor.get(f).push(it);
      });
      const floors = Array.from(byFloor.keys()).sort();
      box.innerHTML = floors.map((f) => {
        const items = byFloor.get(f);
        return `<article class="card" style="cursor:default">
          <div class="card-body">
            <div class="card-meta"><span style="font-family:var(--mono);letter-spacing:.12em">${SiteCore.escapeHtml(f)}</span></div>
            <h3>${items.length} 件展品</h3>
            <p class="card-summary">${items.map((i) => SiteCore.escapeHtml(i.name)).join(' · ')}</p>
          </div>
        </article>`;
      }).join('') || '<div class="empty">暂无楼层数据。</div>';
    } catch (e) {
      box.innerHTML = '';
    }
  }

  boot();
})();
