/* 内廊 —— 分级调阅视图 */

(function () {
  const KEY_STORE = 'bs_inner_clearance_key';

  const gate = SiteCore.$('#gate');
  const shell = SiteCore.$('#shell');
  const gateMsg = SiteCore.$('#gateMsg');
  const gateOps = SiteCore.$('#gateOps');
  const levelChip = SiteCore.$('#levelChip');
  const levelText = SiteCore.$('#levelText');
  const clrMsg = SiteCore.$('#clrMsg');
  const keyInput = SiteCore.$('#keyInput');
  const keyBtn = SiteCore.$('#keyBtn');
  const keyClear = SiteCore.$('#keyClear');
  const recordList = SiteCore.$('#recordList');
  const dossierGrid = SiteCore.$('#dossierGrid');

  let state = { level: 0, label: '未认证', admin: false, uid: null, exhibits: [], keepers: [] };

  function lockDenied(msg) {
    gate.style.display = 'grid';
    shell.style.display = 'none';
    gateMsg.textContent = msg || '内廊仅对已认证的馆内人员开放。';
    gateOps.style.display = 'grid';
  }

  function setLevel(level, label, admin) {
    state.level = level;
    state.label = label;
    state.admin = admin;
    levelText.textContent = `LV.${level} · ${label}`;
    levelChip.style.borderColor = level >= 3 ? 'var(--gold)' : 'var(--line)';
  }

  function statusBadge(status, clearance) {
    if (status === 'sealed') return '<span class="badge badge-locked">SEALED · 封存</span>';
    if (status === 'draft') return '<span class="badge">DRAFT · 草稿</span>';
    return `<span class="badge badge-ok">PUBLIC · 公开 LV.${SiteCore.escapeHtml(clearance)}</span>`;
  }

  function slotHtml(item) {
    const c = item.classified;
    if (!c || !c.id) {
      return `<div class="slot">
        <div class="slot-head">附加档案 · ATTACHMENT<span class="badge badge-blue" style="margin-left:auto">无附加受限档案</span></div>
        <div class="slot-body"><span class="hint">该条目目前没有附加的受限档案。</span></div>
      </div>`;
    }
    if (c.unlocked) {
      return `<div class="slot">
        <div class="slot-head">
          <span>RESTRICTED · ${SiteCore.escapeHtml(c.label || '受限档案')}</span>
          <span class="badge badge-ok">已解锁 LV.${SiteCore.escapeHtml(c.level)}</span>
        </div>
        <div class="slot-body">
          ${c.summary ? `<p style="margin:0 0 12px;font-family:var(--mono);font-size:12px;letter-spacing:.08em;color:var(--ink-dim)">摘要：${SiteCore.escapeHtml(c.summary)}</p>` : ''}
          <div class="prose">${SiteCore.renderMarkdown(c.content_md || '')}</div>
        </div>
      </div>`;
    }
    return `<div class="slot">
      <div class="slot-head">
        <span>RESTRICTED · ${SiteCore.escapeHtml(c.label || '受限档案')}</span>
        <span class="badge badge-locked">锁定 LV.${SiteCore.escapeHtml(c.level)}</span>
        <span class="ops">
          <input type="password" placeholder="权限密钥" data-keyfor="${item.id}" autocomplete="off" />
          <button class="btn btn-sm" type="button" data-unlock="${item.id}">解锁</button>
        </span>
      </div>
      <div class="slot-body">
        <div class="locked-view">
          <div class="hazard-strip"></div>
          <div class="locked-note">权限不足 · 本条档案需 LV.${SiteCore.escapeHtml(c.level)} 及以上授权方可调阅</div>
          <div class="redacted-lines"><span></span><span></span><span></span><span></span><span></span></div>
        </div>
      </div>
    </div>`;
  }

  function recordHtml(item) {
    const img = item.image_url || '';
    return `
      <article class="rec" data-id="${item.id}">
        <div class="rec-head">
          <div class="rec-figure">
            ${img ? `<img src="${SiteCore.escapeHtml(img)}" alt="${SiteCore.escapeHtml(item.name)}" loading="lazy" />` : '<div class="noimg">NO IMAGE</div>'}
          </div>
          <div class="rec-meta">
            <div class="rec-title">
              <h3>${SiteCore.escapeHtml(item.name)}</h3>
              <span class="code">${SiteCore.escapeHtml(item.code)}</span>
              ${statusBadge(item.status, item.clearance)}
            </div>
            <div class="rec-line">
              <span><b>类别</b> ${SiteCore.escapeHtml(item.category || '—')}</span>
              <span><b>楼层</b> ${SiteCore.escapeHtml(item.floor || '—')}</span>
              <span><b>年代</b> ${SiteCore.escapeHtml(item.era || '—')}</span>
              <span><b>来源</b> ${SiteCore.escapeHtml(item.origin || '—')}</span>
            </div>
            <p class="rec-summary">${SiteCore.escapeHtml(item.summary || '')}</p>
          </div>
        </div>
        <div class="rec-body">
          <div class="prose">${SiteCore.renderMarkdown(item.content_md || '')}</div>
          ${slotHtml(item)}
        </div>
      </article>`;
  }

  function fieldHtml(name, value, level, need, isMarkdown) {
    const unlocked = value != null && value !== '';
    if (unlocked) {
      const body = isMarkdown
        ? `<div class="prose md">${SiteCore.renderMarkdown(value)}</div>`
        : `<div>${SiteCore.escapeHtml(value)}</div>`;
      return `<div class="fr"><div class="k">${name}</div><div class="v">${body}</div></div>`;
    }
    return `<div class="fr is-locked">
      <div class="k">${name}</div>
      <div class="v">
        <span class="mask">██████ ████████ ██████ ██████████</span>
        <div class="lockbar">需 LV.${SiteCore.escapeHtml(need == null ? 5 : need)} 权限 · 当前 LV.${SiteCore.escapeHtml(level)}</div>
      </div>
    </div>`;
  }

  function keeperHtml(k) {
    const d = k.dossier || {};
    const initial = SiteCore.escapeHtml((k.name || '—').slice(0, 1));
    const needAv = Number(d.avatar_level || 2);
    const avLocked = !d.avatar && state.level < needAv;
    const inner = d.avatar
      ? `<img src="${SiteCore.escapeHtml(d.avatar)}" alt="${SiteCore.escapeHtml(k.name)}" loading="lazy" />`
      : (avLocked
        ? `<span class="av-lock"><b>◈</b><i>需 LV.${SiteCore.escapeHtml(needAv)}</i></span>`
        : `<span class="ini">${initial}</span>`);
    const rows = [
      fieldHtml('身份', d.identity, state.level, d.identity_level, false),
      fieldHtml('学历', d.education, state.level, d.education_level, false),
      fieldHtml('状况', d.condition, state.level, d.condition_level, false),
      fieldHtml('秘闻', d.secret_md, state.level, d.secret_level, true),
    ].join('');
    return `
      <article class="keeper">
        <div class="keeper-head">
          <div class="id-col">
            <figure class="id-frame${d.avatar ? ' has-img' : ''}">${inner}</figure>
            <span class="id-code">ID · ${SiteCore.escapeHtml(k.code_name || 'NO-CODE')}</span>
          </div>
          <div class="kh-main">
            <h3>${SiteCore.escapeHtml(k.name)}</h3>
            <div class="kh-sub">${SiteCore.escapeHtml(k.title || '—')}${k.department ? ' · ' + SiteCore.escapeHtml(k.department) : ''}</div>
            <div class="kh-meta">
              <span class="mini-chip">${SiteCore.escapeHtml(k.floor || '—')}</span>
              <span>${SiteCore.escapeHtml(k.contact || '')}</span>
            </div>
          </div>
        </div>
        <div class="keeper-fields">${rows}</div>
      </article>`;
  }

  function render() {
    recordList.innerHTML = state.exhibits.length
      ? state.exhibits.map(recordHtml).join('')
      : '<div class="empty">没有可显示的条目。</div>';
    dossierGrid.innerHTML = state.keepers.length
      ? state.keepers.map(keeperHtml).join('')
      : '<div class="empty">没有可显示的人事档案。</div>';

    SiteCore.$$('[data-unlock]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.unlock;
        const input = SiteCore.$(`[data-keyfor="${id}"]`);
        const code = (input && input.value || '').trim();
        if (!code) { SiteCore.toast('请输入权限密钥'); return; }
        btn.disabled = true; btn.textContent = '校验…';
        await load(code, true);
        btn.disabled = false; btn.textContent = '解锁';
      });
    });
  }

  async function load(code, silent) {
    try {
      const { data, error } = await cloud.database.rpc('inner_load', { p_code: code || null });
      const res = Array.isArray(data) ? data[0] : data;
      if (error) throw error;
      if (!res || res.ok === false) {
        if (!silent) clrMsg.innerHTML = `<span style="color:#E59274">${SiteCore.escapeHtml((res && res.message) || '认证失败')}</span>`;
        else SiteCore.toast((res && res.message) || '认证失败');
        return false;
      }
      state.exhibits = res.exhibits || [];
      state.keepers = res.keepers || [];
      state.uid = res.uid || null;
      setLevel(res.level, res.label, res.admin);
      render();
      if (code) {
        sessionStorage.setItem(KEY_STORE, code);
        keyInput.value = code;
        clrMsg.innerHTML = `<span style="color:var(--gold)">密钥已接受 · 当前等级 LV.${SiteCore.escapeHtml(res.level)} · ${SiteCore.escapeHtml(res.label)}</span>`;
      } else if (res.admin) {
        clrMsg.innerHTML = '<span style="color:var(--gold)">管理员身份已识别 · 自动授予 LV.5 全权限</span>';
      } else {
        clrMsg.innerHTML = '<span class="hint">未提交密钥 · 仅可查看公开层级内容</span>';
      }
      return true;
    } catch (e) {
      const msg = `读取失败：${SiteCore.escapeHtml(e.message || e)}`;
      if (!silent) clrMsg.innerHTML = `<span style="color:#E59274">${msg}</span>`;
      else SiteCore.toast('读取失败');
      return false;
    }
  }

  function initTabs() {
    SiteCore.$$('.in-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        SiteCore.$$('.in-tabs button').forEach((b) => b.classList.remove('is-on'));
        btn.classList.add('is-on');
        SiteCore.$$('.tab-pane').forEach((p) => p.classList.remove('is-on'));
        SiteCore.$(`#${btn.dataset.pane}`).classList.add('is-on');
      });
    });
  }

  async function boot() {
    if (!window.cloud) { gateMsg.textContent = '数据服务不可用，请稍后重试。'; gateOps.style.display = 'grid'; return; }

    const session = await SiteCore.getSession();
    if (!session) { lockDenied('内廊仅对已认证的馆内人员开放，请先完成身份认证。'); return; }

    gate.style.display = 'none';
    shell.style.display = 'block';

    SiteCore.$('#signOutBtn').addEventListener('click', async () => {
      await cloud.auth.signOut();
      sessionStorage.removeItem(KEY_STORE);
      location.reload();
    });
    keyBtn.addEventListener('click', async () => {
      const code = (keyInput.value || '').trim();
      if (!code) { clrMsg.innerHTML = '<span style="color:#E59274">请输入权限密钥</span>'; return; }
      keyBtn.disabled = true; keyBtn.textContent = '校验中…';
      await load(code, false);
      keyBtn.disabled = false; keyBtn.textContent = '提交认证';
    });
    keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') keyBtn.click(); });
    keyClear.addEventListener('click', () => {
      sessionStorage.removeItem(KEY_STORE);
      keyInput.value = '';
      load(null, false);
    });
    initTabs();

    const saved = sessionStorage.getItem(KEY_STORE) || '';
    await load(saved || null, false);
  }

  boot();

  /* 调试句柄：便于在控制台复核分级渲染逻辑 */
  window.__inner = { boot, load, render, state };
})();
