/**
 * 小地图与大明航海图系统 (Minimap & World Chart)
 * 包含右上角常驻雷达小地图与按下 M 键切换的全屏古风航海大地图
 */
export class Minimap {
  constructor(terrain, dock) {
    this.terrain = terrain;
    this.dock = dock;
    this.isFullMapOpen = false;

    this.initDOM();
  }

  initDOM() {
    // 1. 右上角常驻雷达小地图容器
    const radarContainer = document.createElement('div');
    radarContainer.id = 'minimap-radar';
    radarContainer.innerHTML = `
      <div class="radar-frame">
        <canvas id="radar-canvas" width="180" height="180"></canvas>
        <div class="radar-crosshair"></div>
        <div class="radar-north">N</div>
        <div class="radar-label">龙牙海域</div>
      </div>
    `;
    document.body.appendChild(radarContainer);
    this.radarCanvas = document.getElementById('radar-canvas');
    this.radarCtx = this.radarCanvas.getContext('2d');

    // 2. 全屏大明航海图 (按 M 打开)
    const fullMapContainer = document.createElement('div');
    fullMapContainer.id = 'full-map-modal';
    fullMapContainer.className = 'modal-hidden';
    fullMapContainer.innerHTML = `
      <div class="map-parchment">
        <div class="map-header">
          <span class="map-seal">敕命</span>
          <h2>大明太监下西洋航海针经总图</h2>
          <button id="close-map-btn" class="close-btn">✕ [M键关闭]</button>
        </div>
        <div class="map-canvas-wrapper">
          <canvas id="full-map-canvas" width="800" height="600"></canvas>
          <div class="compass-rose"></div>
        </div>
        <div class="map-footer">
          <div class="map-coords" id="map-coords-display">经度: 104°E | 纬度: 1°N | 航速: 0 节</div>
          <div class="map-legend">
            <span><i class="legend-anchor">⚓</i> 官澳码头</span>
            <span><i class="legend-island">⛰</i> 陆地岛屿</span>
            <span><i class="legend-reef">🌊</i> 浅滩暗礁</span>
            <span><i class="legend-player">▲</i> 宝船水手</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(fullMapContainer);
    this.fullMapModal = fullMapContainer;
    this.fullMapCanvas = document.getElementById('full-map-canvas');
    this.fullMapCtx = this.fullMapCanvas.getContext('2d');
    this.coordsDisplay = document.getElementById('map-coords-display');

    document.getElementById('close-map-btn').addEventListener('click', () => {
      this.toggleFullMap();
    });
  }

  /**
   * 切换全屏航海图开关状态
   */
  toggleFullMap() {
    this.isFullMapOpen = !this.isFullMapOpen;
    if (this.isFullMapOpen) {
      this.fullMapModal.classList.remove('modal-hidden');
    } else {
      this.fullMapModal.classList.add('modal-hidden');
    }
  }

  /**
   * 绘制右上角雷达小地图
   */
  renderRadar(playerPos, playerHeading, modeName) {
    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radarRange = 320; // 雷达半径范围（米）
    const scale = (w / 2) / radarRange;

    ctx.clearRect(0, 0, w, h);

    // 背景深海圆底
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0f2942';
    ctx.fill();

    // 绘制各岛屿在小地图上的相对投影
    this.terrain.islands.forEach(isl => {
      const dx = (isl.x - playerPos.x) * scale;
      const dz = (isl.z - playerPos.z) * scale;
      const r = isl.radius * scale;

      ctx.beginPath();
      ctx.arc(cx + dx, cy + dz, r, 0, Math.PI * 2);
      ctx.fillStyle = '#3d6338';
      ctx.fill();
      ctx.strokeStyle = '#c4b07b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // 绘制码头标记
    const dockDx = (this.dock.origin.x - playerPos.x) * scale;
    const dockDz = (this.dock.origin.z - playerPos.z) * scale;
    ctx.fillStyle = '#ffbe0b';
    ctx.beginPath();
    ctx.arc(cx + dockDx, cy + dockDz, 4, 0, Math.PI * 2);
    ctx.fill();

    // 玩家中心朝向箭头
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-playerHeading + Math.PI);

    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fillStyle = modeName === '战船' ? '#d90429' : (modeName === '滑板' ? '#00f5d4' : '#ffd166');
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  /**
   * 绘制全屏古风航海大地图
   */
  renderFullMap(playerPos, playerHeading, speedKnots, modeName) {
    if (!this.isFullMapOpen) return;

    const ctx = this.fullMapCtx;
    const w = this.fullMapCanvas.width;
    const h = this.fullMapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const mapWorldSize = 1600; // 航海大图覆盖范围 (米)
    const scale = w / mapWorldSize;

    // 古黄羊皮纸底色
    ctx.fillStyle = '#ebd6b0';
    ctx.fillRect(0, 0, w, h);

    // 经纬格网线
    ctx.strokeStyle = '#c2a67e';
    ctx.lineWidth = 0.8;
    for (let x = 0; x < w; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 绘制航路等深线
    ctx.strokeStyle = '#9eb3c2';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx + 90 * scale, cy, 380 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 绘制群岛
    this.terrain.islands.forEach(isl => {
      const ix = cx + isl.x * scale;
      const iz = cy + isl.z * scale;
      const ir = isl.radius * scale;

      // 岛屿陆地
      ctx.beginPath();
      ctx.arc(ix, iz, ir, 0, Math.PI * 2);
      ctx.fillStyle = '#658d5b';
      ctx.fill();
      ctx.strokeStyle = '#415e39';
      ctx.lineWidth = 2.0;
      ctx.stroke();

      // 岛屿名称朱砂古体字
      ctx.font = 'bold 15px "KaiTi", "SimSun", serif';
      ctx.fillStyle = '#8b1e0f';
      ctx.textAlign = 'center';
      ctx.fillText(isl.name, ix, iz - ir - 6);
    });

    // 绘制码头泊位
    const dockX = cx + this.dock.origin.x * scale;
    const dockZ = cy + this.dock.origin.z * scale;
    ctx.fillStyle = '#9c27b0';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('⚓ 官澳码头', dockX + 38, dockZ + 5);

    // 绘制玩家标记 (金红指针)
    const px = cx + playerPos.x * scale;
    const pz = cy + playerPos.z * scale;

    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-playerHeading + Math.PI);

    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 5);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fillStyle = '#d90429';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    ctx.restore();

    // 更新底部坐标显示
    const lat = (1.28 + playerPos.z * 0.0001).toFixed(4);
    const lon = (103.85 + playerPos.x * 0.0001).toFixed(4);
    this.coordsDisplay.innerText = `经度: ${lon}°E | 纬度: ${lat}°N | 状态: 【${modeName}】 | 航速: ${speedKnots.toFixed(1)} 节`;
  }

  update(playerPos, playerHeading, speedKnots, modeName) {
    this.renderRadar(playerPos, playerHeading, modeName);
    this.renderFullMap(playerPos, playerHeading, speedKnots, modeName);
  }
}
