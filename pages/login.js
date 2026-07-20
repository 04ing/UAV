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
        
        <form id="login-form" class="login-card__form">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" id="username" class="form-input" placeholder="请输入用户名" required />
          </div>
          
          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" id="password" class="form-input" placeholder="请输入密码" required />
          </div>
          
          <div class="form-group">
            <button type="submit" class="btn btn-primary btn-block" id="btn-submit">
              <span>登 录</span>
            </button>
          </div>
          
          <div id="login-error" class="form-error" style="display:none;"></div>
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

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('btn-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    
    if (!username || !password) {
      showError('请输入用户名和密码');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>登录中...</span>';
    errorEl.style.display = 'none';

    try {
      const result = await auth.login(username, password);
      const token = localStorage.getItem('drone_token');
      if (token) {
        window.location.hash = '#/dashboard';
        window.location.reload();
      } else {
        showError(result && result.msg || '登录失败');
      }
    } catch (err) {
      showError(err.message || '登录失败，请检查网络连接');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>登 录</span>';
    }
  });

  function showError(message) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}