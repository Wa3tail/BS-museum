/* 馆藏一览页 */

(function () {
  if (!window.cloud) { SiteCore.showOffline(); return; }

  let all = [];
  let activeFloor = 'ALL';

  const grid = SiteCore.$('#exhibitGrid');
  const empty = SiteCore.$('#gridEmpty');
  const chips = SiteCore.$('#floorChips');
  const searchInput = SiteCore.$('#searchInput');

  function cardHtml(item) {
    const tags = (item.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    return `
      <article class="card" data-id="${item.id}">
        <div class="card-figure">
          <img src="${SiteCore.escapeHtml(item.image_url || 'assets/img/sealed.svg')}" alt="${SiteCore.escapeHtml(item.name)}" loading="lazy" />
          <span class="code">${SiteCore.escapeHtml(item.code)}</span>
          <span class="floor">${SiteCore.escapeHtml(item.floor || '—')}</span>
        </div>
        <div class="card-body">
          <h3>${SiteCore.escapeHtml(item.name)}</h3>
          <div class="card-meta">
            <span>${SiteCore.escapeHtml(item.category || '')}</span>
            <span>${SiteCore.escapeHtml(item.era || '')}</span>
          </div>
          <p class="card-summary">${SiteCore.escapeHtml(item.summary || '')}</p>
          <div class="card-tags">${tags.map((t) => `<span class="tag">${SiteCore.escapeHtml(t)}</span>`).join('')}</div>
        </div>
      </article>`;
  }

  function render() {
    const kw = (searchInput.value || '').trim().toLowerCase();
    const list = all.filter((it) => {
      if (activeFloor !== 'ALL' && (it.floor || '') !== activeFloor) return false;
      if (!kw) return true;
      return [it.name, it.code, it.category, it.tags, it.summary, it.origin]
        .filter(Boolean).join(' ').toLowerCase().includes(kw);
    });
    grid.innerHTML = list.map(cardHtml).join('');
    empty.style.display = list.length ? 'none' : 'block';
    SiteCore.$$('.card', grid).forEach((card) => {
      card.addEventListener('click', () => openDetail(Number(card.dataset.id)));
    });
  }

  function renderChips() {
    const floors = Array.from(new Set(all.map((it) => it.floor).filter(Boolean))).sort();
    chips.innerHTML = [`<button class="chip is-on" data-floor="ALL" type="button">全部</button>`]
      .concat(floors.map((f) => `<button class="chip" data-floor="${SiteCore.escapeHtml(f)}" type="button">${SiteCore.escapeHtml(f)}</button>`))
      .join('');
    SiteCore.$$('.chip', chips).forEach((btn) => {
      btn.addEventListener('click', () => {
        SiteCore.$$('.chip', chips).forEach((b) => b.classList.remove('is-on'));
        btn.classList.add('is-on');
        activeFloor = btn.dataset.floor;
        render();
      });
    });
  }

  function openDetail(id) {
    const item = all.find((x) => x.id === id);
    if (!item) return;
    const html = `
      <div class="modal-figure"><img src="${SiteCore.escapeHtml(item.image_url || 'assets/img/sealed.svg')}" alt="${SiteCore.escapeHtml(item.name)}" /></div>
      <dl class="meta-grid">
        <div><dt>编号</dt><dd>${SiteCore.escapeHtml(item.code)}</dd></div>
        <div><dt>类别</dt><dd>${SiteCore.escapeHtml(item.category || '—')}</dd></div>
        <div><dt>楼层</dt><dd>${SiteCore.escapeHtml(item.floor || '—')}</dd></div>
        <div><dt>年代</dt><dd>${SiteCore.escapeHtml(item.era || '—')}</dd></div>
        <div><dt>来源</dt><dd>${SiteCore.escapeHtml(item.origin || '—')}</dd></div>
        <div><dt>密级</dt><dd>LV.${SiteCore.escapeHtml(item.clearance)}</dd></div>
      </dl>
      <div class="prose">${SiteCore.renderMarkdown(item.content_md || item.summary || '')}</div>
      <div class="notice" style="margin-top:22px">
        <strong>受限档案</strong>已移入内廊。登录并提交权限密钥后，可在该条目下方查看当前权限等级所能覆盖的档案内容。
        <div style="margin-top:10px;text-align:right"><span class="ghost-gate"><a href="inner.html" tabindex="-1" aria-hidden="true">内廊</a></span></div>
      </div>`;
    SiteCore.openModal(html);
    const head = SiteCore.$('#modal .modal-head h2');
    head.innerHTML = `${SiteCore.escapeHtml(item.name)} <span style="font-family:var(--mono);font-size:13px;color:var(--ink-dim)">${SiteCore.escapeHtml(item.code)}</span>`;
  }

  async function loadStats() {
    try {
      const staff = await SiteCore.fetchStaff();
      SiteCore.$('#statStaff').textContent = staff.length || 0;
    } catch (e) { SiteCore.$('#statStaff').textContent = '—'; }
  }

  async function boot() {
    SiteCore.initChrome('index.html');
    searchInput.addEventListener('input', render);
    try {
      all = await SiteCore.fetchExhibits();
    } catch (e) {
      grid.innerHTML = '<div class="empty">馆藏数据加载失败，请稍后刷新重试。</div>';
      return;
    }
    SiteCore.$('#statTotal').textContent = all.length;
    SiteCore.$('#statFloor').textContent = new Set(all.map((x) => x.floor).filter(Boolean)).size;
    renderChips();
    render();
    loadStats();
  }

  boot();
})();
