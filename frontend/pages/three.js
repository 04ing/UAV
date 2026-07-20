/* =====================================================================
 * 三维展示 — Task 15 完整实现（Three.js 水库大坝巡检场景）
 * ===================================================================== */

/* ---------- 模块级状态 ---------- */
let scene, camera, renderer, controls;
let animationId;
let raycaster, pointer;
let clock;
let droneGroup;
let entranceProgress = 0;        // 0 → 1
let isEntranceDone = false;

const markers = [];              // { mesh, name, description }
const alertCones = [];
let tooltipEl = null;
let detailPanelEl = null;
let layerPanelEl = null;
let resetBtnEl = null;

const layerMap = new Map();      // name → Object3D

/* ---------- CSS 变量读取 ---------- */
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function cssVarToThreeColor(name, fallbackHex) {
  const raw = cssVar(name, fallbackHex);
  // 支持 rgba(...)
  if (raw.startsWith('rgba') || raw.startsWith('rgb')) {
    const nums = raw.match(/[\d.]+/g).map(Number);
    const r = nums[0] / 255;
    const g = nums[1] / 255;
    const b = nums[2] / 255;
    return new THREE.Color(r, g, b);
  }
  return new THREE.Color(raw);
}

/* ---------- 场景清理 ---------- */
function disposeScene() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  window.removeEventListener('resize', onWindowResize);
  renderer?.domElement?.removeEventListener('pointermove', onPointerMove);
  renderer?.domElement?.removeEventListener('click', onClick);

  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement?.parentNode?.removeChild(renderer.domElement);
    renderer = null;
  }

  if (scene) {
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    scene = null;
  }

  controls = null;
  camera = null;
  droneGroup = null;
  markers.length = 0;
  alertCones.length = 0;
  layerMap.clear();
  tooltipEl?.remove();
  tooltipEl = null;
  detailPanelEl?.remove();
  detailPanelEl = null;
  layerPanelEl?.remove();
  layerPanelEl = null;
  resetBtnEl?.remove();
  resetBtnEl = null;
}

/* ---------- 构建星空背景 ---------- */
function createStarfield() {
  const count = 2000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c1 = cssVarToThreeColor('--accent-cyan', '#00e5ff');
  const c2 = cssVarToThreeColor('--accent-blue', '#0066ff');
  const bg = cssVarToThreeColor('--bg-deep', '#050913');

  for (let i = 0; i < count; i++) {
    const r = 800 + Math.random() * 1200;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);

    const mix = Math.random();
    const starColor = c1.clone().lerp(c2, mix).lerp(bg, 0.6);
    col[i * 3] = starColor.r;
    col[i * 3 + 1] = starColor.g;
    col[i * 3 + 2] = starColor.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: 2,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true
  });
  const stars = new THREE.Points(geo, mat);
  stars.name = 'stars';
  return stars;
}

/* ---------- 构建网格地面 ---------- */
function createGridGround() {
  const color = cssVarToThreeColor('--accent-cyan', '#00e5ff');
  const grid = new THREE.GridHelper(600, 60, color, color);
  grid.material.transparent = true;
  grid.material.opacity = 0.15;
  grid.position.y = -30;
  grid.name = 'grid';
  return grid;
}

/* ---------- 大坝主体 ---------- */
function createDam() {
  const group = new THREE.Group();
  group.name = 'dam';

  const gray = cssVarToThreeColor('--fg-secondary', '#8a9bbd');

  // 主坝体 — 长方体
  const bodyGeo = new THREE.BoxGeometry(140, 60, 30);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: gray,
    roughness: 0.7,
    metalness: 0.2
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 顶部圆柱装饰（排水管 / 道路护栏意象）
  const cylGeo = new THREE.CylinderGeometry(4, 4, 120, 16);
  const cylMat = new THREE.MeshStandardMaterial({
    color: gray.clone().multiplyScalar(1.1),
    roughness: 0.5,
    metalness: 0.3
  });
  const cyl = new THREE.Mesh(cylGeo, cylMat);
  cyl.rotation.z = Math.PI / 2;
  cyl.position.set(0, 32, 0);
  group.add(cyl);

  // 左右坝肩 — 楔形块
  const wedgeGeo = new THREE.BoxGeometry(40, 50, 25);
  const wedgeMat = new THREE.MeshStandardMaterial({ color: gray, roughness: 0.8 });
  const leftWedge = new THREE.Mesh(wedgeGeo, wedgeMat);
  leftWedge.position.set(-90, -5, 0);
  leftWedge.rotation.z = 0.15;
  group.add(leftWedge);

  const rightWedge = new THREE.Mesh(wedgeGeo, wedgeMat);
  rightWedge.position.set(90, -5, 0);
  rightWedge.rotation.z = -0.15;
  group.add(rightWedge);

  return group;
}

/* ---------- 水面 ---------- */
function createWater() {
  const color = cssVarToThreeColor('--accent-blue', '#0066ff');
  const geo = new THREE.PlaneGeometry(500, 300, 64, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.45,
    roughness: 0.1,
    metalness: 0.6,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, -25, 80);
  mesh.name = 'water';
  return mesh;
}

/* ---------- 地形 ---------- */
function createTerrain() {
  const size = 600;
  const seg = 80;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    // 起伏高度
    let y = Math.sin(x * 0.02) * 8 + Math.cos(z * 0.025) * 6;
    y += Math.sin(x * 0.05 + z * 0.04) * 3;
    // 大坝区域附近平坦
    if (Math.abs(x) < 100 && Math.abs(z) < 40) {
      y *= 0.1;
    }
    posAttr.setY(i, y - 35);
  }
  geo.computeVertexNormals();

  const green = cssVarToThreeColor('--success', '#00f5a0');
  const mat = new THREE.MeshStandardMaterial({
    color: green.clone().multiplyScalar(0.35),
    roughness: 0.9,
    metalness: 0.05,
    wireframe: true
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

/* ---------- 巡检无人机 ---------- */
function createDrone() {
  const group = new THREE.Group();
  group.name = 'drone';

  const cyan = cssVarToThreeColor('--accent-cyan', '#00e5ff');

  // 机身
  const bodyGeo = new THREE.BoxGeometry(6, 3, 6);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: cyan,
    emissive: cyan,
    emissiveIntensity: 0.6,
    roughness: 0.3,
    metalness: 0.5
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // 四个旋翼臂
  const armGeo = new THREE.BoxGeometry(10, 0.6, 1);
  const armMat = new THREE.MeshStandardMaterial({
    color: cyan.clone().multiplyScalar(0.7),
    emissive: cyan,
    emissiveIntensity: 0.3
  });
  const arm1 = new THREE.Mesh(armGeo, armMat);
  arm1.position.set(0, 0, 0);
  group.add(arm1);
  const arm2 = new THREE.Mesh(armGeo, armMat);
  arm2.rotation.y = Math.PI / 2;
  group.add(arm2);

  // 旋翼（圆盘）
  const bladeGeo = new THREE.CylinderGeometry(3, 3, 0.2, 16);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: cyan.clone().multiplyScalar(0.5),
    transparent: true,
    opacity: 0.6
  });
  const offsets = [[5, 0, 0], [-5, 0, 0], [0, 0, 5], [0, 0, -5]];
  offsets.forEach(([x, y, z]) => {
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(x, y + 1.2, z);
    blade.userData.isBlade = true;
    group.add(blade);
  });

  // 发光点光源
  const light = new THREE.PointLight(cyan, 2, 60);
  light.position.set(0, -2, 0);
  group.add(light);

  group.position.set(0, 40, 0);
  return group;
}

/* ---------- 告警标记 ---------- */
function createAlertMarker(x, y, z, colorName) {
  const group = new THREE.Group();
  const color = cssVarToThreeColor(colorName, '#ff3b6b');

  const coneGeo = new THREE.ConeGeometry(3, 8, 16);
  const coneMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.8,
    roughness: 0.4
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = 4;
  group.add(cone);

  // 底部发光环
  const ringGeo = new THREE.RingGeometry(2, 3, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  group.add(ring);

  // 脉冲点光源
  const light = new THREE.PointLight(color, 1.5, 40);
  light.position.y = 5;
  group.add(light);

  group.position.set(x, y, z);
  group.userData = { ring, light, baseY: y, pulseOffset: Math.random() * Math.PI * 2 };
  return group;
}

/* ---------- 标注点位 ---------- */
function createLabelMarkers() {
  const labelData = [
    { name: '大坝顶部', pos: [0, 35, 0], desc: '坝顶高程 185m，路面宽 8m，设有护栏与排水沟。' },
    { name: '溢洪道', pos: [40, 20, 25], desc: '5 孔弧形闸门，设计泄量 12,000 m³/s。' },
    { name: '取水口', pos: [-50, -10, 90], desc: '深层取水塔，供应下游城市供水与生态流量。' },
    { name: '左岸坝肩', pos: [-110, 10, -10], desc: '左岸山体帷幕灌浆区，渗压监测点 12 个。' },
    { name: '右岸坝肩', pos: [110, 10, -10], desc: '右岸滑坡体位移监测，GNSS 基准站 1 座。' },
    { name: '发电厂房', pos: [0, -25, 120], desc: '地下厂房，装机 6×700MW，年发电量约 180 亿 kWh。' }
  ];

  const color = cssVarToThreeColor('--accent-electric', '#4d9fff');

  labelData.forEach((d) => {
    const geo = new THREE.SphereGeometry(2.2, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...d.pos);
    mesh.userData = { isMarker: true, name: d.name, description: d.desc };
    scene.add(mesh);
    markers.push(mesh);
  });
}

/* ---------- UI 元素 ---------- */
function createTooltip() {
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 1000;
    padding: 6px 12px;
    background: rgba(5, 9, 19, 0.9);
    border: 1px solid var(--border-glow);
    border-radius: var(--radius-sm);
    color: var(--accent-cyan);
    font-size: var(--fs-sm);
    font-family: var(--font-body);
    backdrop-filter: blur(8px);
    opacity: 0;
    transition: opacity 150ms ease;
    white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  `;
  document.body.appendChild(el);
  return el;
}

function createDetailPanel() {
  const el = document.createElement('div');
  el.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    width: 320px;
    padding: 20px;
    background: rgba(5, 9, 19, 0.92);
    border: 1px solid var(--border-glow);
    border-radius: var(--radius-md);
    color: var(--fg-primary);
    font-size: var(--fs-sm);
    font-family: var(--font-body);
    backdrop-filter: blur(12px);
    z-index: 100;
    box-shadow: var(--shadow-card);
    transform: translateX(360px);
    transition: transform var(--duration-base) var(--ease-out);
  `;
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <span style="font-family:var(--font-display);font-size:var(--fs-lg);color:var(--accent-cyan);font-weight:600;">点位详情</span>
      <button id="three-close-detail" style="background:none;border:none;color:var(--fg-muted);cursor:pointer;font-size:18px;line-height:1;">&times;</button>
    </div>
    <div id="three-detail-content" style="line-height:1.7;color:var(--fg-secondary);">点击场景中的标注点位查看详情。</div>
  `;
  document.getElementById('view').appendChild(el);

  el.querySelector('#three-close-detail').addEventListener('click', () => {
    el.style.transform = 'translateX(360px)';
  });
  return el;
}

function createLayerPanel() {
  const el = document.createElement('div');
  el.style.cssText = `
    position: absolute;
    bottom: 20px;
    left: 20px;
    padding: 16px;
    background: rgba(5, 9, 19, 0.85);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-md);
    color: var(--fg-primary);
    font-size: var(--fs-sm);
    font-family: var(--font-body);
    backdrop-filter: blur(10px);
    z-index: 100;
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 140px;
  `;

  const layersConfig = [
    { key: 'dam', label: '大坝' },
    { key: 'water', label: '水面' },
    { key: 'terrain', label: '地形' },
    { key: 'drone', label: '无人机' },
    { key: 'alerts', label: '告警' }
  ];

  el.innerHTML = `<div style="font-family:var(--font-display);font-weight:600;color:var(--accent-cyan);margin-bottom:4px;">图层控制</div>`;
  layersConfig.forEach((cfg) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--fg-secondary);';
    row.innerHTML = `
      <input type="checkbox" checked data-layer="${cfg.key}" style="accent-color:var(--accent-cyan);width:14px;height:14px;">
      <span>${cfg.label}</span>
    `;
    el.appendChild(row);
  });

  document.getElementById('view').appendChild(el);

  el.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    const key = cb.dataset.layer;
    const visible = cb.checked;
    if (key === 'alerts') {
      alertCones.forEach((g) => { g.visible = visible; });
    } else if (layerMap.has(key)) {
      layerMap.get(key).visible = visible;
    }
  });

  return el;
}

function createResetButton() {
  const el = document.createElement('button');
  el.textContent = '重置视角';
  el.style.cssText = `
    position: absolute;
    bottom: 20px;
    right: 20px;
    padding: 8px 16px;
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid var(--border-glow);
    border-radius: var(--radius-md);
    color: var(--accent-cyan);
    font-family: var(--font-display);
    font-size: var(--fs-sm);
    cursor: pointer;
    backdrop-filter: blur(8px);
    z-index: 100;
    transition: all var(--duration-fast) var(--ease-out);
  `;
  el.addEventListener('mouseenter', () => {
    el.style.background = 'rgba(0, 229, 255, 0.2)';
    el.style.boxShadow = '0 0 16px rgba(0,229,255,0.3)';
  });
  el.addEventListener('mouseleave', () => {
    el.style.background = 'rgba(0, 229, 255, 0.1)';
    el.style.boxShadow = 'none';
  });
  el.addEventListener('click', () => {
    resetCamera();
  });
  document.getElementById('view').appendChild(el);
  return el;
}

function resetCamera() {
  if (!camera || !controls) return;
  // 使用 entrance 动画重新推进
  isEntranceDone = false;
  entranceProgress = 0;
}

/* ---------- 事件处理 ---------- */
function onWindowResize() {
  if (!camera || !renderer) return;
  const view = document.getElementById('view');
  if (!view) return;
  const w = view.clientWidth;
  const h = view.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function onPointerMove(event) {
  if (!raycaster || !pointer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(markers);

  if (intersects.length > 0) {
    const obj = intersects[0].object;
    if (obj.userData.isMarker) {
      tooltipEl.textContent = obj.userData.name;
      tooltipEl.style.opacity = '1';
      tooltipEl.style.left = `${event.clientX + 14}px`;
      tooltipEl.style.top = `${event.clientY + 14}px`;
      renderer.domElement.style.cursor = 'pointer';
      return;
    }
  }
  tooltipEl.style.opacity = '0';
  renderer.domElement.style.cursor = 'default';
}

function onClick(event) {
  if (!raycaster || !pointer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(markers);

  if (intersects.length > 0) {
    const obj = intersects[0].object;
    if (obj.userData.isMarker) {
      showDetail(obj.userData.name, obj.userData.description);
      return;
    }
  }
}

function showDetail(title, desc) {
  const content = detailPanelEl.querySelector('#three-detail-content');
  content.innerHTML = `<strong style="color:var(--fg-primary);font-size:var(--fs-base);display:block;margin-bottom:8px;">${title}</strong>${desc}`;
  detailPanelEl.style.transform = 'translateX(0)';
}

/* ---------- 动画循环 ---------- */
function animate() {
  animationId = requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const time = clock.getElapsedTime();

  // 入场动画：相机从远处推近
  if (!isEntranceDone) {
    entranceProgress += dt * 0.35;
    if (entranceProgress >= 1) {
      entranceProgress = 1;
      isEntranceDone = true;
    }
    const t = 1 - Math.pow(1 - entranceProgress, 3); // ease-out cubic
    camera.position.set(
      300 + (180 - 300) * t,
      220 + (140 - 220) * t,
      400 + (200 - 400) * t
    );
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }

  // 无人机轨道飞行 + 上下浮动
  if (droneGroup) {
    const orbitR = 90;
    const orbitSpeed = 0.25;
    const angle = time * orbitSpeed;
    droneGroup.position.x = Math.cos(angle) * orbitR;
    droneGroup.position.z = Math.sin(angle) * orbitR;
    droneGroup.position.y = 45 + Math.sin(time * 1.2) * 6;
    droneGroup.rotation.y = -angle;

    // 旋翼旋转
    droneGroup.children.forEach((child) => {
      if (child.userData.isBlade) {
        child.rotation.y += dt * 12;
      }
    });
  }

  // 告警标记脉冲
  alertCones.forEach((g) => {
    const { ring, light, baseY, pulseOffset } = g.userData;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3 + pulseOffset);
    if (ring) ring.material.opacity = 0.3 + pulse * 0.5;
    if (light) light.intensity = 1 + pulse * 1.5;
    g.position.y = baseY + Math.sin(time * 2 + pulseOffset) * 1.5;
  });

  // 水面轻微波动
  const water = layerMap.get('water');
  if (water && water.material) {
    water.position.y = -25 + Math.sin(time * 0.8) * 0.8;
  }

  // 地形轻微呼吸
  const terrain = layerMap.get('terrain');
  if (terrain && terrain.material) {
    terrain.material.emissive = cssVarToThreeColor('--success', '#00f5a0');
    terrain.material.emissiveIntensity = 0.02 + Math.sin(time * 0.5) * 0.01;
  }

  controls?.update();
  renderer.render(scene, camera);
}

/* =====================================================================
 * 对外导出
 * ===================================================================== */
export function render(container) {
  disposeScene();

  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.minHeight = 'calc(100vh - var(--topbar-height) - var(--statusbar-height) - 40px)';

  // 标题栏（保留页面风格）
  const header = document.createElement('div');
  header.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 16px 24px;
    z-index: 50;
    pointer-events: none;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  `;
  header.innerHTML = `
    <div>
      <h1 style="font-family:var(--font-display);font-size:var(--fs-2xl);font-weight:700;color:var(--fg-primary);letter-spacing:1px;margin-bottom:4px;text-shadow:0 2px 8px rgba(0,0,0,0.8);">三维展示</h1>
      <p style="font-size:var(--fs-sm);color:var(--fg-secondary);text-shadow:0 1px 4px rgba(0,0,0,0.8);">水库大坝 · 无人机巡检三维可视化</p>
    </div>
  `;
  container.appendChild(header);

  // Three.js 全局对象
  const THREE = window.THREE;
  if (!THREE) {
    container.innerHTML = `<div class="placeholder"><div class="placeholder__icon">⚠️</div><div class="placeholder__text">Three.js 未加载</div></div>`;
    return;
  }

  /* ---------- 场景 ---------- */
  scene = new THREE.Scene();
  const bgColor = cssVarToThreeColor('--bg-deep', '#050913');
  scene.background = bgColor;
  scene.fog = new THREE.FogExp2(bgColor, 0.0015);

  /* ---------- 相机 ---------- */
  const viewW = container.clientWidth || 800;
  const viewH = container.clientHeight || 600;
  camera = new THREE.PerspectiveCamera(50, viewW / viewH, 0.1, 3000);
  // 初始位置在远处，由入场动画推进
  camera.position.set(300, 220, 400);
  camera.lookAt(0, 0, 0);

  /* ---------- 渲染器 ---------- */
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(viewW, viewH);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.borderRadius = 'var(--radius-md)';
  container.insertBefore(renderer.domElement, header);

  /* ---------- 灯光 ---------- */
  const ambientLight = new THREE.AmbientLight(
    cssVarToThreeColor('--fg-primary', '#e8f0ff'),
    0.4
  );
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(
    cssVarToThreeColor('--fg-primary', '#e8f0ff'),
    1.2
  );
  dirLight.position.set(100, 200, 100);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 600;
  dirLight.shadow.camera.left = -200;
  dirLight.shadow.camera.right = 200;
  dirLight.shadow.camera.top = 200;
  dirLight.shadow.camera.bottom = -200;
  scene.add(dirLight);

  const blueLight = new THREE.DirectionalLight(
    cssVarToThreeColor('--accent-blue', '#0066ff'),
    0.5
  );
  blueLight.position.set(-100, 50, -100);
  scene.add(blueLight);

  /* ---------- 控制器 ---------- */
  const OrbitControls = THREE.OrbitControls;
  if (!OrbitControls) {
    container.innerHTML = `<div class="placeholder"><div class="placeholder__icon">⚠️</div><div class="placeholder__text">OrbitControls 未加载</div></div>`;
    return;
  }
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 50;
  controls.maxDistance = 800;
  controls.target.set(0, 0, 0);

  /* ---------- 场景对象 ---------- */
  const stars = createStarfield();
  scene.add(stars);
  layerMap.set('stars', stars);

  const grid = createGridGround();
  scene.add(grid);
  layerMap.set('grid', grid);

  const dam = createDam();
  scene.add(dam);
  layerMap.set('dam', dam);

  const water = createWater();
  scene.add(water);
  layerMap.set('water', water);

  const terrain = createTerrain();
  scene.add(terrain);
  layerMap.set('terrain', terrain);

  droneGroup = createDrone();
  scene.add(droneGroup);
  layerMap.set('drone', droneGroup);

  // 告警标记
  const alertDefs = [
    { pos: [30, 35, 20], color: '--danger' },
    { pos: [-60, -15, 80], color: '--warn' },
    { pos: [100, 5, -5], color: '--danger' }
  ];
  alertDefs.forEach((a) => {
    const g = createAlertMarker(...a.pos, a.color);
    scene.add(g);
    alertCones.push(g);
  });
  layerMap.set('alerts', { visible: true }); // 占位，实际用 alertCones 控制

  /* ---------- 标注点位 ---------- */
  createLabelMarkers();

  /* ---------- UI ---------- */
  tooltipEl = createTooltip();
  detailPanelEl = createDetailPanel();
  layerPanelEl = createLayerPanel();
  resetBtnEl = createResetButton();

  /* ---------- 交互 ---------- */
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  clock = new THREE.Clock();

  window.addEventListener('resize', onWindowResize);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('click', onClick);

  /* ---------- 启动动画 ---------- */
  entranceProgress = 0;
  isEntranceDone = false;
  animate();
}

export default { render };
