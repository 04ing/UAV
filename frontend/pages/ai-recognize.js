/* =====================================================================
 * ai-recognize.js — AI 智能识别页（Task 12）
 * 云端模型下发 · 边缘侧推理 · 7 类缺陷识别
 * ===================================================================== */

import { ai } from '/js/api.js';

/* ====================================================================
 * 常量与配置
 * ==================================================================== */

const CATEGORIES = [
  { key: 'crack',    name: '裂缝',       cls: 'crack',    colorVar: '--ar-crack' },
  { key: 'floating', name: '漂浮物',     cls: 'float',    colorVar: '--ar-float' },
  { key: 'leakage',  name: '渗漏',       cls: 'leak',     colorVar: '--ar-leak' },
  { key: 'slope',    name: '边坡滑塌',   cls: 'slope',    colorVar: '--ar-slope' },
  { key: 'reclaim',  name: '违章复垦',   cls: 'reclaim',  colorVar: '--ar-reclaim' },
  { key: 'building', name: '建筑物漏损', cls: 'building', colorVar: '--ar-building' },
  { key: 'intruder', name: '人员入侵',   cls: 'intruder', colorVar: '--ar-intruder' },
];

const DEMO_IMAGE_LABELS = ['裂缝', '漂浮物', '渗漏', '边坡滑塌', '违章复垦', '建筑物漏损'];

const MOCK_MODELS = [
  { id: 'mdl-yolo-dam-001', name: 'YOLOv8-大坝缺陷检测', version: 'v2.3.1', type: '目标检测', accuracy: 94.5, deployed: true },
  { id: 'mdl-resnet-leak-002', name: 'ResNet-渗漏识别', version: 'v1.1.0', type: '图像分类', accuracy: 91.2, deployed: false },
  { id: 'mdl-seg-slope-003', name: 'SegFormer-边坡分割', version: 'v3.0.2', type: '语义分割', accuracy: 89.7, deployed: true },
  { id: 'mdl-yolo-intr-004', name: 'YOLOv8-人员入侵', version: 'v1.5.0', type: '目标检测', accuracy: 96.3, deployed: true },
  { id: 'mdl-cls-reclaim-005', name: 'MobileNet-违章复垦', version: 'v2.0.0', type: '图像分类', accuracy: 88.4, deployed: false },
];

/* ====================================================================
 * 模块状态与定时器管理
 * ==================================================================== */

let _timers = [];
let _currentFile = null;
let _currentImageBase64 = null;
let _models = [];

function _clearTimers() {
  _timers.forEach((t) => clearInterval(t));
  _timers = [];
}

function _addTimer(id) {
  _timers.push(id);
}

/* ====================================================================
 * 样式（命名空间 .ar- 防止污染）
 * ==================================================================== */

const STYLES = `
/* 类别颜色变量（基于 tokens.css 扩展） */
.ar-page {
  --ar-crack: var(--danger);
  --ar-float: var(--warn);
  --ar-leak: var(--accent-blue);
  --ar-slope: #f0e130;
  --ar-reclaim: #a855f7;
  --ar-building: var(--accent-cyan);
  --ar-intruder: #ff70a6;
}

/* 页面骨架 */
.ar-page { display: flex; flex-direction: column; gap: 18px; padding-bottom: 24px; }
.ar-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }

/* KPI */
.ar-kpi { animation: arFadeIn var(--duration-base) var(--ease-out) both; }
.ar-kpi .kpi-card:nth-child(1) { animation-delay: 0ms; }
.ar-kpi .kpi-card:nth-child(2) { animation-delay: 80ms; }
.ar-kpi .kpi-card:nth-child(3) { animation-delay: 160ms; }
.ar-kpi .kpi-card:nth-child(4) { animation-delay: 240ms; }

/* 主内容区 60/40 分栏 */
.ar-main { display: flex; gap: 16px; flex-wrap: nowrap; }
.ar-left  { flex: 0 0 60%; display: flex; flex-direction: column; gap: 16px; animation: arFadeIn var(--duration-base) var(--ease-out) both; animation-delay: 100ms; }
.ar-right { flex: 0 0 40%; display: flex; flex-direction: column; gap: 16px; animation: arSlideInRight var(--duration-base) var(--ease-out) both; animation-delay: 200ms; }

@media (max-width: 1280px) {
  .ar-main { flex-direction: column; }
  .ar-left, .ar-right { flex: 1 1 auto; }
}

/* 上传区 */
.ar-upload {
  position: relative;
  border: 2px dashed var(--border-base);
  border-radius: var(--radius-lg);
  padding: 28px;
  text-align: center;
  background: var(--bg-card);
  transition: border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
  cursor: pointer;
}
.ar-upload:hover, .ar-upload.is-dragover {
  border-color: var(--border-glow);
  background: rgba(0, 229, 255, 0.04);
}
.ar-upload__icon { font-size: 32px; margin-bottom: 8px; filter: drop-shadow(0 0 8px var(--accent-cyan)); }
.ar-upload__text { font-size: var(--fs-sm); color: var(--fg-secondary); }
.ar-upload__hint { font-size: var(--fs-xs); color: var(--fg-muted); margin-top: 4px; }

/* 示例缩略图 */
.ar-thumbs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.ar-thumb {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-md);
  border: 2px solid var(--border-base);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  background: var(--bg-elev);
}
.ar-thumb:hover { border-color: var(--border-glow); transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.35); }
.ar-thumb.is-active { border-color: var(--accent-cyan); box-shadow: 0 0 0 1px var(--accent-cyan), 0 0 16px rgba(0,229,255,0.35); }
.ar-thumb img, .ar-thumb svg { width: 100%; height: 100%; object-fit: cover; display: block; }
.ar-thumb__label {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding: 4px 6px; font-size: 11px; color: var(--fg-primary);
  background: linear-gradient(transparent, rgba(5,9,19,0.85));
  text-align: center; letter-spacing: 0.5px;
}

/* 画布容器 */
.ar-canvas-wrap {
  position: relative;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-base);
  overflow: hidden;
  background: var(--bg-deep);
  min-height: 280px;
  display: flex; align-items: center; justify-content: center;
}
.ar-canvas-wrap img {
  display: block; max-width: 100%; max-height: 520px; object-fit: contain;
}

/* 扫描线动画 */
.ar-scanline {
  position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 5;
}
.ar-scanline::after {
  content: ''; position: absolute; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, transparent, var(--accent-cyan), transparent);
  box-shadow: 0 0 12px var(--accent-cyan), 0 0 4px var(--accent-cyan);
  animation: arScanMove 1.6s linear infinite;
  opacity: 0.9;
}
@keyframes arScanMove {
  0%   { top: 0; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

/* 边界框 */
.ar-box {
  position: absolute;
  border: 2px solid var(--accent-cyan);
  border-radius: var(--radius-sm);
  pointer-events: none;
  box-shadow: 0 0 8px rgba(0,229,255,0.35), inset 0 0 8px rgba(0,229,255,0.1);
  z-index: 2;
}
.ar-box__label {
  position: absolute; top: -22px; left: -2px;
  padding: 2px 8px; font-size: 11px; font-weight: 600;
  background: var(--accent-cyan); color: var(--bg-deep);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  white-space: nowrap;
  letter-spacing: 0.3px;
  box-shadow: 0 -2px 8px rgba(0,229,255,0.3);
}
.ar-box.crack    { border-color: var(--ar-crack);    box-shadow: 0 0 8px rgba(255,59,107,0.35), inset 0 0 8px rgba(255,59,107,0.1); }
.ar-box.crack .ar-box__label    { background: var(--ar-crack);    color: #fff; box-shadow: 0 -2px 8px rgba(255,59,107,0.3); }
.ar-box.float    { border-color: var(--ar-float);    box-shadow: 0 0 8px rgba(255,149,0,0.35), inset 0 0 8px rgba(255,149,0,0.1); }
.ar-box.float .ar-box__label    { background: var(--ar-float);    color: var(--bg-deep); box-shadow: 0 -2px 8px rgba(255,149,0,0.3); }
.ar-box.leak     { border-color: var(--ar-leak);     box-shadow: 0 0 8px rgba(0,102,255,0.35), inset 0 0 8px rgba(0,102,255,0.1); }
.ar-box.leak .ar-box__label     { background: var(--ar-leak);     color: #fff; box-shadow: 0 -2px 8px rgba(0,102,255,0.3); }
.ar-box.slope    { border-color: var(--ar-slope);    box-shadow: 0 0 8px rgba(240,225,48,0.35), inset 0 0 8px rgba(240,225,48,0.1); }
.ar-box.slope .ar-box__label    { background: var(--ar-slope);    color: var(--bg-deep); box-shadow: 0 -2px 8px rgba(240,225,48,0.3); }
.ar-box.reclaim  { border-color: var(--ar-reclaim);  box-shadow: 0 0 8px rgba(168,85,247,0.35), inset 0 0 8px rgba(168,85,247,0.1); }
.ar-box.reclaim .ar-box__label  { background: var(--ar-reclaim);  color: #fff; box-shadow: 0 -2px 8px rgba(168,85,247,0.3); }
.ar-box.building { border-color: var(--ar-building); box-shadow: 0 0 8px rgba(0,229,255,0.35), inset 0 0 8px rgba(0,229,255,0.1); }
.ar-box.building .ar-box__label { background: var(--ar-building); color: var(--bg-deep); box-shadow: 0 -2px 8px rgba(0,229,255,0.3); }
.ar-box.intruder { border-color: var(--ar-intruder); box-shadow: 0 0 8px rgba(255,112,166,0.35), inset 0 0 8px rgba(255,112,166,0.1); }
.ar-box.intruder .ar-box__label { background: var(--ar-intruder); color: var(--bg-deep); box-shadow: 0 -2px 8px rgba(255,112,166,0.3); }

/* 识别结果列表 */
.ar-results { max-height: 220px; overflow-y: auto; }
.ar-result-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 12px; border-radius: var(--radius-md);
  background: rgba(10,18,36,0.5); border: 1px solid var(--border-base);
  font-size: var(--fs-sm);
  transition: background var(--duration-fast) var(--ease-out);
}
.ar-result-item + .ar-result-item { margin-top: 8px; }
.ar-result-item:hover { background: rgba(0,229,255,0.04); }
.ar-result__meta { display: flex; align-items: center; gap: 10px; }
.ar-result__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.ar-result__dot.crack    { background: var(--ar-crack);    box-shadow: 0 0 6px var(--ar-crack); }
.ar-result__dot.float    { background: var(--ar-float);    box-shadow: 0 0 6px var(--ar-float); }
.ar-result__dot.leak     { background: var(--ar-leak);     box-shadow: 0 0 6px var(--ar-leak); }
.ar-result__dot.slope    { background: var(--ar-slope);    box-shadow: 0 0 6px var(--ar-slope); }
.ar-result__dot.reclaim  { background: var(--ar-reclaim);  box-shadow: 0 0 6px var(--ar-reclaim); }
.ar-result__dot.building { background: var(--ar-building); box-shadow: 0 0 6px var(--ar-building); }
.ar-result__dot.intruder { background: var(--ar-intruder); box-shadow: 0 0 6px var(--ar-intruder); }
.ar-result__name { color: var(--fg-primary); font-weight: 500; }
.ar-result__coords { font-size: var(--fs-xs); color: var(--fg-muted); font-family: var(--font-display); }
.ar-result__conf { font-family: var(--font-display); font-size: var(--fs-sm); font-weight: 600; }

/* 模型卡片 */
.ar-model-list { display: flex; flex-direction: column; gap: 12px; }
.ar-model {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-lg);
  padding: 16px;
  backdrop-filter: blur(12px);
  transition: all var(--duration-fast) var(--ease-out);
}
.ar-model:hover { border-color: var(--border-glow); transform: translateY(-2px); box-shadow: var(--shadow-card), 0 0 24px rgba(0,229,255,0.08); }
.ar-model__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.ar-model__name { font-family: var(--font-display); font-size: var(--fs-base); font-weight: 600; color: var(--fg-primary); letter-spacing: 0.3px; }
.ar-model__meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ar-model__acc { font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 700; color: var(--accent-cyan); text-shadow: 0 0 10px rgba(0,229,255,0.4); }
.ar-model__acc span { font-size: var(--fs-sm); color: var(--fg-secondary); font-weight: 400; margin-left: 2px; }
.ar-model__actions { display: flex; justify-content: flex-end; margin-top: 12px; }

/* 下发进度 Modal */
.ar-modal {
  position: fixed; inset: 0; z-index: 2000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(5,9,19,0.75);
  backdrop-filter: blur(6px);
  opacity: 0; pointer-events: none;
  transition: opacity var(--duration-base) var(--ease-out);
}
.ar-modal.is-open { opacity: 1; pointer-events: auto; }
.ar-modal__box {
  width: 420px; max-width: 90vw;
  background: linear-gradient(180deg, rgba(17,28,54,0.98) 0%, rgba(5,9,19,0.98) 100%);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,229,255,0.15) inset;
  transform: translateY(16px) scale(0.98);
  transition: transform var(--duration-base) var(--ease-out);
}
.ar-modal.is-open .ar-modal__box { transform: translateY(0) scale(1); }
.ar-modal__title { font-family: var(--font-display); font-size: var(--fs-lg); font-weight: 600; color: var(--fg-primary); margin-bottom: 6px; letter-spacing: 0.5px; }
.ar-modal__sub { font-size: var(--fs-sm); color: var(--fg-secondary); margin-bottom: 18px; }
.ar-progress { height: 10px; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid var(--border-base); overflow: hidden; }
.ar-progress__bar {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, var(--accent-blue), var(--accent-cyan));
  border-radius: 999px;
  box-shadow: 0 0 12px rgba(0,229,255,0.4);
  transition: width 0.3s var(--ease-out);
}
.ar-modal__percent { font-family: var(--font-display); font-size: var(--fs-xl); color: var(--accent-cyan); text-align: center; margin-top: 14px; text-shadow: 0 0 10px rgba(0,229,255,0.4); }

/* 工具 */
.ar-flex-between { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ar-mt-2 { margin-top: 8px; }
.ar-mt-3 { margin-top: 12px; }
.ar-mb-2 { margin-bottom: 8px; }

/* 动画 */
@keyframes arFadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes arSlideInRight {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
`;

/* ====================================================================
 * 工具函数
 * ==================================================================== */

function makeSvgDataUri(label, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
    <rect width="320" height="240" fill="#0a1224"/>
    <rect x="20" y="20" width="280" height="200" rx="8" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="8 6" opacity="0.6"/>
    <text x="160" y="110" font-family="sans-serif" font-size="22" fill="${color}" text-anchor="middle" opacity="0.9">${label}</text>
    <text x="160" y="145" font-family="sans-serif" font-size="13" fill="#4a5876" text-anchor="middle">示例图片</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function categoryByKey(key) {
  if (!key) return CATEGORIES[0];
  return CATEGORIES.find((c) => c.key === key || c.name === key) || CATEGORIES[0];
}

function randomConf() {
  return (88 + Math.random() * 11).toFixed(1);
}

/* 生成 Mock 识别结果 */
function mockRecognizeResult() {
  const count = 3 + Math.floor(Math.random() * 5);
  const results = [];
  for (let i = 0; i < count; i++) {
    const cat = CATEGORIES[i % CATEGORIES.length];
    const w = 12 + Math.random() * 26;
    const h = 10 + Math.random() * 22;
    const x = Math.random() * (92 - w);
    const y = Math.random() * (88 - h);
    results.push({
      label: cat.key,
      name: cat.name,
      confidence: parseFloat(randomConf()),
      x: parseFloat(x.toFixed(2)),
      y: parseFloat(y.toFixed(2)),
      w: parseFloat(w.toFixed(2)),
      h: parseFloat(h.toFixed(2)),
    });
  }
  return { results, count: results.length };
}

/* ====================================================================
 * 模板构造
 * ==================================================================== */

function renderKPICards() {
  const cards = [
    { label: '当前模型版本', value: 'YOLOv8-大坝 v2.3', unit: '', sub: '最新迭代 2026-07-18' },
    { label: '已部署边缘节点', value: '4', unit: '/ 6', sub: '2 个节点待同步' },
    { label: '7 类识别平均准确率', value: '94.3', unit: '%', sub: '↑ 较上周 +0.6%' },
    { label: '今日累计识别次数', value: '1,284', unit: '次', sub: '↑ 较昨日 +156' },
  ];
  return cards.map((c) => `
    <div class="kpi-card ar-kpi">
      <div class="kpi-card__label">${c.label}</div>
      <div class="kpi-card__value">${c.value}<span class="kpi-card__unit">${c.unit}</span></div>
      <div class="kpi-card__delta up">${c.sub}</div>
    </div>
  `).join('');
}

function renderDemoThumbs() {
  return DEMO_IMAGE_LABELS.map((label, i) => {
    const uri = makeSvgDataUri(label, 'rgba(0,229,255,0.55)');
    return `
      <div class="ar-thumb" data-index="${i}" role="button" tabindex="0" aria-label="选择示例：${label}">
        <img src="${uri}" alt="${label}" loading="lazy" />
        <div class="ar-thumb__label">${label}</div>
      </div>
    `;
  }).join('');
}

function renderResultItem(r) {
  const cat = categoryByKey(r.label);
  return `
    <div class="ar-result-item">
      <div class="ar-result__meta">
        <span class="ar-result__dot ${cat.cls}"></span>
        <div>
          <div class="ar-result__name">${r.name}</div>
          <div class="ar-result__coords">x:${r.x} y:${r.y} w:${r.w} h:${r.h}</div>
        </div>
      </div>
      <div class="ar-result__conf" style="color:var(${cat.colorVar || '--accent-cyan'})">${r.confidence}%</div>
    </div>
  `;
}

function renderBoxes(results) {
  if (!results || !results.length) return '';
  return results.map((r) => {
    const cat = categoryByKey(r.label);
    return `
      <div class="ar-box ${cat.cls}"
           style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;">
        <div class="ar-box__label">${r.name} ${r.confidence}%</div>
      </div>
    `;
  }).join('');
}

function renderModelCard(m, i) {
  const typeBadge = `<span class="badge">${m.type}</span>`;
  const statusBadge = m.deployed
    ? `<span class="badge badge-success"><span class="status-dot is-online"></span>已部署</span>`
    : `<span class="badge badge-warn">未部署</span>`;
  return `
    <div class="ar-model" data-model-id="${m.id}" style="animation: arSlideInRight var(--duration-base) var(--ease-out) both; animation-delay: ${i * 60}ms;">
      <div class="ar-model__head">
        <div class="ar-model__name">${m.name}</div>
        <div>${typeBadge}</div>
      </div>
      <div class="ar-flex-between">
        <div class="ar-model__meta">
          <span class="badge">版本 ${m.version}</span>
          ${statusBadge}
        </div>
        <div class="ar-model__acc">${m.accuracy}<span>%</span></div>
      </div>
      <div class="ar-model__actions">
        <button class="btn btn-primary ar-deploy-btn" data-id="${m.id}" ${m.deployed ? 'disabled' : ''} type="button">
          ${m.deployed ? '✓ 已下发' : '下发到边缘'}
        </button>
      </div>
    </div>
  `;
}

function renderModels() {
  if (!_models.length) {
    return `<div class="placeholder" style="min-height:180px;padding:24px;">
      <div class="placeholder__text">暂无模型数据</div>
      <button class="btn mt-2" id="ar-refresh-models">刷新模型列表</button>
    </div>`;
  }
  return `
    <div class="ar-model-list">
      ${_models.map((m, i) => renderModelCard(m, i)).join('')}
    </div>
  `;
}

function template() {
  return `
    <section class="page ar-page">
      <div class="ar-header">
        <div>
          <h1 class="page-title">AI 智能识别</h1>
          <p class="page-subtitle">云端模型下发 · 边缘侧推理 · 多类别缺陷检测</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${renderKPICards()}
      </div>

      <div class="ar-main">
        <div class="ar-left">
          <div class="card">
            <div class="section-title">图片上传与识别</div>
            <div class="ar-upload" id="ar-upload-zone">
              <div class="ar-upload__icon">📤</div>
              <div class="ar-upload__text">拖拽图片到此处，或点击上传</div>
              <div class="ar-upload__hint">支持 JPG / PNG，单张不超过 10MB</div>
              <input type="file" id="ar-file-input" accept="image/*" style="display:none" />
              <button class="btn btn-primary ar-mt-3" id="ar-select-btn" type="button">选择图片</button>
            </div>

            <div class="ar-mt-3">
              <div style="font-size:var(--fs-xs);color:var(--fg-muted);margin-bottom:8px;letter-spacing:0.5px;">示例图片（点击快速体验）</div>
              <div class="ar-thumbs" id="ar-thumbs">
                ${renderDemoThumbs()}
              </div>
            </div>

            <div class="ar-mt-3">
              <div class="ar-flex-between ar-mb-2">
                <span style="font-size:var(--fs-xs);color:var(--fg-muted);letter-spacing:0.5px;">识别画布</span>
                <button class="btn btn-primary" id="ar-run-btn" type="button" disabled>开始识别</button>
              </div>
              <div class="ar-canvas-wrap" id="ar-canvas-wrap">
                <div style="color:var(--fg-muted);font-size:var(--fs-sm);">请选择或上传一张图片</div>
              </div>
            </div>

            <div class="ar-mt-3">
              <div class="section-title" style="font-size:var(--fs-base);margin-bottom:10px;">识别结果</div>
              <div class="ar-results" id="ar-results">
                <div style="color:var(--fg-muted);font-size:var(--fs-sm);padding:8px 0;">暂无识别结果</div>
              </div>
            </div>
          </div>
        </div>

        <div class="ar-right">
          <div class="card">
            <div class="ar-flex-between" style="margin-bottom:14px;">
              <div class="section-title" style="font-size:var(--fs-base);margin-bottom:0;">模型管理</div>
              <button class="btn" id="ar-refresh-models-top" type="button">🔄 刷新模型列表</button>
            </div>
            <div id="ar-model-container">
              ${renderModels()}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 下发进度 Modal -->
    <div class="ar-modal" id="ar-deploy-modal" aria-hidden="true">
      <div class="ar-modal__box">
        <div class="ar-modal__title">模型下发中</div>
        <div class="ar-modal__sub" id="ar-modal-sub">正在将模型下发至边缘节点…</div>
        <div class="ar-progress">
          <div class="ar-progress__bar" id="ar-progress-bar"></div>
        </div>
        <div class="ar-modal__percent" id="ar-progress-percent">0%</div>
      </div>
    </div>
  `;
}

/* ====================================================================
 * 交互逻辑
 * ==================================================================== */

function setImagePreview(container, src, isBase64 = false) {
  const wrap = container.querySelector('#ar-canvas-wrap');
  const runBtn = container.querySelector('#ar-run-btn');
  if (!wrap || !runBtn) return;

  _currentImageBase64 = src;
  wrap.innerHTML = `
    <img id="ar-preview-img" src="${src}" alt="preview" />
    <div id="ar-box-layer" style="position:absolute;inset:0;pointer-events:none;"></div>
    <div id="ar-scan-layer" class="ar-scanline" style="display:none;"></div>
  `;
  runBtn.disabled = false;
  runBtn.textContent = '开始识别';

  // 清空旧结果
  const resultsEl = container.querySelector('#ar-results');
  if (resultsEl) resultsEl.innerHTML = '<div style="color:var(--fg-muted);font-size:var(--fs-sm);padding:8px 0;">点击“开始识别”运行推理</div>';
}

function setScanning(container, active) {
  const layer = container.querySelector('#ar-scan-layer');
  if (layer) layer.style.display = active ? 'block' : 'none';
}

function setBoxes(container, results) {
  const layer = container.querySelector('#ar-box-layer');
  if (!layer) return;
  layer.innerHTML = renderBoxes(results);
}

function setResults(container, results) {
  const el = container.querySelector('#ar-results');
  if (!el) return;
  if (!results || !results.length) {
    el.innerHTML = '<div style="color:var(--fg-muted);font-size:var(--fs-sm);padding:8px 0;">未检测到目标</div>';
    return;
  }
  el.innerHTML = results.map((r) => renderResultItem(r)).join('');
}

async function handleRecognize(container) {
  const runBtn = container.querySelector('#ar-run-btn');
  if (!runBtn || runBtn.disabled) return;

  runBtn.disabled = true;
  runBtn.textContent = '识别中…';
  setScanning(container, true);
  setBoxes(container, []);
  setResults(container, []);

  let data = null;
  try {
    let file = _currentFile;
    // 示例图片无 File 对象时，构造一个 mock Blob File
    if (!file && _currentImageBase64) {
      const blob = await fetch(_currentImageBase64).then((r) => r.blob());
      file = new File([blob], 'demo.jpg', { type: blob.type || 'image/jpeg' });
    }
    if (!file) throw new Error('没有可识别的图片');

    data = await ai.recognize(file);
  } catch (err) {
    console.warn('[ai-recognize] 识别接口失败，使用 Mock 数据：', err.message || err);
    data = mockRecognizeResult();
  }

  // 统一解析响应格式（兼容后端 { code, data: { boxes } } 与直接数组）
  let raw = data;
  if (raw && raw.data !== undefined) raw = raw.data;
  let results = [];
  if (Array.isArray(raw)) results = raw;
  else if (raw && Array.isArray(raw.results)) results = raw.results;
  else if (raw && Array.isArray(raw.boxes)) results = raw.boxes;
  else if (raw && raw.count) results = raw.results || raw.boxes || [];

  // 标准化字段
  results = results.map((r) => {
    let conf = typeof r.confidence === 'number' ? r.confidence : (typeof r.score === 'number' ? r.score : 90);
    if (conf > 0 && conf < 1) conf = +(conf * 100).toFixed(1); // 后端返回 0.92 -> 92
    const label = r.label || r.class || r.category || 'crack';
    return {
      label,
      name: r.name || r.class_name || categoryByKey(label).name,
      confidence: conf,
      x: r.x ?? r.left ?? 10,
      y: r.y ?? r.top ?? 10,
      w: r.w ?? r.width ?? 20,
      h: r.h ?? r.height ?? 20,
    };
  });

  // 延迟一点让扫描线动画有收尾感
  setTimeout(() => {
    setScanning(container, false);
    setBoxes(container, results);
    setResults(container, results);
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = '重新识别';
    }
  }, 800);
}

function bindUpload(container) {
  const zone = container.querySelector('#ar-upload-zone');
  const input = container.querySelector('#ar-file-input');
  const selectBtn = container.querySelector('#ar-select-btn');
  if (!zone || !input || !selectBtn) return;

  selectBtn.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    _currentFile = file;
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(container, e.target.result);
    reader.readAsDataURL(file);
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-dragover');
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    _currentFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(container, ev.target.result);
    reader.readAsDataURL(file);
  });
  zone.addEventListener('click', (e) => {
    if (e.target !== selectBtn && !selectBtn.contains(e.target)) {
      input.click();
    }
  });
}

function bindThumbs(container) {
  container.querySelectorAll('.ar-thumb').forEach((thumb, i) => {
    const activate = () => {
      container.querySelectorAll('.ar-thumb').forEach((t) => t.classList.remove('is-active'));
      thumb.classList.add('is-active');
      const label = DEMO_IMAGE_LABELS[i];
      const uri = makeSvgDataUri(label, 'rgba(0,229,255,0.55)');
      _currentFile = null;
      setImagePreview(container, uri);
    };
    thumb.addEventListener('click', activate);
    thumb.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') activate();
    });
  });
}

function bindRecognize(container) {
  const btn = container.querySelector('#ar-run-btn');
  if (btn) btn.addEventListener('click', () => handleRecognize(container));
}

function showDeployModal(container, model) {
  const modal = container.querySelector('#ar-deploy-modal');
  const bar = container.querySelector('#ar-progress-bar');
  const pct = container.querySelector('#ar-progress-percent');
  const sub = container.querySelector('#ar-modal-sub');
  if (!modal || !bar || !pct) return;

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  if (sub) sub.textContent = `正在将「${model.name}」下发至边缘节点…`;
  bar.style.width = '0%';
  pct.textContent = '0%';

  let progress = 0;
  const interval = setInterval(() => {
    progress += 20;
    if (progress > 100) progress = 100;
    bar.style.width = `${progress}%`;
    pct.textContent = `${progress}%`;
    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        // 更新模型状态
        const m = _models.find((x) => x.id === model.id);
        if (m) {
          m.deployed = true;
          refreshModelsUI(container);
        }
      }, 500);
    }
  }, 1000);
  _addTimer(interval);
}

function refreshModelsUI(container) {
  const box = container.querySelector('#ar-model-container');
  if (box) box.innerHTML = renderModels();
  bindDeployButtons(container);
  bindRefreshButton(container);
}

async function loadModels(container) {
  const topBtn = container.querySelector('#ar-refresh-models-top');
  if (topBtn) { topBtn.disabled = true; topBtn.textContent = '刷新中…'; }

  try {
    const res = await ai.models();
    let list = null;
    if (Array.isArray(res)) list = res;
    else if (res && Array.isArray(res.data)) list = res.data;
    else if (res && Array.isArray(res.items)) list = res.items;
    else if (res && res.data && Array.isArray(res.data.items)) list = res.data.items;

    if (list && list.length) {
      _models = list.map((m) => ({
        id: m.id || m.modelId || String(Math.random()).slice(2),
        name: m.name || m.modelName || '未命名模型',
        version: m.version || 'v1.0',
        type: m.type || m.modelType || '目标检测',
        accuracy: typeof m.accuracy === 'number' ? m.accuracy : (parseFloat(m.accuracy) || 90),
        deployed: !!m.deployed || !!m.isDeployed || m.edgeStatus === 'deployed',
      }));
    } else {
      _models = MOCK_MODELS;
    }
  } catch (err) {
    console.warn('[ai-recognize] 加载模型列表失败，使用 Mock：', err.message || err);
    _models = MOCK_MODELS;
  }

  if (topBtn) { topBtn.disabled = false; topBtn.textContent = '🔄 刷新模型列表'; }
  refreshModelsUI(container);
}

function bindDeployButtons(container) {
  container.querySelectorAll('.ar-deploy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const model = _models.find((m) => m.id === id);
      if (!model || model.deployed) return;
      showDeployModal(container, model);
    });
  });
}

function bindRefreshButton(container) {
  const topBtn = container.querySelector('#ar-refresh-models-top');
  const innerBtn = container.querySelector('#ar-refresh-models');
  const handler = () => loadModels(container);
  if (topBtn) topBtn.addEventListener('click', handler);
  if (innerBtn) innerBtn.addEventListener('click', handler);
}

function bindModalClose(container) {
  const modal = container.querySelector('#ar-deploy-modal');
  if (!modal) return;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      // 仅当不在进度中时允许点击关闭（实际体验中保留自动关闭即可）
    }
  });
}

/* ====================================================================
 * 主渲染入口
 * ==================================================================== */

export function render(container) {
  _clearTimers();
  _currentFile = null;
  _currentImageBase64 = null;

  if (!document.getElementById('ar-styles')) {
    const style = document.createElement('style');
    style.id = 'ar-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  container.innerHTML = template();

  bindUpload(container);
  bindThumbs(container);
  bindRecognize(container);
  bindDeployButtons(container);
  bindRefreshButton(container);
  bindModalClose(container);

  // 加载模型列表（异步）
  loadModels(container);
}

export default { render };
