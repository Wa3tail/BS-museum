/* 内部管理终端 —— 仅管理员可访问 */

(function () {
  const $ = SiteCore.$;
  const $$ = SiteCore.$$;

  if (!window.cloud) {
    $('#gateMsg').textContent = '云服务未加载，无法核验身份。';
    $('#gateOps').style.display = '';
    return;
  }

  let uid = null;
  let exhibits = [];
  let docs = [];
  let classified = [];
  let keepers = [];
  let dossiers = [];
  let refImages = [];
  let logRows = [];
  let lastKeyCount = 0;

  const edit = { exhibit: null, doc: null, cls: null, staff: null, dossier: null };

  /* ---------- 通用 ---------- */
  async function rpcOne(name, args) {
    const { data, error } = await cloud.database.rpc(name, args || {});
    if (error) throw new Error(error.message || `${name} 调用失败`);
    return Array.isArray(data) ? data[0] : data;
  }

  async function rpcAll(name, args) {
    const { data, error } = await cloud.database.rpc(name, args || {});
    if (error) throw new Error(error.message || `${name} 调用失败`);
    return Array.isArray(data) ? data : [];
  }

  function safeName(name) {
    return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  }

  async function uploadToCloud(file, folder) {
    const path = cloud.storage.sharedPath(uid, `${folder}/${Date.now()}-${safeName(file.name)}`);
    const res = await cloud.storage.upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });
    if (res && res.error) throw new Error(res.error.message || '上传失败');
    return path;
  }

  function fileToDataUrl(file, max = 1000) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('图片解析失败'));
        img.onload = () => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsText(file);
    });
  }

  /* ---------- 未保存标记 / 快捷保存 ---------- */
  const editorRegistry = {
    exhibit: { box: '#exEditor', save: () => saveExhibit(), dirty: '#exDirty' },
    doc: { box: '#docEditor', save: () => saveDoc(), dirty: '#docDirty' },
    cls: { box: '#clsEditor', save: () => saveCls(), dirty: '#clsDirty' },
    staff: { box: '#stEditor', save: () => saveStaff(), dirty: '#stDirty' },
    dossier: { box: '#dsEditor', save: () => saveDossier(), dirty: '#dsDirty' },
  };

  function markDirty(sel) {
    const el = $(sel);
    if (!el) return;
    el.textContent = '未保存改动 · CTRL/⌘ + S';
    el.classList.add('is-dirty');
  }

  function clearDirty(sel) {
    const el = $(sel);
    if (!el) return;
    el.textContent = '已保存';
    el.classList.remove('is-dirty');
  }

  function watchDirty(boxSel, dirtySel) {
    const box = $(boxSel);
    if (!box || box.dataset.watched) return;
    box.dataset.watched = '1';
    const mark = (e) => {
      if (e.target && e.target.id && /^(dsAvatarPick|dsAvatarClear|exCancel|docCancel|clsCancel|stCancel|dsCancel)/.test(e.target.id)) return;
      markDirty(dirtySel);
    };
    box.addEventListener('input', mark);
    box.addEventListener('change', mark);
  }

  function initShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== 's') return;
      const open = Object.keys(editorRegistry)
        .find((k) => $(editorRegistry[k].box) && $(editorRegistry[k].box).style.display !== 'none');
      if (!open) return;
      e.preventDefault();
      editorRegistry[open].save();
    });
  }

  /* ---------- Markdown 快捷插入 ---------- */
  const MD_SNIPPETS = {
    h2: { wrap: ['\n## ', '\n'] },
    h3: { wrap: ['\n### ', '\n'] },
    bold: { wrap: ['**', '**'] },
    italic: { wrap: ['*', '*'] },
    ul: { wrap: ['\n- ', '\n'] },
    quote: { wrap: ['\n> ', '\n'] },
    code: { wrap: ['\n```\n', '\n```\n'] },
    hr: { wrap: ['\n\n---\n\n', ''] },
    table: { insert: '\n| 项目 | 数值 |\n| --- | --- |\n| 示例 | 12 |\n' },
    link: { insert: '[链接文字](https://)' },
    img: { insert: '![图注](配图地址)' },
  };

  function applyMd(textarea, kind) {
    const rule = MD_SNIPPETS[kind];
    if (!rule) return;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const value = textarea.value || '';
    if (rule.insert) {
      textarea.value = value.slice(0, start) + rule.insert + value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + rule.insert.length;
    } else {
      const sel = value.slice(start, end) || (kind === 'h2' ? '小标题' : kind === 'h3' ? '小标题' : '文字');
      const text = rule.wrap[0] + sel + rule.wrap[1];
      textarea.value = value.slice(0, start) + text + value.slice(end);
      textarea.selectionStart = start + rule.wrap[0].length;
      textarea.selectionEnd = textarea.selectionStart + sel.length;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
  }

  function initMdTools() {
    $$('.md-tools').forEach((bar) => {
      const target = $(`#${bar.dataset.target}`);
      if (!target) return;
      bar.querySelectorAll('[data-md]').forEach((b) => {
        b.addEventListener('click', () => applyMd(target, b.dataset.md));
      });
    });
  }

  /* ---------- 拖拽上传 ---------- */
  function initDropzones() {
    $$('.dropzone').forEach((zone) => {
      const input = zone.querySelector('input[type=file]');
      if (!input) return;
      const over = (e) => { e.preventDefault(); zone.classList.add('is-over'); };
      const out = (e) => { e.preventDefault(); zone.classList.remove('is-over'); };
      zone.addEventListener('dragenter', over);
      zone.addEventListener('dragover', over);
      zone.addEventListener('dragleave', out);
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('is-over');
        const dt = e.dataTransfer;
        if (!dt || !dt.files || !dt.files.length) return;
        try { input.files = dt.files; } catch (err) { /* 部分浏览器不支持写入 files */ }
        input.dispatchEvent(new Event('change'));
      });
      zone.addEventListener('click', (e) => {
        if (e.target === input) return;
        e.preventDefault();
        input.click();
      });
    });
  }

  /* ---------- 列表检索 ---------- */
  function bindSearch(sel, handler) {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('input', handler);
  }

  function keyword(sel) {
    const el = $(sel);
    return el ? (el.value || '').trim().toLowerCase() : '';
  }

  function hit(kw, ...fields) {
    return !kw || fields.filter(Boolean).join(' ').toLowerCase().includes(kw);
  }

  /* ---------- 证件照（一寸 295×413 / 自适应） ---------- */
  function processIdPhoto(file, mode) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('图片解析失败'));
        img.onload = () => {
          const RATIO = 295 / 413;
          let sx = 0, sy = 0, sw = img.width, sh = img.height, tw, th;
          if (mode === 'id') {
            if (img.width / img.height > RATIO) { sw = img.height * RATIO; sx = (img.width - sw) / 2; }
            else { sh = img.width / RATIO; sy = (img.height - sh) / 2; }
            tw = 590; th = Math.round(tw / RATIO);
          } else {
            const scale = Math.min(1, 620 / Math.max(img.width, img.height));
            tw = Math.max(1, Math.round(img.width * scale));
            th = Math.max(1, Math.round(img.height * scale));
          }
          const canvas = document.createElement('canvas');
          canvas.width = tw; canvas.height = th;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#0C0E0B';
          ctx.fillRect(0, 0, tw, th);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          const done = (blob) => resolve({ dataUrl, blob, width: tw, height: th });
          if (canvas.toBlob) canvas.toBlob(done, 'image/jpeg', 0.82); else done(null);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderAvatarPreview(d) {
    const img = $('#dsAvatarImg');
    const ini = $('#dsAvatarIni');
    const name = (keepers.find((p) => p.id === (d ? d.staff_id : Number($('#dsStaff').value))) || {}).name || '—';
    if (d && d.avatar_url) {
      img.src = d.avatar_url; img.hidden = false; ini.style.display = 'none';
    } else {
      img.hidden = true; img.removeAttribute('src');
      ini.style.display = ''; ini.textContent = name.slice(0, 1);
    }
    const hint = $('#dsAvatarHint');
    if (hint) {
      hint.textContent = d && d.avatar_url
        ? `已上传 · 可见等级 LV.${d.avatar_level}${d.avatar_path ? ' · 原图已归档云端' : ''}`
        : '未上传 · 前台内廊将显示姓名首字';
    }
  }

  async function uploadDossierAvatar(file) {
    const d = edit.dossier;
    if (!d) { SiteCore.toast('请先保存秘档，再上传证件照'); return; }
    if (file.size > 8 * 1024 * 1024) { SiteCore.toast('图片过大（上限 8MB）'); return; }
    const mode = $('#dsAvatarMode').value;
    $('#dsAvatarHint').textContent = '处理中…';
    try {
      const { dataUrl, blob } = await processIdPhoto(file, mode);
      let path = d.avatar_path || null;
      try {
        path = await uploadToCloud(blob || file, 'avatars');
      } catch (e) {
        SiteCore.toast('原图归档失败，已仅保存渲染图');
      }
      const res = await cloud.database.from('staff_dossiers')
        .update({ avatar_url: dataUrl, avatar_path: path, updated_at: new Date().toISOString() })
        .eq('id', d.id).select();
      if (res.error) throw new Error(res.error.message);
      if (!Array.isArray(res.data) || !res.data.length) throw new Error('写入未生效，请确认管理员权限');
      SiteCore.toast(`证件照已更新 · ${mode === 'id' ? '一寸规格' : '自适应'}`);
      await loadDossiers();
      edit.dossier = dossiers.find((x) => x.id === d.id) || d;
      renderAvatarPreview(edit.dossier);
    } catch (e) {
      SiteCore.toast('证件照上传失败：' + (e.message || e));
      renderAvatarPreview(edit.dossier);
    }
  }

  async function clearDossierAvatar() {
    const d = edit.dossier;
    if (!d) { SiteCore.toast('请先保存秘档'); return; }
    const res = await cloud.database.from('staff_dossiers')
      .update({ avatar_url: null, avatar_path: null, updated_at: new Date().toISOString() })
      .eq('id', d.id).select();
    if (res.error) { SiteCore.toast('移除失败：' + res.error.message); return; }
    SiteCore.toast('已移除证件照');
    await loadDossiers();
    edit.dossier = dossiers.find((x) => x.id === d.id) || d;
    renderAvatarPreview(edit.dossier);
  }

  /* ---------- 配图（日志 / 档案正文附加图） ---------- */
  function processShot(file) {
    return new Promise((resolve, reject) => {
      const MAX = 1280;
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('图片解析失败'));
        img.onload = () => {
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          if (scale >= 1 && file.size < 400 * 1024) { resolve({ blob: file }); return; }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          const done = (blob) => resolve({ blob: blob || file, dataUrl });
          if (canvas.toBlob) canvas.toBlob(done, 'image/jpeg', 0.78); else done(null);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function loadRefImages() {
    const { data, error } = await cloud.database
      .from('ref_images').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true });
    if (error) return;
    refImages = data || [];
  }

  function shotsFor(type, id) {
    return refImages.filter((x) => x.ref_type === type && String(x.ref_id) === String(id));
  }

  async function addShot(refType, refId, file) {
    const { blob, dataUrl } = await processShot(file);
    const path = await uploadToCloud(blob, refType === 'document' ? 'doc-shots' : 'cls-shots');
    const thumb = dataUrl || await fileToDataUrl(blob, 640);
    const row = {
      owner_id: uid,
      ref_type: refType,
      ref_id: refId,
      image_url: thumb,
      image_path: path,
      caption: '',
      sort_order: Date.now(),
    };
    const res = await cloud.database.from('ref_images').insert(row).select();
    if (res.error) throw new Error(res.error.message);
    return (res.data && res.data[0]) || row;
  }

  async function deleteShot(id) {
    const res = await cloud.database.from('ref_images').delete().eq('id', id).select();
    if (res.error) { SiteCore.toast('删除失败'); return false; }
    await loadRefImages();
    return true;
  }

  /* 渲染配图栅格：editable = 编辑器（可改说明 / 插入正文 / 删除） */
  function renderShotGrid(box, list, editable, textareaSel) {
    if (!box) return;
    if (!list.length) { box.innerHTML = '<div class="hint">暂无配图</div>'; return; }
    box.innerHTML = list.map((s) => `
      <figure class="shot">
        <img src="${SiteCore.escapeHtml(s.image_url || 'assets/img/sealed.svg')}" alt="" loading="lazy" />
        ${editable ? `
          <input class="shot-cap" type="text" value="${SiteCore.escapeHtml(s.caption || '')}" placeholder="图注" data-cap="${s.id}" />
          <div class="shot-ops">
            <button class="btn btn-sm" type="button" data-ins="${s.id}">插入正文</button>
            <button class="btn btn-sm btn-danger" type="button" data-del-shot="${s.id}">删除</button>
          </div>` : `<figcaption>${SiteCore.escapeHtml(s.caption || '')}</figcaption>`}
      </figure>`).join('');

    if (!editable) return;
    box.querySelectorAll('[data-del-shot]').forEach((b) => b.addEventListener('click', async () => {
      await deleteShot(Number(b.dataset.delShot));
      SiteCore.toast('已删除配图');
      refreshShotViews();
    }));
    box.querySelectorAll('[data-ins]').forEach((b) => b.addEventListener('click', () => {
      const s = list.find((x) => String(x.id) === b.dataset.ins);
      if (!s) return;
      const ta = $(textareaSel);
      if (!ta) return;
      const snippet = `\n\n![](${s.image_url})\n`;
      ta.value = `${ta.value || ''}${snippet}`;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      SiteCore.toast('已插入正文');
    }));
    box.querySelectorAll('[data-cap]').forEach((input) => {
      input.addEventListener('change', async () => {
        await cloud.database.from('ref_images').update({ caption: input.value }).eq('id', Number(input.dataset.cap));
        const s = list.find((x) => String(x.id) === input.dataset.cap);
        if (s) s.caption = input.value;
      });
    });
  }

  /* 编辑中的配图面板刷新（当前编辑对象是文档还是受限档案） */
  function refreshShotViews() {
    const doc = edit.doc;
    if (doc) renderShotGrid($('#docShotGrid'), shotsFor('document', doc.id), true, '#docContent');
    const cls = edit.cls;
    if (cls) renderShotGrid($('#clsShotGrid'), shotsFor('classified', cls.id), true, '#clsContent');
    renderDocs();
    renderClassified();
  }

  async function handleShotFiles(refType, refId, input) {
    const files = Array.from((input && input.files) || []);
    if (!files.length) return;
    input.value = '';
    if (!refId) { SiteCore.toast('请先保存条目，再上传配图'); return; }
    for (const f of files) {
      if (f.size > 8 * 1024 * 1024) { SiteCore.toast(`跳过超大文件：${f.name}`); continue; }
      try { await addShot(refType, refId, f); } catch (e) { SiteCore.toast(`配图上传失败：${e.message || e}`); }
    }
    await loadRefImages();
    refreshShotViews();
    SiteCore.toast('配图已上传');
  }

  function bindPreview(inputSel, previewSel) {
    const input = $(inputSel);
    const box = $(previewSel);
    if (!input || !box) return;
    const update = () => { box.innerHTML = SiteCore.renderMarkdown(input.value || ''); };
    input.addEventListener('input', update);
    update();
  }

  async function confirmDelete(label) {
    return window.confirm(`确认删除「${label}」？该操作不可撤销。`);
  }

  /* ---------- 身份校验 ---------- */
  async function guard() {
    const session = await SiteCore.getSession();
    if (!session) {
      $('#gateMsg').textContent = '需要管理员身份认证后才能访问内部终端。';
      $('#gateOps').style.display = '';
      return false;
    }
    const role = await SiteCore.currentRole();
    if (role !== 'admin') {
      $('#gateMsg').textContent = '当前账号为访客身份，不具备内部终端访问权限。';
      $('#gateOps').style.display = '';
      return false;
    }
    uid = session.user.id;
    $('#termUid').textContent = `${(session.user.email || 'ADMIN')} · ADMIN`;
    $('#gate').style.display = 'none';
    $('#terminal').style.display = '';
    return true;
  }

  /* ---------- 导航 ---------- */
  const PANE_STORE = 'bs_admin_pane';

  function setPane(name, quiet) {
    const target = $(`#${name}`);
    if (!target) return;
    $$('.nav-item').forEach((b) => b.classList.toggle('is-on', b.dataset.pane === name));
    $$('.tab-pane').forEach((p) => p.classList.toggle('is-on', p.id === name));
    try { localStorage.setItem(PANE_STORE, name); } catch (e) { /* 隐私模式下忽略 */ }
    if (name === 'paneKeys') loadKeys();
    if (name === 'paneLog') loadLog();
    if (name === 'paneDossiers') loadDossiers();
    if (name === 'paneStaff') loadKeepers();
    if (!quiet) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateCounts() {
    const counts = {
      exhibits: exhibits.length,
      docs: docs.length,
      classified: classified.length,
      staff: keepers.length,
      dossiers: dossiers.length,
      keys: lastKeyCount,
    };
    Object.keys(counts).forEach((k) => {
      $$(`[data-count="${k}"]`).forEach((el) => { el.textContent = counts[k]; });
      $$(`[data-stat="${k}"]`).forEach((el) => { el.textContent = counts[k]; });
    });
  }

  function initTabs() {
    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => setPane(btn.dataset.pane));
    });
    $$('.stat[data-pane]').forEach((btn) => {
      btn.addEventListener('click', () => setPane(btn.dataset.pane));
    });
    $$('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const map = {
          exNew: ['paneExhibits', openExhibitEditor],
          docNew: ['paneDocs', openDocEditor],
          clsNew: ['paneClassified', openClsEditor],
          stNew: ['paneStaff', openStaffEditor],
          dsNew: ['paneDossiers', openDossierEditor],
        };
        const conf = map[btn.dataset.quick];
        if (!conf) return;
        setPane(conf[0]);
        setTimeout(() => conf[1](null), 60);
      });
    });
    $('#termSignOut').addEventListener('click', async () => {
      await cloud.auth.signOut();
      location.href = 'index.html';
    });
  }

  /* ---------- 馆藏档案 ---------- */
  async function loadExhibits() {
    const { data, error } = await cloud.database
      .from('exhibits').select('*')
      .order('sort_order', { ascending: true }).order('id', { ascending: true });
    if (error) { SiteCore.toast('馆藏加载失败'); return; }
    exhibits = data || [];
    renderExhibits();
    renderRefOptions();
    updateCounts();
  }

  function renderExhibits() {
    const kw = keyword('#exSearch');
    const list = exhibits.filter((it) => hit(kw, it.code, it.name, it.tags, it.category, it.floor));
    const box = $('#exList');
    if (!list.length) { box.innerHTML = '<div class="empty">NO RECORD</div>'; return; }
    box.innerHTML = list.map((it) => `
      <div class="list-row">
        <img class="thumb" src="${SiteCore.escapeHtml(it.image_url || 'assets/img/sealed.svg')}" alt="" />
        <div class="main">
          <div class="title">${SiteCore.escapeHtml(it.name)}
            <span class="badge ${it.status === 'public' ? 'badge-ok' : 'badge-alert'}">${SiteCore.escapeHtml(it.status)}</span>
            <span class="badge badge-gold">LV.${SiteCore.escapeHtml(it.clearance)}</span>
          </div>
          <div class="sub">${SiteCore.escapeHtml(it.code)} · ${SiteCore.escapeHtml(it.floor || '—')} · ${SiteCore.escapeHtml(it.category || '—')} · 排序 ${SiteCore.escapeHtml(it.sort_order)}</div>
          <div class="excerpt">${SiteCore.escapeHtml(it.summary || '')}</div>
        </div>
        <div class="ops">
          <button class="btn btn-sm" data-edit-ex="${it.id}" type="button">编辑</button>
          <button class="btn btn-sm btn-danger" data-del-ex="${it.id}" type="button">删除</button>
        </div>
      </div>`).join('');

    $$('[data-edit-ex]', box).forEach((b) => b.addEventListener('click', () => openExhibitEditor(Number(b.dataset.editEx))));
    $$('[data-del-ex]', box).forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.delEx);
      const it = exhibits.find((x) => x.id === id);
      if (!await confirmDelete(it ? it.name : id)) return;
      const res = await cloud.database.from('exhibits').delete().eq('id', id).select();
      if (res.error) { SiteCore.toast('删除失败：' + res.error.message); return; }
      if (!Array.isArray(res.data) || !res.data.length) { SiteCore.toast('删除未生效，请确认权限'); return; }
      SiteCore.toast('已删除');
      loadExhibits();
    }));
  }

  function openExhibitEditor(id) {
    edit.exhibit = id ? exhibits.find((x) => x.id === id) : null;
    const it = edit.exhibit;
    $('#exEditorTitle').textContent = it ? `编辑条目 · ${it.code}` : '新建展品条目';
    $('#exCode').value = it ? it.code : '';
    $('#exName').value = it ? it.name : '';
    $('#exCategory').value = it ? (it.category || '') : '';
    $('#exFloor').value = it ? (it.floor || '') : '';
    $('#exEra').value = it ? (it.era || '') : '';
    $('#exOrigin').value = it ? (it.origin || '') : '';
    $('#exStatus').value = it ? it.status : 'public';
    $('#exClearance').value = it ? it.clearance : 1;
    $('#exSort').value = it ? it.sort_order : 100;
    $('#exTags').value = it ? (it.tags || '') : '';
    $('#exSummary').value = it ? (it.summary || '') : '';
    $('#exContent').value = it ? (it.content_md || '') : '';
    $('#exThumb').src = it ? (it.image_url || 'assets/img/sealed.svg') : 'assets/img/sealed.svg';
    $('#exImageHint').textContent = it && it.image_path ? `云端存储：${it.image_path}` : '未上传原图';
    $('#exImage').value = '';
    $('#exEditor').style.display = '';
    bindPreview('#exContent', '#exPreview');
    clearDirty('#exDirty');
    $('#exEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveExhibit() {
    const btn = $('#exSave');
    btn.disabled = true;
    try {
      const payload = {
        code: $('#exCode').value.trim(),
        name: $('#exName').value.trim(),
        category: $('#exCategory').value.trim() || '未分类',
        floor: $('#exFloor').value.trim() || '—',
        era: $('#exEra').value.trim(),
        origin: $('#exOrigin').value.trim(),
        summary: $('#exSummary').value.trim(),
        content_md: $('#exContent').value,
        tags: $('#exTags').value.trim(),
        status: $('#exStatus').value,
        clearance: Number($('#exClearance').value || 1),
        sort_order: Number($('#exSort').value || 100),
        updated_at: new Date().toISOString(),
      };
      if (!payload.code || !payload.name) { SiteCore.toast('编号与名称必填'); return; }

      const file = $('#exImage').files && $('#exImage').files[0];
      if (file) {
        payload.image_url = await fileToDataUrl(file);
        payload.image_path = await uploadToCloud(file, 'exhibits');
        $('#exThumb').src = payload.image_url;
      }

      let res;
      if (edit.exhibit) {
        res = await cloud.database.from('exhibits').update(payload).eq('id', edit.exhibit.id).select();
      } else {
        res = await cloud.database.from('exhibits').insert(payload).select();
      }
      if (res.error) throw new Error(res.error.message);
      if (!Array.isArray(res.data) || !res.data.length) throw new Error('写入未生效，请确认管理员权限');
    /* 新建的展品保持编辑器打开，便于继续完善配图与正文 */
    if (edit.exhibit) {
      $('#exEditor').style.display = 'none';
      edit.exhibit = null;
    } else if (res.data[0]) {
      openExhibitEditor(res.data[0].id);
    }
    clearDirty('#exDirty');
    } catch (e) {
      SiteCore.toast('保存失败：' + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- 文档与日志 ---------- */
  async function loadDocs() {
    const { data, error } = await cloud.database
      .from('documents').select('*').order('created_at', { ascending: false });
    if (error) { SiteCore.toast('文档加载失败'); return; }
    docs = data || [];
    renderDocs();
    renderRefOptions();
    updateCounts();
  }

  function renderDocs() {
    const box = $('#docList');
    const kw = keyword('#docSearch');
    const list = docs.filter((d) => hit(kw, d.title, d.exhibit_code, d.doc_type, d.content_md));
    if (!list.length) { box.innerHTML = '<div class="empty">NO RECORD</div>'; return; }
    box.innerHTML = list.map((d) => {
    const g = shotsFor('document', d.id);
    const gallery = g.length ? `<div class="shot-strip">${g.map((s) => `
      <figure class="shot-mini">
        <img src="${SiteCore.escapeHtml(s.image_url || '')}" alt="" loading="lazy" />
        <figcaption>${SiteCore.escapeHtml(s.caption || '配图')}</figcaption>
      </figure>`).join('')}</div>` : '';
    const provides = [
      d.file_path ? '<button class="btn btn-sm" data-dl-doc="' + d.id + '" type="button">下载附件</button>' : '',
      g.length ? `<span class="badge">配图 ${g.length}</span>` : '',
    ].join('');
    return `
      <div class="list-row">
        <div class="main">
          <div class="title">${SiteCore.escapeHtml(d.title)}
            <span class="badge badge-gold">${SiteCore.escapeHtml(d.doc_type)}</span>
            <span class="badge">LV.${SiteCore.escapeHtml(d.clearance)}</span>
          </div>
          <div class="sub">${SiteCore.escapeHtml(d.exhibit_code || '未关联')} · ${SiteCore.formatDate(d.created_at)}${d.file_name ? ' · ' + SiteCore.escapeHtml(d.file_name) + ' (' + SiteCore.formatBytes(d.file_size) + ')' : ''}</div>
          <div class="excerpt">${SiteCore.escapeHtml((d.content_md || '').slice(0, 140))}</div>
          ${gallery}
        </div>
        <div class="ops">
          ${provides}
          <button class="btn btn-sm" data-edit-doc="${d.id}" type="button">编辑</button>
          <button class="btn btn-sm btn-danger" data-del-doc="${d.id}" type="button">删除</button>
        </div>
      </div>`;
  }).join('');

    $$('[data-edit-doc]', box).forEach((b) => b.addEventListener('click', () => openDocEditor(Number(b.dataset.editDoc))));
    $$('[data-dl-doc]', box).forEach((b) => b.addEventListener('click', async () => {
      const d = docs.find((x) => String(x.id) === b.dataset.dlDoc);
      const signed = await cloud.storage.createSignedUrl(d.file_path, 600);
      if (signed.error || !signed.data) { SiteCore.toast('无法生成下载链接'); return; }
      window.open(signed.data.signedUrl || signed.data.url || signed.data, '_blank');
    }));
    $$('[data-del-doc]', box).forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.delDoc);
      const d = docs.find((x) => x.id === id);
      if (!await confirmDelete(d ? d.title : id)) return;
      const res = await cloud.database.from('documents').delete().eq('id', id).select();
      if (res.error) { SiteCore.toast('删除失败'); return; }
      SiteCore.toast('已删除');
      loadDocs();
    }));
  }

  function openDocEditor(id) {
    edit.doc = id ? docs.find((x) => x.id === id) : null;
    const d = edit.doc;
    $('#docEditorTitle').textContent = d ? `编辑文档 · ${d.title}` : '新建文档';
    $('#docTitle').value = d ? d.title : '';
    $('#docType').value = d ? d.doc_type : 'log';
    $('#docExhibit').value = d && d.exhibit_code ? d.exhibit_code : '';
    $('#docClearance').value = d ? d.clearance : 1;
    $('#docContent').value = d ? (d.content_md || '') : '';
    $('#docFileHint').textContent = d && d.file_path ? `已归档：${d.file_path}` : '未上传附件';
    $('#docFile').value = '';
    $('#docImages').value = '';
    $('#docEditor').style.display = '';
    bindPreview('#docContent', '#docPreview');
    renderShotGrid($('#docShotGrid'), d ? shotsFor('document', d.id) : [], true, '#docContent');
    clearDirty('#docDirty');
    $('#docShotHint').textContent = d
      ? (refImages.some((x) => x.ref_type === 'document' && String(x.ref_id) === String(d.id)) ? '已上传的配图如下，可改图注、插入正文或删除' : '支持多选，上传后自动归档至云端存储')
      : '新建文档请先保存，保存后即可上传配图';
    $('#docEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveDoc() {
    const btn = $('#docSave');
    btn.disabled = true;
    try {
      const payload = {
        title: $('#docTitle').value.trim(),
        doc_type: $('#docType').value,
        exhibit_code: $('#docExhibit').value || null,
        clearance: Number($('#docClearance').value || 1),
        content_md: $('#docContent').value,
        updated_at: new Date().toISOString(),
      };
      if (!payload.title) { SiteCore.toast('标题必填'); return; }

      const file = $('#docFile').files && $('#docFile').files[0];
      if (file) {
        payload.file_name = file.name;
        payload.file_size = file.size;
        payload.file_path = await uploadToCloud(file, 'documents');
        if (/\.(md|markdown|txt)$/i.test(file.name)) {
          const text = await readTextFile(file);
          if (text && !payload.content_md.trim()) payload.content_md = text;
        }
        $('#docFileHint').textContent = `已上传：${payload.file_path}`;
      }

      const wasEdit = !!edit.doc;
      let res;
      if (edit.doc) {
        res = await cloud.database.from('documents').update(payload).eq('id', edit.doc.id).select();
      } else {
        res = await cloud.database.from('documents').insert(payload).select();
      }
      if (res.error) throw new Error(res.error.message);
      if (!Array.isArray(res.data) || !res.data.length) throw new Error('写入未生效，请确认管理员权限');
      SiteCore.toast('已保存');
      await loadDocs();
      await loadRefImages();
      /* 新建的文档保持编辑器打开，便于立即上传配图 */
      if (!wasEdit && res.data[0]) openDocEditor(res.data[0].id);
      else { $('#docEditor').style.display = 'none'; edit.doc = null; renderDocs(); }
      clearDirty('#docDirty');
    } catch (e) {
      SiteCore.toast('保存失败：' + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- 受限档案 ---------- */
  async function loadClassified() {
    const { data, error } = await cloud.database
      .from('classified_entries').select('*').order('level', { ascending: false });
    if (error) { SiteCore.toast('受限档案加载失败'); return; }
    classified = data || [];
    renderClassified();
    updateCounts();
  }

  function renderClassified() {
    const box = $('#clsList');
    const kw = keyword('#clsSearch');
    const list = classified.filter((c) => hit(kw, c.label, c.summary, c.content_md, c.ref_type, c.ref_id));
    if (!list.length) { box.innerHTML = '<div class="empty">NO CLASSIFIED ENTRY</div>'; return; }
    box.innerHTML = list.map((c) => `
      <div class="list-row">
        <div class="main">
          <div class="title">${SiteCore.escapeHtml(c.label || '受限档案')}
            <span class="badge badge-gold">LV.${SiteCore.escapeHtml(c.level)}</span>
            <span class="badge">${SiteCore.escapeHtml(c.ref_type)} #${SiteCore.escapeHtml(c.ref_id)}</span>
          </div>
          <div class="sub">${SiteCore.escapeHtml(c.summary || '')} · ${SiteCore.formatDate(c.updated_at)}</div>
          <div class="excerpt">${SiteCore.escapeHtml((c.content_md || '').slice(0, 120))}</div>
        </div>
        <div class="ops">
          <button class="btn btn-sm" data-edit-cls="${c.id}" type="button">编辑</button>
          <button class="btn btn-sm btn-danger" data-del-cls="${c.id}" type="button">删除</button>
        </div>
      </div>`).join('');

    $$('[data-edit-cls]', box).forEach((b) => b.addEventListener('click', () => openClsEditor(Number(b.dataset.editCls))));
    $$('[data-del-cls]', box).forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.delCls);
      if (!await confirmDelete('受限档案 #' + id)) return;
      const res = await cloud.database.from('classified_entries').delete().eq('id', id).select();
      if (res.error) { SiteCore.toast('删除失败'); return; }
      SiteCore.toast('已删除');
      loadClassified();
    }));
  }

  function renderRefOptions() {
    const type = $('#clsRefType') ? $('#clsRefType').value : 'exhibit';
    const sel = $('#clsRefId');
    if (sel) {
      const options = type === 'exhibit'
        ? exhibits.map((e) => `<option value="${e.id}">${SiteCore.escapeHtml(e.code)} · ${SiteCore.escapeHtml(e.name)}</option>`)
        : docs.map((d) => `<option value="${d.id}">#${d.id} · ${SiteCore.escapeHtml(d.title)}</option>`);
      sel.innerHTML = options.join('') || '<option value="">（无可关联条目）</option>';
    }
    const docSel = $('#docExhibit');
    if (docSel) {
      const current = docSel.value;
      docSel.innerHTML = '<option value="">未关联</option>' + exhibits.map((e) => `<option value="${SiteCore.escapeHtml(e.code)}">${SiteCore.escapeHtml(e.code)}</option>`).join('');
      docSel.value = current;
    }
  }

  function openClsEditor(id) {
    edit.cls = id ? classified.find((x) => x.id === id) : null;
    const c = edit.cls;
    $('#clsEditorTitle').textContent = c ? `编辑受限档案 #${c.id}` : '新建受限档案';
    if (c) $('#clsRefType').value = c.ref_type;
    renderRefOptions();
    if (c) $('#clsRefId').value = String(c.ref_id);
    $('#clsLevel').value = c ? c.level : 3;
    $('#clsLabel').value = c ? (c.label || '') : '';
    $('#clsSummary').value = c ? (c.summary || '') : '';
    $('#clsContent').value = c ? (c.content_md || '') : '';
    $('#clsEditor').style.display = '';
    bindPreview('#clsContent', '#clsPreview');
    $('#clsImages').value = '';
    renderShotGrid($('#clsShotGrid'), c ? shotsFor('classified', c.id) : [], true, '#clsContent');
    clearDirty('#clsDirty');
    $('#clsShotHint').textContent = c
      ? '支持多选，上传后自动归档至云端存储'
      : '新建档案请先保存，保存后即可上传配图';
    $('#clsEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveCls() {
    const btn = $('#clsSave');
    btn.disabled = true;
    try {
      const payload = {
        ref_type: $('#clsRefType').value,
        ref_id: Number($('#clsRefId').value),
        level: Number($('#clsLevel').value || 3),
        label: $('#clsLabel').value.trim() || '受限档案',
        summary: $('#clsSummary').value.trim(),
        content_md: $('#clsContent').value,
        updated_at: new Date().toISOString(),
      };
      if (!payload.ref_id) { SiteCore.toast('请选择关联条目'); return; }
      const wasEdit = !!edit.cls;
      let res;
      if (edit.cls) {
        res = await cloud.database.from('classified_entries').update(payload).eq('id', edit.cls.id).select();
      } else {
        res = await cloud.database.from('classified_entries').insert({ ...payload, owner_id: uid }).select();
      }
      if (res.error) throw new Error(res.error.message);
      if (!Array.isArray(res.data) || !res.data.length) throw new Error('写入未生效，请确认管理员权限');
      SiteCore.toast('已保存');
      await loadClassified();
      await loadRefImages();
      if (!wasEdit && res.data[0]) openClsEditor(res.data[0].id);
      else { $('#clsEditor').style.display = 'none'; edit.cls = null; }
      clearDirty('#clsDirty');
    } catch (e) {
      SiteCore.toast('保存失败：' + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- 权限密钥 ---------- */
  async function loadKeys() {
    try {
      const rows = await rpcAll('admin_list_clearance_codes');
      lastKeyCount = rows.length;
      updateCounts();
      const table = $('#keyTable');
      if (!rows.length) { table.innerHTML = '<tr><td class="empty">NO KEY</td></tr>'; return; }
      table.innerHTML = `<tr><th>密钥</th><th>等级</th><th>标签</th><th>备注</th><th>使用次数</th><th>最近使用</th><th></th></tr>` +
        rows.map((k) => `<tr>
          <td>${SiteCore.escapeHtml(k.code)}</td>
          <td>LV.${SiteCore.escapeHtml(k.level)}</td>
          <td>${SiteCore.escapeHtml(k.label || '')}</td>
          <td>${SiteCore.escapeHtml(k.note || '')}</td>
          <td>${SiteCore.escapeHtml(k.used_count)}</td>
          <td>${SiteCore.formatDate(k.last_used_at)}</td>
          <td><button class="btn btn-sm btn-danger" data-del-key="${SiteCore.escapeHtml(k.code)}" type="button">删除</button></td>
        </tr>`).join('');
      $$('[data-del-key]', table).forEach((b) => b.addEventListener('click', async () => {
        if (!await confirmDelete(b.dataset.delKey)) return;
        const res = await rpcOne('admin_delete_clearance_code', { p_code: b.dataset.delKey });
        SiteCore.toast(res && res.ok === false ? (res.message || '删除失败') : '已删除');
        loadKeys();
      }));
    } catch (e) {
      SiteCore.toast('密钥加载失败：' + (e.message || e));
    }
  }

  async function saveKey() {
    const btn = $('#keySave');
    btn.disabled = true;
    try {
      const res = await rpcOne('admin_upsert_clearance_code', {
        p_code: $('#keyCode').value.trim(),
        p_level: Number($('#keyLevel').value || 3),
        p_label: $('#keyLabel').value.trim() || `${$('#keyLevel').value} 级权限`,
        p_note: $('#keyNote').value.trim(),
      });
      if (!res || res.ok === false) { SiteCore.toast((res && res.message) || '保存失败'); return; }
      $('#keyCode').value = ''; $('#keyLabel').value = ''; $('#keyNote').value = '';
      SiteCore.toast('密钥已保存');
      loadKeys();
    } catch (e) {
      SiteCore.toast('保存失败：' + (e.message || e));
    } finally { btn.disabled = false; }
  }

  async function createAdminCode() {
    const btn = $('#adminCodeSave');
    btn.disabled = true;
    try {
      const res = await rpcOne('admin_create_admin_code', { p_code: $('#adminCode').value.trim(), p_note: '由管理员生成' });
      if (!res || res.ok === false) { SiteCore.toast((res && res.message) || '生成失败'); return; }
      $('#adminCode').value = '';
      SiteCore.toast('邀请密钥已生成');
    } catch (e) {
      SiteCore.toast('生成失败：' + (e.message || e));
    } finally { btn.disabled = false; }
  }

  /* ---------- 访问日志 ---------- */
  async function loadLog() {
    try {
      logRows = await rpcAll('admin_list_access_log', { p_limit: 100 });
      renderLog();
      renderHomeLog();
    } catch (e) {
      SiteCore.toast('日志加载失败：' + (e.message || e));
    }
  }

  function renderLog() {
    const table = $('#logTable');
    if (!table) return;
    const kw = keyword('#logSearch');
    const rows = logRows.filter((l) => hit(kw, l.uid, l.code_label, l.note, l.ref_type, l.ref_id));
    if (!rows.length) { table.innerHTML = '<tr><td class="empty">NO LOG</td></tr>'; return; }
    table.innerHTML = `<tr><th>时间</th><th>UID</th><th>对象</th><th>密钥</th><th>结果</th><th>备注</th></tr>` +
      rows.map((l) => `<tr>
          <td>${SiteCore.formatDate(l.created_at)}</td>
          <td>${SiteCore.escapeHtml(String(l.uid || '匿名').slice(0, 10))}</td>
          <td>${SiteCore.escapeHtml(l.ref_type)} #${SiteCore.escapeHtml(l.ref_id)}</td>
          <td>${SiteCore.escapeHtml(l.code_label || '')}</td>
          <td>${l.granted ? '<span class="badge badge-ok">GRANTED</span>' : '<span class="badge badge-alert">DENIED</span>'}</td>
          <td>${SiteCore.escapeHtml(l.note || '')}</td>
        </tr>`).join('');
  }

  /* 总览面板的最近访问 */
  function renderHomeLog() {
    const table = $('#homeLogTable');
    if (!table) return;
    const rows = logRows.slice(0, 8);
    if (!rows.length) { table.innerHTML = '<tr><td class="empty">NO LOG</td></tr>'; return; }
    table.innerHTML = `<tr><th>时间</th><th>对象</th><th>密钥</th><th>结果</th></tr>` +
      rows.map((l) => `<tr>
        <td>${SiteCore.formatDate(l.created_at)}</td>
        <td>${SiteCore.escapeHtml(l.ref_type || '')}</td>
        <td>${SiteCore.escapeHtml(l.code_label || '')}</td>
        <td>${l.granted ? '<span class="badge badge-ok">GRANTED</span>' : '<span class="badge badge-alert">DENIED</span>'}</td>
      </tr>`).join('');
  }

  /* ---------- 页面内容 ---------- */
  async function loadPage(key) {
    try {
      const page = await SiteCore.fetchPage(key);
      $('#pageTitle').value = page ? page.title : '';
      $('#pageSub').value = page && page.subtitle ? page.subtitle : '';
      $('#pageContent').value = page ? (page.content_md || '') : '';
      $('#pagePreview').innerHTML = SiteCore.renderMarkdown(page ? page.content_md || '' : '');
    } catch (e) {
      SiteCore.toast('页面加载失败');
    }
  }

  async function savePage() {
    const btn = $('#pageSave');
    btn.disabled = true;
    try {
      const payload = {
        page_key: $('#pagePick').value,
        title: $('#pageTitle').value.trim(),
        subtitle: $('#pageSub').value.trim(),
        content_md: $('#pageContent').value,
        updated_at: new Date().toISOString(),
      };
      if (!payload.title) { SiteCore.toast('标题必填'); return; }
      const res = await cloud.database.from('site_pages').upsert(payload).select();
      if (res.error) throw new Error(res.error.message);
      if (!Array.isArray(res.data) || !res.data.length) throw new Error('写入未生效，请确认管理员权限');
      SiteCore.toast('页面已保存');
      clearDirty('#pageDirty');
    } catch (e) {
      SiteCore.toast('保存失败：' + (e.message || e));
    } finally { btn.disabled = false; }
  }

  /* ---------- 人员 ---------- */
  async function loadKeepers() {
    const { data, error } = await cloud.database
      .from('staff').select('*').order('sort_order', { ascending: true });
    if (error) { SiteCore.toast('人员加载失败'); return; }
    keepers = data || [];
    renderKeepers();
    updateCounts();
  }

  function renderKeepers() {
    const box = $('#stList');
    const kw = keyword('#stSearch');
    const list = keepers.filter((p) => hit(kw, p.name, p.floor, p.title, p.department, p.contact));
    if (!list.length) { box.innerHTML = '<div class="empty">NO RECORD</div>'; return; }
    box.innerHTML = list.map((p) => `
      <div class="list-row">
        <div class="main">
          <div class="title">${SiteCore.escapeHtml(p.name)} <span class="badge badge-gold">${SiteCore.escapeHtml(p.floor || '—')}</span></div>
          <div class="sub">${SiteCore.escapeHtml(p.title || '')} · ${SiteCore.escapeHtml(p.department || '')} · ${SiteCore.escapeHtml(p.contact || '')}</div>
        </div>
        <div class="ops">
          <button class="btn btn-sm" data-edit-st="${p.id}" type="button">编辑</button>
          <button class="btn btn-sm btn-danger" data-del-st="${p.id}" type="button">删除</button>
        </div>
      </div>`).join('');
    $$('[data-edit-st]', box).forEach((b) => b.addEventListener('click', () => openStaffEditor(Number(b.dataset.editSt))));
    $$('[data-del-st]', box).forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.delSt);
      const p = keepers.find((x) => x.id === id);
      if (!await confirmDelete(p ? p.name : id)) return;
      const res = await cloud.database.from('staff').delete().eq('id', id).select();
      if (res.error) { SiteCore.toast('删除失败'); return; }
      SiteCore.toast('已删除');
      loadKeepers();
    }));
  }

  function openStaffEditor(id) {
    edit.staff = id ? keepers.find((x) => x.id === id) : null;
    const p = edit.staff;
    $('#stEditorTitle').textContent = p ? `编辑人员 · ${p.name}` : '新建人员';
    $('#stName').value = p ? p.name : '';
    $('#stFloor').value = p ? (p.floor || '') : '';
    $('#stTitle').value = p ? (p.title || '楼层管理员') : '楼层管理员';
    $('#stDept').value = p ? (p.department || '') : '';
    $('#stContact').value = p ? (p.contact || '') : '';
    $('#stSort').value = p ? p.sort_order : 100;
    $('#stBio').value = p ? (p.bio_md || '') : '';
    $('#stEditor').style.display = '';
    bindPreview('#stBio', '#stPreview');
    clearDirty('#stDirty');
    $('#stEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveStaff() {
    const btn = $('#stSave');
    btn.disabled = true;
    try {
      const payload = {
        name: $('#stName').value.trim(),
        floor: $('#stFloor').value.trim() || '—',
        title: $('#stTitle').value.trim() || '楼层管理员',
        department: $('#stDept').value.trim(),
        contact: $('#stContact').value.trim(),
        bio_md: $('#stBio').value,
        sort_order: Number($('#stSort').value || 100),
        updated_at: new Date().toISOString(),
      };
      if (!payload.name) { SiteCore.toast('姓名必填'); return; }
      let res;
      if (edit.staff) {
        res = await cloud.database.from('staff').update(payload).eq('id', edit.staff.id).select();
      } else {
        res = await cloud.database.from('staff').insert(payload).select();
      }
      if (res.error) throw new Error(res.error.message);
      if (!Array.isArray(res.data) || !res.data.length) throw new Error('写入未生效，请确认管理员权限');
      SiteCore.toast('已保存');
      $('#stEditor').style.display = 'none';
      edit.staff = null;
      clearDirty('#stDirty');
      await loadKeepers();
    } catch (e) {
      SiteCore.toast('保存失败：' + (e.message || e));
    } finally { btn.disabled = false; }
  }

  /* ---------- 人事秘档 ---------- */
  async function loadDossiers() {
    const { data, error } = await cloud.database
      .from('staff_dossiers').select('*').order('sort_order', { ascending: true });
    if (error) { SiteCore.toast('秘档加载失败'); return; }
    dossiers = data || [];
    renderDossiers();
    renderDossierStaffOptions();
    updateCounts();
  }

  function renderDossierStaffOptions() {
    const sel = $('#dsStaff');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = keepers.map((p) => `<option value="${p.id}">${SiteCore.escapeHtml(p.name)} · ${SiteCore.escapeHtml(p.floor || '')}</option>`).join('')
      || '<option value="">（请先创建人员）</option>';
    if (cur) sel.value = cur;
  }

  function renderDossiers() {
    const box = $('#dsList');
    if (!box) return;
    const kw = keyword('#dsSearch');
    const list = dossiers.filter((d) => {
      const p = keepers.find((x) => x.id === d.staff_id);
      return hit(kw, p && p.name, d.code_name, d.identity, d.education);
    });
    if (!dossiers.length) { box.innerHTML = '<div class="empty">NO DOSSIER</div>'; return; }
    if (!list.length) { box.innerHTML = '<div class="empty">无匹配结果</div>'; return; }
    box.innerHTML = list.map((d) => {
      const p = keepers.find((x) => x.id === d.staff_id);
      return `
      <div class="list-row">
        ${d.avatar_url ? `<img class="ds-thumb" src="${SiteCore.escapeHtml(d.avatar_url)}" alt="" loading="lazy" />` : `<span class="ds-thumb" style="display:grid;place-items:center;color:var(--gold-dim);font-size:15px">${SiteCore.escapeHtml((p ? p.name : '—').slice(0, 1))}</span>`}
        <div class="main">
          <div class="title">${SiteCore.escapeHtml(p ? p.name : `未知人员 #${d.staff_id}`)} <span class="badge badge-gold">${SiteCore.escapeHtml(d.code_name || 'NO-CODE')}</span>${d.avatar_url ? `<span class="badge">证件照 LV.${SiteCore.escapeHtml(d.avatar_level)}</span>` : '<span class="badge badge-alert">无证件照</span>'}</div>
          <div class="sub">身份 LV.${SiteCore.escapeHtml(d.identity_level)} · 学历 LV.${SiteCore.escapeHtml(d.education_level)} · 状况 LV.${SiteCore.escapeHtml(d.condition_level)} · 秘闻 LV.${SiteCore.escapeHtml(d.secret_level)}</div>
          <div class="excerpt">${SiteCore.escapeHtml(d.identity || '（未填写身份）')}</div>
        </div>
        <div class="ops">
          <button class="btn btn-sm" data-edit-ds="${d.id}" type="button">编辑</button>
          <button class="btn btn-sm btn-danger" data-del-ds="${d.id}" type="button">删除</button>
        </div>
      </div>`;
    }).join('');
    $$('[data-edit-ds]', box).forEach((b) => b.addEventListener('click', () => openDossierEditor(Number(b.dataset.editDs))));
    $$('[data-del-ds]', box).forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.delDs);
      if (!await confirmDelete('该人事秘档')) return;
      const res = await cloud.database.from('staff_dossiers').delete().eq('id', id).select();
      if (res.error) { SiteCore.toast('删除失败'); return; }
      SiteCore.toast('已删除');
      loadDossiers();
    }));
  }

  function openDossierEditor(id) {
    edit.dossier = id ? dossiers.find((x) => x.id === id) : null;
    const d = edit.dossier;
    renderDossierStaffOptions();
    $('#dsEditorTitle').textContent = d ? `编辑人事秘档 · ${(keepers.find((p) => p.id === d.staff_id) || {}).name || d.staff_id}` : '新建人事秘档';
    $('#dsStaff').value = d && d.staff_id ? String(d.staff_id) : (keepers[0] ? String(keepers[0].id) : '');
    $('#dsCodeName').value = d ? (d.code_name || '') : '';
    $('#dsIdentity').value = d ? (d.identity || '') : '';
    $('#dsIdentityLevel').value = d ? d.identity_level : 2;
    $('#dsEducation').value = d ? (d.education || '') : '';
    $('#dsEducationLevel').value = d ? d.education_level : 2;
    $('#dsCondition').value = d ? (d.condition_note || '') : '';
    $('#dsConditionLevel').value = d ? d.condition_level : 3;
    $('#dsSecret').value = d ? (d.secret_md || '') : '';
    $('#dsSecretLevel').value = d ? d.secret_level : 4;
    $('#dsAvatarLevel').value = d ? (d.avatar_level || 2) : 2;
    $('#dsAvatarFile').value = '';
    $('#dsEditor').style.display = '';
    bindPreview('#dsSecret', '#dsPreview');
    renderAvatarPreview(d);
    clearDirty('#dsDirty');
    $('#dsEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveDossier() {
    const btn = $('#dsSave');
    btn.disabled = true;
    try {
      const payload = {
        staff_id: Number($('#dsStaff').value) || null,
        code_name: $('#dsCodeName').value.trim(),
        identity: $('#dsIdentity').value.trim(),
        identity_level: Number($('#dsIdentityLevel').value || 2),
        education: $('#dsEducation').value.trim(),
        education_level: Number($('#dsEducationLevel').value || 2),
        condition_note: $('#dsCondition').value.trim(),
        condition_level: Number($('#dsConditionLevel').value || 3),
        secret_md: $('#dsSecret').value,
        secret_level: Number($('#dsSecretLevel').value || 4),
        avatar_level: Number($('#dsAvatarLevel').value || 2),
        updated_at: new Date().toISOString(),
      };
      if (!payload.staff_id) { SiteCore.toast('请选择关联人员'); return; }
      const wasEdit = !!edit.dossier;
      let res;
      if (edit.dossier) {
        res = await cloud.database.from('staff_dossiers').update(payload).eq('id', edit.dossier.id).select();
      } else {
        res = await cloud.database.from('staff_dossiers').insert({ ...payload, owner_id: uid, sort_order: 100 }).select();
      }
      if (res.error) throw new Error(res.error.message);
      if (!Array.isArray(res.data) || !res.data.length) throw new Error('写入未生效，请确认管理员权限');
      SiteCore.toast('已保存');
      await loadDossiers();
      /* 新建的秘档保持编辑器打开，便于立即上传证件照 */
      if (wasEdit) {
        $('#dsEditor').style.display = 'none';
        edit.dossier = null;
      } else if (res.data[0]) {
        openDossierEditor(res.data[0].id);
      }
      clearDirty('#dsDirty');
    } catch (e) {
      SiteCore.toast('保存失败：' + (e.message || e));
    } finally { btn.disabled = false; }
  }

  /* ---------- 启动 ---------- */
  async function boot() {
    const ok = await guard();
    if (!ok) return;
    initTabs();

    $('#exNew').addEventListener('click', () => openExhibitEditor(null));
    $('#exSave').addEventListener('click', saveExhibit);
    $('#exCancel').addEventListener('click', () => { $('#exEditor').style.display = 'none'; edit.exhibit = null; clearDirty('#exDirty'); });
    bindSearch('#exSearch', renderExhibits);
    $('#exImage').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      $('#exThumb').src = await fileToDataUrl(f);
      $('#exImageHint').textContent = `待上传：${f.name}（${SiteCore.formatBytes(f.size)}）`;
      if (!edit.exhibit) markDirty('#exDirty');
    });

    $('#docNew').addEventListener('click', () => openDocEditor(null));
    $('#docSave').addEventListener('click', saveDoc);
    $('#docCancel').addEventListener('click', () => { $('#docEditor').style.display = 'none'; edit.doc = null; clearDirty('#docDirty'); });
    bindSearch('#docSearch', renderDocs);
    $('#docImages').addEventListener('change', (e) => handleShotFiles('document', edit.doc && edit.doc.id, e.target));

    $('#clsNew').addEventListener('click', () => { renderRefOptions(); openClsEditor(null); });
    $('#clsSave').addEventListener('click', saveCls);
    $('#clsCancel').addEventListener('click', () => { $('#clsEditor').style.display = 'none'; edit.cls = null; clearDirty('#clsDirty'); });
    bindSearch('#clsSearch', renderClassified);
    $('#clsRefType').addEventListener('change', renderRefOptions);
    $('#clsImages').addEventListener('change', (e) => handleShotFiles('classified', edit.cls && edit.cls.id, e.target));

    $('#keySave').addEventListener('click', saveKey);
    $('#adminCodeSave').addEventListener('click', createAdminCode);
    $('#logRefresh').addEventListener('click', loadLog);
    bindSearch('#logSearch', renderLog);

    $('#pagePick').addEventListener('change', () => { loadPage($('#pagePick').value); clearDirty('#pageDirty'); });
    $('#pageContent').addEventListener('input', () => {
      $('#pagePreview').innerHTML = SiteCore.renderMarkdown($('#pageContent').value);
    });
    $('#pageTitle').addEventListener('input', () => markDirty('#pageDirty'));
    $('#pageSub').addEventListener('input', () => markDirty('#pageDirty'));
    $('#pageSave').addEventListener('click', savePage);

    $('#stNew').addEventListener('click', () => openStaffEditor(null));
    $('#stSave').addEventListener('click', saveStaff);
    $('#stCancel').addEventListener('click', () => { $('#stEditor').style.display = 'none'; edit.staff = null; clearDirty('#stDirty'); });
    bindSearch('#stSearch', renderKeepers);

    $('#dsNew').addEventListener('click', () => openDossierEditor(null));
    $('#dsSave').addEventListener('click', saveDossier);
    $('#dsCancel').addEventListener('click', () => { $('#dsEditor').style.display = 'none'; edit.dossier = null; clearDirty('#dsDirty'); });
    bindSearch('#dsSearch', renderDossiers);
    $('#dsAvatarPick').addEventListener('click', () => $('#dsAvatarFile').click());
    $('#dsAvatarFile').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) await uploadDossierAvatar(f);
    });
    $('#dsAvatarClear').addEventListener('click', clearDossierAvatar);

    /* 通用增强：Markdown 工具栏 / 拖拽上传 / 保存快捷键 / 未保存提示 */
    initMdTools();
    initDropzones();
    initShortcuts();
    Object.keys(editorRegistry).forEach((k) => watchDirty(editorRegistry[k].box, editorRegistry[k].dirty));
    watchDirty('#pageEditor', '#pageDirty');

    await loadRefImages();
    await loadExhibits();
    await loadDocs();
    await loadClassified();
    await loadKeepers();
    await loadDossiers();
    await loadPage('museum');
    await loadKeys();
    await loadLog();

    /* 恢复上次所在的面板 */
    let savedPane = 'paneHome';
    try { savedPane = localStorage.getItem(PANE_STORE) || 'paneHome'; } catch (e) { /* noop */ }
    if (!$(`#${savedPane}`)) savedPane = 'paneHome';
    setPane(savedPane, true);
  }

  boot();
})();
