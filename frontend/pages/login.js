import { auth } from '../js/api.js';

export async function render(container) {
  container.innerHTML = `
    <section class="page page--login">
      <div class="login-card">
        <div class="login-card__header">
          <div class="login-card__logo">🛩️</div>
          <h1 class="login-card__title">无人机智能巡检系统</h1>
          <p class="login-card__subtitle">端边云协同 · 智能巡检平台</p>
        </div>

        <!-- 登录表单 -->
        <form id="login-form" class="login-card__form">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" id="login-username" class="form-input" placeholder="请输入用户名" autocomplete="username" required />
          </div>

          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" id="login-password" class="form-input" placeholder="请输入密码" autocomplete="current-password" required />
          </div>

          <div class="form-group">
            <button type="submit" class="btn btn-primary btn-block" id="btn-login">
              <span>登 录</span>
            </button>
          </div>

          <div id="login-error" class="form-error" style="display:none;"></div>

          <p class="login-card__switch">
            还没有账号？<a href="javascript:void(0)" id="link-to-register">立即注册</a>
          </p>
        </form>

        <!-- 注册表单 -->
        <form id="register-form" class="login-card__form" style="display:none;">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" id="reg-username" class="form-input" placeholder="至少 3 个字符" autocomplete="username" required />
          </div>

          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" id="reg-password" class="form-input" placeholder="至少 6 个字符" autocomplete="new-password" required />
          </div>

          <div class="form-group">
            <label class="form-label">确认密码</label>
            <input type="password" id="reg-password2" class="form-input" placeholder="再次输入密码" autocomplete="new-password" required />
          </div>

          <div class="form-group">
            <label class="form-label">姓名（可选）</label>
            <input type="text" id="reg-name" class="form-input" placeholder="用于显示名" />
          </div>

          <div class="form-group">
            <button type="submit" class="btn btn-primary btn-block" id="btn-register">
              <span>注 册</span>
            </button>
          </div>

          <div id="register-error" class="form-error" style="display:none;"></div>

          <p class="login-card__switch">
            已有账号？<a href="javascript:void(0)" id="link-to-login">返回登录</a>
          </p>
        </form>

        <div class="login-card__footer">
          <div class="login-card__demo-info">
            <span class="text-muted">演示账号：</span>
            <span>admin / admin123</span>
          </div>
        </div>
      </div>
    </section>
  `;

  // ---------- 元素引用 ----------
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const linkToRegister = document.getElementById('link-to-register');
  const linkToLogin = document.getElementById('link-to-login');

  // ---------- 切换登录/注册 ----------
  linkToRegister.addEventListener('click', () => {
    loginForm.style.display = 'none';
    registerForm.style.display = 'flex';
    hideError('login-error');
  });

  linkToLogin.addEventListener('click', () => {
    registerForm.style.display = 'none';
    loginForm.style.display = 'flex';
    hideError('register-error');
  });

  // ---------- 登录提交 ----------
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!username || !password) {
      showError('login-error', '请输入用户名和密码');
      return;
    }

    await submitAuth('btn-login', 'login-error', '登录中...', async () => {
      const result = await auth.login(username, password);
      const token = localStorage.getItem('drone_token');
      if (!token) {
        throw new Error(result && result.msg || '登录失败');
      }
    });
  });

  // ---------- 注册提交 ----------
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const password2 = document.getElementById('reg-password2').value.trim();
    const name = document.getElementById('reg-name').value.trim();

    if (!username || !password) {
      showError('register-error', '请输入用户名和密码');
      return;
    }
    if (username.length < 3) {
      showError('register-error', '用户名至少 3 个字符');
      return;
    }
    if (password.length < 6) {
      showError('register-error', '密码至少 6 个字符');
      return;
    }
    if (password !== password2) {
      showError('register-error', '两次输入的密码不一致');
      return;
    }

    await submitAuth('btn-register', 'register-error', '注册中...', async () => {
      const result = await auth.register(username, password, name || undefined);
      const token = localStorage.getItem('drone_token');
      if (!token) {
        throw new Error(result && result.msg || '注册失败');
      }
    });
  });

  // ---------- 辅助函数 ----------
  async function submitAuth(btnId, errorId, loadingText, fn) {
    const btn = document.getElementById(btnId);
    btn.disabled = true;
    btn.innerHTML = `<span>${loadingText}</span>`;
    hideError(errorId);

    try {
      await fn();
      window.location.hash = '#/dashboard';
    } catch (err) {
      // 提取后端错误消息
      let msg = err.message || '操作失败';
      if (err.status && err.status !== 401) {
        // request() 已解析的 detail 放在 err.message
      }
      showError(errorId, msg);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span>${btnId === 'btn-login' ? '登 录' : '注 册'}</span>`;
    }
  }

  function showError(id, message) {
    const el = document.getElementById(id);
    el.textContent = message;
    el.style.display = 'block';
  }

  function hideError(id) {
    const el = document.getElementById(id);
    el.textContent = '';
    el.style.display = 'none';
  }
}
