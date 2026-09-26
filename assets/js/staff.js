/* 各楼层管理员页 */

(function () {
  if (!window.cloud) { SiteCore.showOffline(); return; }

  const grid = SiteCore.$('#staffGrid');
  const empty = SiteCore.$('#staffEmpty');

  async function boot() {
    SiteCore.initChrome('staff.html');
    let list = [];
    try {
      list = await SiteCore.fetchStaff();
    } catch (e) {
      grid.innerHTML = '<div class="empty">值守信息加载失败，请稍后刷新重试。</div>';
      return;
    }
    if (!list.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    grid.innerHTML = list.map((p) => `
      <article class="staff-card" data-id="${p.id}">
        <div class="staff-top">
          <div class="avatar">${SiteCore.escapeHtml((p.name || '?').slice(0, 1))}</div>
          <div>
            <h3>${SiteCore.escapeHtml(p.name)}</h3>
            <div class="role">${SiteCore.escapeHtml(p.title || '楼层管理员')} · ${SiteCore.escapeHtml(p.department || '—')}</div>
          </div>
        </div>
        <span class="staff-floor">${SiteCore.escapeHtml(p.floor || '—')}</span>
        <div class="staff-bio">${SiteCore.escapeHtml((p.bio_md || '').replace(/[#>*`-]/g, '').slice(0, 90))}…</div>
        <div class="staff-contact">${SiteCore.escapeHtml(p.contact || '')}</div>
      </article>`).join('');

    SiteCore.$$('.staff-card', grid).forEach((card) => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const p = list.find((x) => String(x.id) === card.dataset.id);
        if (!p) return;
        SiteCore.openModal(`
          <dl class="meta-grid">
            <div><dt>楼层</dt><dd>${SiteCore.escapeHtml(p.floor || '—')}</dd></div>
            <div><dt>职务</dt><dd>${SiteCore.escapeHtml(p.title || '—')}</dd></div>
            <div><dt>负责</dt><dd>${SiteCore.escapeHtml(p.department || '—')}</dd></div>
            <div><dt>联系</dt><dd>${SiteCore.escapeHtml(p.contact || '—')}</dd></div>
          </dl>
          <div class="prose">${SiteCore.renderMarkdown(p.bio_md || '暂无说明。')}</div>`);
        SiteCore.$('#modal .modal-head h2').textContent = p.name;
      });
    });
  }

  boot();
})();
