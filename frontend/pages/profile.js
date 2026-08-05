/* =====================================================================
 * profile.js — 用户中心 · 个人信息 & 修改密码
 * ===================================================================== */

import { auth } from '/js/api.js';

let userCache = null;

const ROLE_LABEL = {
  admin: '管理员',
  operator: '操作员',
  viewer: '查看者'
};

export async function render(container) {
  container.innerHTML = `
    <section class="page page--profile">
      <div class="profile-header">
        <div class="profile-avatar" id="profile-avatar">U</div>
        <div class="profile-header__info">
          <h1 class="profile-name" id="profile-name">加载中...</h1>
          <div class="profile-meta" id="profile-meta"></div>
        </div>
      </div>

      <div class="profile-tabs">
        <button class="profile-tab active" data-tab="info">个人信息</button>
        <button class="profile-tab" data-tab="password">修改密码</button>
      </div>

      <!-- 个人信息表单 -->
      <div class="profile-panel" id="panel-info">
        <form id="profile-form" class="profile-form">
          <div class="form-group">
            <label class="form-label">用户 ID</label>
            <input type="text" id="profile-id" class="form-input" disabled />
          </div>
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" id="profile-username" class="form-input" disabled />
          </div>
          <div class="form-group">
            <label class="form-label">姓名</label>
            <input type="text" id="profile-name-input" class="form-input" placeholder="请输入姓名" />
          </div>
          <div class="form-group">
            <label class="form-label">角色</label>
            <input type="text" id="profile-role" class="form-input" disabled />
          </div>
          <div class="form-group">
            <label class="form-label">注册时间</label>
            <input type="text" id="profile-created" class="form-input" disabled />
          </div>
          <div class="form-group">
            <button type="submit" class="btn btn-primary" id="btn-save-profile">保存修改</button>
          </div>
          <div id="profile-msg" class="form-error" style="display:none;"></div>
        </form>
      </div>

      <!-- 修改密码表单 -->
      <div class="profile-panel" id="panel-password" style="display:none;">
        <form id="password-form" class="profile-form">
          <div class="form-group">
            <label class="form-label">当前密码</label>
            <input type="password" id="pwd-old" class="form-input" placeholder="请输入当前密码" required />
          </div>
          <div class="form-group">
            <label class="form-label">新密码</label>
            <input type="password" id="pwd-new" class="form-input" placeholder="至少 6 个字符" required minlength="6" />
          </div>
          <div class="form-group">
            <label class="form-label">确认新密码</label>
            <input type="password" id="pwd-confirm" class="form-input" placeholder="再次输入新密码" required minlength="6" />
          </div>
          <div class="form-group">
            <button type="submit" class="btn btn-primary" id="btn-save-pwd">修改密码</button>
          </div>
          <div id="pwd-msg" class="form-error" style="display:none;"></div>
        </form>
      </div>
    </section>
  `;

  // ---------- Tab 切换 ----------
  const tabs = container.querySelectorAll('.profile-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.getElementById('panel-info').style.display = target === 'info' ? 'block' : 'none';
      document.getElementById('panel-password').style.display = target === 'password' ? 'block' : 'none';
      hideMsg('profile-msg');
      hideMsg('pwd-msg');
    });
  });

  // ---------- 加载用户信息 ----------
  try {
    const res = await auth.me();
    userCache = res.data || res;
    fillForm(userCache);
  } catch (err) {
    showMsg('profile-msg', err.message || '加载失败');
  }

  // ---------- 保存个人信息 ----------
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('profile-name-input').value.trim();
    if (!name) {
      showMsg('profile-msg', '姓名不能为空');
      return;
    }
    const btn = document.getElementById('btn-save-profile');
    btn.disabled = true;
    btn.textContent = '保存中...';
    hideMsg('profile-msg');
    try {
      const res = await auth.updateMe({ name });
      const data = res.data || res;
      // 更新本地缓存和显示
      if (data && data.token) {
        localStorage.setItem('drone_token', data.token);
      }
      if (data && data.name) {
        localStorage.setItem('drone_user_name', data.name);
      }
      userCache = { ...userCache, ...data };
      fillForm(userCache);
      showMsg('profile-msg', '修改成功！', 'success');
    } catch (err) {
      showMsg('profile-msg', err.message || '保存失败');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存修改';
    }
  });

  // ---------- 修改密码 ----------
  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPwd = document.getElementById('pwd-old').value;
    const newPwd = document.getElementById('pwd-new').value;
    const confirmPwd = document.getElementById('pwd-confirm').value;

    if (!oldPwd || !newPwd || !confirmPwd) {
      showMsg('pwd-msg', '请完整填写所有密码字段');
      return;
    }
    if (newPwd.length < 6) {
      showMsg('pwd-msg', '新密码至少 6 个字符');
      return;
    }
    if (newPwd !== confirmPwd) {
      showMsg('pwd-msg', '两次输入的新密码不一致');
      return;
    }
    if (oldPwd === newPwd) {
      showMsg('pwd-msg', '新密码不能与当前密码相同');
      return;
    }

    const btn = document.getElementById('btn-save-pwd');
    btn.disabled = true;
    btn.textContent = '提交中...';
    hideMsg('pwd-msg');
    try {
      await auth.changePassword(oldPwd, newPwd);
      showMsg('pwd-msg', '密码修改成功！', 'success');
      document.getElementById('password-form').reset();
    } catch (err) {
      showMsg('pwd-msg', err.message || '修改失败');
    } finally {
      btn.disabled = false;
      btn.textContent = '修改密码';
    }
  });
}

/* ---------- 填充表单 ---------- */
function fillForm(user) {
  if (!user) return;
  document.getElementById('profile-avatar').textContent = (user.name || user.username || 'U')[0].toUpperCase();
  document.getElementById('profile-name').textContent = user.name || user.username || '用户';
  document.getElementById('profile-meta').textContent = `${ROLE_LABEL[user.role] || user.role} · ${user.id}`;

  document.getElementById('profile-id').value = user.id || '';
  document.getElementById('profile-username').value = user.username || '';
  document.getElementById('profile-name-input').value = user.name || '';
  document.getElementById('profile-role').value = ROLE_LABEL[user.role] || user.role || '';
  document.getElementById('profile-created').value = user.createdAt ? fmtDate(user.createdAt) : '--';
}

function fmtDate(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.style.display = 'block';
  el.style.color = type === 'success' ? 'var(--accent-cyan)' : '';
}

function hideMsg(id) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.style.display = 'none';
}
