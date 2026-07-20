/* =====================================================================
 * ai-algorithm.js — AI 算法模块页（Task 19）
 * 7 类定制化识别算法展示 · 详情弹窗 · 技术方案总览
 * ===================================================================== */

/* =====================================================================
 * 模块级状态
 * ===================================================================== */
let styleEl = null;
let modalEl = null;

/* =====================================================================
 * 算法数据（7 类）
 * ===================================================================== */
const ALGORITHMS = [
  {
    key: 'crack',
    name: '裂缝识别',
    emoji: '🏚️',
    accuracy: 96.5,
    desc: '基于深度学习的大坝、溢洪道混凝土裂缝自动检测，支持亚像素级裂缝宽度测量与长度统计。',
    detail: '采用 U-Net + ResNet50 骨干网络，结合空洞空间金字塔池化（ASPP）模块，实现对细小裂缝的高精度分割。模型在 12,000 张标注图像上训练，支持 0.1mm 级裂缝宽度估算。',
    tech: 'U-Net · ResNet50 · ASPP · 亚像素回归',
    scenario: '大坝主体、溢洪道侧墙、输水涵管',
    reportLink: '#'
  },
  {
    key: 'floating',
    name: '漂浮物检测',
    emoji: '🌊',
    accuracy: 94.2,
    desc: '针对库区水面漂浮物（垃圾、水草、油污）进行实时检测与分类，支持面积估算与漂移趋势分析。',
    detail: '使用 YOLOv8 目标检测框架，结合水面背景抑制模块，有效降低倒影与波纹干扰。可对漂浮物进行 5 类细分：塑料、木材、水草、油污、其他。',
    tech: 'YOLOv8 · 背景抑制 · 多尺度特征融合',
    scenario: '库区水面、取水口、溢洪道前池',
    reportLink: '#'
  },
  {
    key: 'seepage',
    name: '渗漏识别',
    emoji: '💧',
    accuracy: 94.5,
    desc: '通过红外热成像与可见光融合，识别坝体、坝肩及输水系统的渗漏点，定位精度达米级。',
    detail: '双光融合网络（Thermal + RGB），利用温度异常梯度定位潜在渗漏区域。结合湿度传感器数据交叉验证，显著降低误报率。',
    tech: '双光融合 · 温度梯度分析 · 交叉验证',
    scenario: '大坝坝体、坝肩绕渗、输水隧洞',
    reportLink: '#'
  },
  {
    key: 'slope',
    name: '边坡滑塌检测',
    emoji: '⛰️',
    accuracy: 92.5,
    desc: '监测库区周边边坡位移与滑塌风险，通过时序影像对比识别土体异常变动与裂缝发育。',
    detail: '基于 Siamese 网络的时序变化检测，对比多期航拍影像，自动标记位移区域。结合 DSM 高程数据计算土方量变化，辅助滑坡预警。',
    tech: 'Siamese 网络 · 时序对比 · DSM 差分',
    scenario: '库区边坡、进场道路、弃渣场',
    reportLink: '#'
  },
  {
    key: 'illegal',
    name: '违章复垦监测',
    emoji: '🚜',
    accuracy: 92.3,
    desc: '识别库区管理范围内违规开垦、违法建设等人类活动，支持历史影像回溯与变化预警。',
    detail: '变化检测 + 语义分割双分支架构，自动比对月度/季度影像，识别新增耕地、建筑、堆场。支持地物面积自动量算与坐标标定。',
    tech: 'Change Detection · DeepLabV3+ · 时序分析',
    scenario: '库区淹没区、管理范围线、保护范围',
    reportLink: '#'
  },
  {
    key: 'building',
    name: '建筑物漏损检测',
    emoji: '🏢',
    accuracy: 92.5,
    desc: '针对管理房、泵站、启闭机房等建筑物的屋顶渗漏、墙体开裂、门窗破损进行自动巡检。',
    detail: '近距离航拍 + 变焦特写，利用细粒度分类网络识别渗漏痕迹与结构损伤。支持按照《水工建筑物检查规程》自动生成缺陷清单与维修建议。',
    tech: 'EfficientNet · 细粒度分类 · 缺陷清单生成',
    scenario: '管理房、泵站、启闭机房、闸室',
    reportLink: '#'
  },
  {
    key: 'intrusion',
    name: '人员入侵检测',
    emoji: '🚶',
    accuracy: 97.1,
    desc: '实时检测未授权人员进入库区核心区域、大坝禁区等敏感地带，支持夜间红外模式下工作。',
    detail: 'YOLOv8-Pose 人体关键点检测，结合电子围栏坐标进行空间判界。支持跌倒、聚集等异常行为识别，夜间红外模式准确率保持 95% 以上。',
    tech: 'YOLOv8-Pose · 空间判界 · 行为识别',
    scenario: '大坝核心区、溢洪道、发电厂房',
    reportLink: '#'
  }
];

const AVG_ACCURACY = (ALGORITHMS.reduce((s, a) => s + a.accuracy, 0) / ALGORITHMS.length).toFixed(1);

/* =====================================================================
 * 工具函数
 * ===================================================================== */
function cleanup() {
  if (styleEl) { styleEl.remove(); styleEl = null; }
  if (modalEl) { modalEl.remove(); modalEl = null; }
}

function animateCount(el, target, opts = {}) {
  if (!el) return;
  const { duration = 1200, decimals = 0, suffix = '' } = opts;
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const v = target * ease(t);
    el.textContent = (decimals ? v.toFixed(decimals) : Math.round(v).toString()) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* =====================================================================
 * 样式注入
 * ===================================================================== */
function injectStyles() {
  if (styleEl) styleEl.remove();
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-scope', 'ai-algorithm');
  styleEl.textContent = `
/* ---------- 页面骨架 ---------- */
.ai-page { display: flex; flex-direction: column; gap: 1.5rem; padding-bottom: 24px; }

/* ---------- KPI ---------- */
.ai-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}
.ai-kpi-row .kpi-card {
  opacity: 0;
  animation: kpiFadeIn 0.6s var(--ease-out) forwards;
}
.ai-kpi-row .kpi-card:nth-child(1) { animation-delay: 0.05s; }
.ai-kpi-row .kpi-card:nth-child(2) { animation-delay: 0.15s; }
.ai-kpi-row .kpi-card:nth-child(3) { animation-delay: 0.25s; }
.ai-kpi-row .kpi-card:nth-child(4) { animation-delay: 0.35s; }
@keyframes kpiFadeIn { to { opacity: 1; } }

/* ---------- 算法卡片网格 ---------- */
.ai-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.25rem;
}
@media (max-width: 1280px) {
  .ai-grid { grid-template-columns: repeat(3, 1fr); }
  .ai-kpi-row { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 900px) {
  .ai-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .ai-grid { grid-template-columns: 1fr; }
  .ai-kpi-row { grid-template-columns: 1fr; }
}

/* ---------- 算法卡片 ---------- */
.algo-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-base);
  border-top: 2px solid var(--algo-accent, var(--accent-cyan));
  border-radius: var(--radius-lg);
  padding: 20px;
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  opacity: 0;
  animation: slideInUp 0.6s var(--ease-out) forwards;
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out);
}
.algo-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--algo-accent, var(--accent-cyan)), transparent);
  box-shadow: 0 0 12px var(--algo-accent, var(--accent-cyan));
  opacity: 0.8;
}
.algo-card::after {
  content: '';
  position: absolute;
  top: -40%;
  right: -20%;
  width: 180px;
  height: 180px;
  background: radial-gradient(circle, color-mix(in srgb, var(--algo-accent, var(--accent-cyan)) 15%, transparent) 0%, transparent 70%);
  pointer-events: none;
}
.algo-card:hover {
  transform: translateY(-6px);
  border-color: color-mix(in srgb, var(--algo-accent, var(--accent-cyan)) 50%, transparent);
  box-shadow: var(--shadow-card), 0 0 32px color-mix(in srgb, var(--algo-accent, var(--accent-cyan)) 20%, transparent);
}

/* 算法 accent 映射（7 类不同颜色，均来自 CSS 变量） */
.algo-card[data-algo="crack"]     { --algo-accent: var(--danger); }
.algo-card[data-algo="floating"]  { --algo-accent: var(--accent-cyan); }
.algo-card[data-algo="seepage"]   { --algo-accent: var(--accent-electric); }
.algo-card[data-algo="slope"]     { --algo-accent: var(--warn); }
.algo-card[data-algo="illegal"]   { --algo-accent: var(--success); }
.algo-card[data-algo="building"]  { --algo-accent: var(--accent-blue); }
.algo-card[data-algo="intrusion"] { --algo-accent: color-mix(in srgb, var(--danger) 80%, var(--accent-cyan)); }

.algo-card__head { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
.algo-card__icon {
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px;
  background: color-mix(in srgb, var(--algo-accent, var(--accent-cyan)) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--algo-accent, var(--accent-cyan)) 30%, transparent);
  border-radius: var(--radius-md);
  filter: drop-shadow(0 0 6px var(--algo-accent, var(--accent-cyan)));
  flex-shrink: 0;
}
.algo-card__title { font-family: var(--font-display); font-size: var(--fs-lg); font-weight: 600; color: var(--fg-primary); letter-spacing: 0.5px; }
.algo-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 1;
}
.algo-card__accuracy {
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--algo-accent, var(--accent-cyan));
  text-shadow: 0 0 12px color-mix(in srgb, var(--algo-accent, var(--accent-cyan)) 40%, transparent);
}
.algo-card__accuracy-label {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
  letter-spacing: 0.5px;
}
.algo-card__desc {
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
  line-height: 1.6;
  flex: 1;
  position: relative;
  z-index: 1;
}
.algo-card__foot {
  display: flex;
  justify-content: flex-end;
  position: relative;
  z-index: 1;
}

/* ---------- 技术方案总览 ---------- */
.ai-tech {
  background: var(--bg-card);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-lg);
  padding: 24px;
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-card);
  position: relative;
  overflow: hidden;
  opacity: 0;
  animation: slideInUp 0.7s var(--ease-out) 0.6s forwards;
}
.ai-tech::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--accent-cyan), var(--accent-electric));
  box-shadow: 0 0 10px var(--accent-cyan);
}
.ai-tech__title {
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--fg-primary);
  letter-spacing: 1px;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.ai-tech__title::before {
  content: '▸';
  color: var(--accent-cyan);
  text-shadow: 0 0 8px var(--accent-cyan);
}
.ai-tech__body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
@media (max-width: 900px) {
  .ai-tech__body { grid-template-columns: 1fr; }
}
.ai-tech__block {
  background: rgba(10, 18, 36, 0.5);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  padding: 16px;
}
.ai-tech__block h4 {
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  color: var(--accent-cyan);
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ai-tech__block p,
.ai-tech__block ul {
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
  line-height: 1.7;
}
.ai-tech__block ul { padding-left: 16px; list-style: disc; }
.ai-tech__block li { margin: 4px 0; }

/* ---------- Modal ---------- */
.ai-modal {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ai-modal[hidden] { display: none; }
.ai-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(5, 9, 19, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: fadeIn 0.3s var(--ease-out);
}
.ai-modal__content {
  position: relative;
  width: min(720px, 92vw);
  max-height: 88vh;
  overflow-y: auto;
  background: linear-gradient(180deg, rgba(17, 28, 54, 0.98) 0%, rgba(5, 9, 19, 0.98) 100%);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-glow), 0 16px 64px rgba(0,0,0,0.6);
  animation: modalIn 0.4s var(--ease-out);
  display: flex;
  flex-direction: column;
}
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.92) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.ai-modal__close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(5,9,19,0.7);
  color: var(--fg-primary);
  font-size: 20px;
  border: 1px solid var(--border-base);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
}
.ai-modal__close:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
  transform: rotate(90deg);
}
.ai-modal__header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-base);
  display: flex;
  align-items: center;
  gap: 14px;
  position: relative;
  overflow: hidden;
}
.ai-modal__header::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--algo-accent, var(--accent-cyan)), transparent);
  box-shadow: 0 0 12px var(--algo-accent, var(--accent-cyan));
}
.ai-modal__icon {
  width: 52px; height: 52px;
  display: flex; align-items: center; justify-content: center;
  font-size: 28px;
  background: color-mix(in srgb, var(--algo-accent, var(--accent-cyan)) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--algo-accent, var(--accent-cyan)) 30%, transparent);
  border-radius: var(--radius-md);
  filter: drop-shadow(0 0 6px var(--algo-accent, var(--accent-cyan)));
  flex-shrink: 0;
}
.ai-modal__title { font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 600; color: var(--fg-primary); letter-spacing: 0.5px; }
.ai-modal__subtitle { font-size: var(--fs-sm); color: var(--fg-secondary); margin-top: 2px; }

.ai-modal__body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.ai-modal__section {}
.ai-modal__section-title {
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  color: var(--accent-cyan);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 229, 255, 0.15);
  display: flex;
  align-items: center;
  gap: 6px;
}
.ai-modal__section-title::before { content: '▸'; color: var(--accent-cyan); }
.ai-modal__text {
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
  line-height: 1.7;
}
.ai-modal__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ai-modal__tag {
  padding: 4px 10px;
  font-size: var(--fs-xs);
  color: var(--algo-accent, var(--accent-cyan));
  background: color-mix(in srgb, var(--algo-accent, var(--accent-cyan)) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--algo-accent, var(--accent-cyan)) 30%, transparent);
  border-radius: 999px;
  letter-spacing: 0.5px;
}
.ai-modal__report {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: var(--fs-sm);
  color: var(--bg-deep);
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
  border-radius: var(--radius-md);
  font-weight: 600;
  transition: all var(--duration-fast) var(--ease-out);
  align-self: flex-start;
}
.ai-modal__report:hover {
  box-shadow: 0 0 20px rgba(0, 229, 255, 0.4);
  transform: translateY(-1px);
}

@media (prefers-reduced-motion: reduce) {
  .algo-card, .ai-tech, .ai-kpi-row .kpi-card { animation: none !important; opacity: 1; }
}
  `;
  document.head.appendChild(styleEl);
}

/* =====================================================================
 * KPI 渲染
 * ===================================================================== */
function renderKPI() {
  return `
    <div class="ai-kpi-row">
      <div class="kpi-card">
        <div class="kpi-card__label">算法总数</div>
        <div class="kpi-card__value"><span id="ai-kpi-count">--</span><span class="kpi-card__unit">类</span></div>
        <div class="kpi-card__delta">定制化识别算法</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">平均识别准确率</div>
        <div class="kpi-card__value"><span id="ai-kpi-accuracy">--</span><span class="kpi-card__unit">%</span></div>
        <div class="kpi-card__delta up">综合精度</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">已训练模型数</div>
        <div class="kpi-card__value"><span id="ai-kpi-models">--</span><span class="kpi-card__unit">个</span></div>
        <div class="kpi-card__delta up">持续迭代中</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">测试数据集规模</div>
        <div class="kpi-card__value"><span id="ai-kpi-dataset">--</span><span class="kpi-card__unit">+</span></div>
        <div class="kpi-card__delta">标注样本量</div>
      </div>
    </div>
  `;
}

/* =====================================================================
 * 算法卡片渲染
 * ===================================================================== */
function renderCards() {
  return `
    <div class="ai-grid">
      ${ALGORITHMS.map((a, i) => `
        <div class="algo-card" data-algo="${a.key}" style="animation-delay: ${i * 80}ms" tabindex="0" role="button" aria-label="查看 ${a.name} 详情">
          <div class="algo-card__head">
            <div class="algo-card__icon">${a.emoji}</div>
            <div class="algo-card__title">${a.name}</div>
          </div>
          <div class="algo-card__meta">
            <span class="algo-card__accuracy">${a.accuracy}%</span>
            <span class="algo-card__accuracy-label">识别精度</span>
          </div>
          <div class="algo-card__desc">${a.desc}</div>
          <div class="algo-card__foot">
            <button class="btn btn-primary" type="button" data-algo-btn="${a.key}">查看详情</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/* =====================================================================
 * 技术方案总览
 * ===================================================================== */
function renderTechOverview() {
  return `
    <div class="ai-tech">
      <div class="ai-tech__title">技术方案总览 · 如何确保识别准确率 ≥ 90%</div>
      <div class="ai-tech__body">
        <div class="ai-tech__block">
          <h4>🎯 数据层面</h4>
          <ul>
            <li><strong>多源数据融合：</strong>可见光 + 红外 + 高光谱多波段联合标注，增强模型泛化能力。</li>
            <li><strong>数据增强策略：</strong>随机旋转、光照变化、雨雪雾模拟、对抗样本训练，提升极端天气鲁棒性。</li>
            <li><strong>难例挖掘：</strong>基于不确定性采样的主动学习机制，持续补充模糊、小目标、遮挡等难例样本。</li>
          </ul>
        </div>
        <div class="ai-tech__block">
          <h4>🔧 模型与工程层面</h4>
          <ul>
            <li><strong>多尺度训练：</strong>采用 FPN / PANet 结构，兼顾大场景与小目标检测需求。</li>
            <li><strong>模型集成：</strong>多模型投票与级联筛选，降低单一模型误检率。</li>
            <li><strong>边缘优化：</strong>TensorRT / ONNX 量化加速，确保端侧推理延迟 ≤ 80ms，避免因掉帧导致漏检。</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

/* =====================================================================
 * Modal
 * ===================================================================== */
function openModal(algoKey) {
  const algo = ALGORITHMS.find((a) => a.key === algoKey);
  if (!algo) return;

  if (modalEl) modalEl.remove();

  modalEl = document.createElement('div');
  modalEl.className = 'ai-modal';
  modalEl.setAttribute('data-algo', algo.key);
  modalEl.innerHTML = `
    <div class="ai-modal__backdrop"></div>
    <div class="ai-modal__content">
      <button class="ai-modal__close" aria-label="关闭">×</button>
      <div class="ai-modal__header">
        <div class="ai-modal__icon">${algo.emoji}</div>
        <div>
          <div class="ai-modal__title">${algo.name}</div>
          <div class="ai-modal__subtitle">识别精度 ${algo.accuracy}% · ${algo.tech}</div>
        </div>
      </div>
      <div class="ai-modal__body">
        <div class="ai-modal__section">
          <div class="ai-modal__section-title">算法详细说明</div>
          <div class="ai-modal__text">${algo.detail}</div>
        </div>
        <div class="ai-modal__section">
          <div class="ai-modal__section-title">技术方案</div>
          <div class="ai-modal__tags">
            ${algo.tech.split('·').map((t) => `<span class="ai-modal__tag">${t.trim()}</span>`).join('')}
          </div>
        </div>
        <div class="ai-modal__section">
          <div class="ai-modal__section-title">应用场景</div>
          <div class="ai-modal__text">${algo.scenario}</div>
        </div>
        <div class="ai-modal__section">
          <div class="ai-modal__section-title">测试报告</div>
          <a class="ai-modal__report" href="${algo.reportLink}" target="_blank" rel="noopener">📄 查看测试报告</a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  const close = () => {
    if (modalEl) { modalEl.remove(); modalEl = null; }
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  modalEl.querySelector('.ai-modal__close').addEventListener('click', close);
  modalEl.querySelector('.ai-modal__backdrop').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
}

/* =====================================================================
 * 主渲染
 * ===================================================================== */
export function render(container) {
  cleanup();
  injectStyles();

  container.innerHTML = `
    <section class="page ai-page">
      <header>
        <h1 class="page-title">AI 识别算法库</h1>
        <p class="page-subtitle">7 类定制化识别算法 · 深度学习 · 边缘部署</p>
      </header>

      ${renderKPI()}
      ${renderCards()}
      ${renderTechOverview()}
    </section>
  `;

  // KPI 计数动画
  animateCount(document.getElementById('ai-kpi-count'), ALGORITHMS.length, { duration: 1000 });
  animateCount(document.getElementById('ai-kpi-accuracy'), parseFloat(AVG_ACCURACY), { duration: 1200, decimals: 1 });
  animateCount(document.getElementById('ai-kpi-models'), 12, { duration: 1100 });
  animateCount(document.getElementById('ai-kpi-dataset'), 58000, { duration: 1400 });

  // 绑定卡片点击（按钮 + 卡片整体）
  container.querySelectorAll('.algo-card').forEach((card) => {
    const key = card.dataset.algo;
    const open = () => openModal(key);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    // 阻止按钮点击事件冒泡导致两次触发
    const btn = card.querySelector('[data-algo-btn]');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        open();
      });
    }
  });
}

export default { render };
