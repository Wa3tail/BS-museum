/* 身份认证页：密码登录 / 邮箱验证码 / 注册 / 找回密码 / 管理员授权 */

(function () {
  if (!window.cloud) { SiteCore.showOffline('云服务未加载，无法完成认证。'); return; }

  const $ = SiteCore.$;
  const params = new URLSearchParams(location.search);
  const nextUrl = params.get('next') || '';

  /* 待校验的邮箱验证码挑战（与发送动作分离保存） */
  let pendingEmailOtp = null;
  let resetFlow = null;

  function showTab(name) {
    SiteCore.$$('.tabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === name));
    const map = { password: 'panePassword', otp: 'paneOtp', signup: 'paneSignup', reset: 'paneReset' };
    Object.keys(map).forEach((k) => {
      const pane = $('#' + map[k]);
      if (pane) pane.classList.toggle('is-on', k === name);
    });
    if (name === 'reset') {
      SiteCore.$$('.tabs button').forEach((b) => b.classList.remove('is-on'));
    }
  }

  SiteCore.$$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#forgotBtn').addEventListener('click', () => showTab('reset'));
  $('#backLoginBtn').addEventListener('click', () => showTab('password'));

  /* ---------- 发送验证码 ---------- */
  async function sendCode(emailInput, statusBox, btn) {
    const email = (emailInput.value || '').trim();
    if (!email) { statusBox.innerHTML = '<div class="notice notice-warn">请先填写邮箱。</div>'; return; }
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '发送中…';
    try {
      const sent = await cloud.auth.sendOtp({ email });
      if (sent.error) {
        statusBox.innerHTML = `<div class="notice notice-err">${SiteCore.escapeHtml(sent.error.message || '验证码发送失败')}</div>`;
        return;
      }
      pendingEmailOtp = {
        email,
        verificationId: sent.data.verificationId,
        isExistingUser: sent.data.isExistingUser,
      };
      statusBox.innerHTML = '<div class="notice">验证码已发送，请查收邮件后输入。</div>';
    } catch (e) {
      statusBox.innerHTML = `<div class="notice notice-err">服务不可用：${SiteCore.escapeHtml(e.message || e)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  $('#sendOtpBtn').addEventListener('click', () => sendCode($('#otpEmail'), $('#otpMsg'), $('#sendOtpBtn')));
  $('#sendSuBtn').addEventListener('click', () => sendCode($('#suEmail'), $('#suMsg'), $('#sendSuBtn')));

  /* ---------- 密码登录 ---------- */
  $('#panePassword').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#pwEmail').value.trim();
    const password = $('#pwPass').value;
    const box = $('#pwMsg');
    box.innerHTML = '';
    const { error } = await cloud.auth.signInWithPassword({ email, password });
    if (error) {
      box.innerHTML = '<div class="notice notice-err">账号或密码不正确。</div>';
      return;
    }
    await afterLogin();
  });

  /* ---------- 邮箱验证码登录 ---------- */
  $('#paneOtp').addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = $('#otpMsg');
    box.innerHTML = '';
    const email = $('#otpEmail').value.trim();
    const token = $('#otpCode').value.trim();
    if (!pendingEmailOtp || pendingEmailOtp.email !== email) {
      box.innerHTML = '<div class="notice notice-warn">请先为当前邮箱获取验证码。</div>';
      return;
    }
    const completed = await cloud.auth.verifyOtp({
      email: pendingEmailOtp.email,
      verificationId: pendingEmailOtp.verificationId,
      isExistingUser: pendingEmailOtp.isExistingUser,
      token,
    });
    if (completed.error) {
      box.innerHTML = `<div class="notice notice-err">${SiteCore.escapeHtml(completed.error.message || '验证失败')}</div>`;
      return;
    }
    pendingEmailOtp = null;
    await afterLogin();
  });

  /* ---------- 注册 ---------- */
  $('#paneSignup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = $('#suMsg');
    box.innerHTML = '';
    const email = $('#suEmail').value.trim();
    const token = $('#suCode').value.trim();
    const password = $('#suPass').value;
    if (password.length < 8) { box.innerHTML = '<div class="notice notice-warn">密码至少 8 位。</div>'; return; }
    if (!pendingEmailOtp || pendingEmailOtp.email !== email) {
      box.innerHTML = '<div class="notice notice-warn">请先为当前邮箱获取验证码。</div>';
      return;
    }
    if (pendingEmailOtp.isExistingUser) {
      box.innerHTML = '<div class="notice notice-warn">该邮箱已注册，请改用登录。</div>';
      return;
    }
    const completed = await cloud.auth.verifyOtp({
      email,
      verificationId: pendingEmailOtp.verificationId,
      isExistingUser: false,
      token,
      password,
    });
    if (completed.error) {
      box.innerHTML = `<div class="notice notice-err">${SiteCore.escapeHtml(completed.error.message || '注册失败')}</div>`;
      return;
    }
    pendingEmailOtp = null;
    await afterLogin();
  });

  /* ---------- 找回密码 ---------- */
  $('#sendRsBtn').addEventListener('click', async () => {
    const email = $('#rsEmail').value.trim();
    const btn = $('#sendRsBtn');
    if (!email) { $('#rsMsg').innerHTML = '<div class="notice notice-warn">请先填写邮箱。</div>'; return; }
    btn.disabled = true;
    try {
      const started = await cloud.auth.resetPasswordForEmail(email);
      if (started.error) {
        $('#rsMsg').innerHTML = `<div class="notice notice-err">${SiteCore.escapeHtml(started.error.message || '发送失败')}</div>`;
        return;
      }
      resetFlow = started.data;
      $('#rsMsg').innerHTML = '<div class="notice">验证邮件已发送，请输入邮件中的验证码与新密码。</div>';
    } finally { btn.disabled = false; }
  });

  $('#paneReset').addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = $('#rsMsg');
    if (!resetFlow) { box.innerHTML = '<div class="notice notice-warn">请先发送验证码。</div>'; return; }
    const completed = await resetFlow.updateUser({
      nonce: $('#rsCode').value.trim(),
      password: $('#rsPass').value,
    });
    if (completed.error) {
      box.innerHTML = `<div class="notice notice-err">${SiteCore.escapeHtml(completed.error.message || '重置失败')}</div>`;
      return;
    }
    box.innerHTML = '<div class="notice">密码已重置并登录。</div>';
    await afterLogin();
  });

  /* ---------- 管理员授权 ---------- */
  $('#claimBtn').addEventListener('click', async () => {
    const box = $('#statusMsg');
    const code = $('#claimCode').value.trim();
    if (!code) { box.innerHTML = '<div class="notice notice-warn">请输入授权密钥。</div>'; return; }
    const btn = $('#claimBtn');
    btn.disabled = true;
    try {
      const email = await SiteCore.getUserEmail();
      const { data, error } = await cloud.database.rpc('claim_admin', {
        p_code: code, p_display_name: null, p_email: email || null,
      });
      const res = Array.isArray(data) ? data[0] : data;
      if (error) throw error;
      if (!res || res.ok === false) {
        box.innerHTML = `<div class="notice notice-err">${SiteCore.escapeHtml((res && res.message) || '授权失败')}</div>`;
        return;
      }
      SiteCore.toast('已获得管理员权限');
      await afterLogin();
    } catch (e) {
      box.innerHTML = `<div class="notice notice-err">授权失败：${SiteCore.escapeHtml(e.message || e)}</div>`;
    } finally { btn.disabled = false; }
  });

  $('#signOutBtn').addEventListener('click', async () => {
    await cloud.auth.signOut();
    location.reload();
  });

  /* ---------- 登录后的状态渲染 ---------- */
  async function afterLogin() {
    const role = await SiteCore.currentRole();
    if (role === 'admin' && nextUrl) { location.href = nextUrl; return; }
    await renderStatus();
  }

  async function renderStatus() {
    const session = await SiteCore.getSession();
    if (!session) {
      $('#authForms').style.display = '';
      $('#authStatus').style.display = 'none';
      return;
    }
    const role = await SiteCore.currentRole();
    const email = (session.user && session.user.email) || '已登录用户';
    $('#authForms').style.display = 'none';
    $('#authStatus').style.display = '';
    $('#whoLine').textContent = `UID ${String(session.user.id).slice(0, 10)}… · ${email}`;
    if (role === 'admin') {
      $('#roleLine').innerHTML = '当前身份：<b style="color:var(--gold-deep)">管理员</b> · 可访问内部管理终端与全部档案。';
      $('#adminActions').style.display = '';
      $('#guestActions').style.display = 'none';
      $('#authTitle').textContent = '认证通过';
      if (nextUrl) location.href = nextUrl;
    } else {
      $('#roleLine').innerHTML = '当前身份：<b>访客</b> · 可浏览公开展廊，无法进入内部终端。';
      $('#adminActions').style.display = 'none';
      $('#guestActions').style.display = '';
      $('#authTitle').textContent = '访客身份';
      if (nextUrl && /(^|\/)inner\.html$/.test(nextUrl)) location.href = nextUrl;
    }
  }

  renderStatus();
})();
