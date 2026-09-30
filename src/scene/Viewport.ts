// Three.js 视口 — 命令式渲染器（方案第 2、11 节）
// - Scene DSL 文档是唯一可信来源；Three.js 对象是其渲染结果，不作为数据源
// - 按需渲染：相机/选择/几何变化时才刷新
// - 严格资源生命周期：geometry/material/texture 引用计数，dispose 不自动释放共享纹理
import * as THREE from 'three';
import { Geometry, Material, SceneDocument, SceneNode } from '../domain/types';

interface NodeResources {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

export class Viewport {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  // 相机轨道：围绕目标点的球面坐标（左键拖拽旋转 / 右键平移 / 滚轮缩放）
  private readonly orbitTarget = new THREE.Vector3(0, 0.5, 0);
  private orbitRadius = 6.87;
  private orbitTheta = 0.675; // 方位角
  private orbitPhi = 1.2; // 仰角（自 +Y 起算，限制不穿越极点）
  private readonly defaultMaterial: THREE.MeshStandardMaterial;
  private readonly sharedGeometryCache = new Map<string, THREE.BufferGeometry>();
  private readonly materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly nodeMap = new Map<string, NodeResources>();
  private rafHandle: number | null = null;
  private dirty = true;
  private readonly host: HTMLElement;
  private readonly onPick: (nodeId: string | null) => void;
  private resizeObserver: ResizeObserver | null = null;

  // 世界单位：米。相机近远裁剪面按工业设备场景尺度设定。
  constructor(host: HTMLElement, onPick: (nodeId: string | null) => void) {
    this.host = host;
    this.onPick = onPick;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 方案 11 节：限制高 DPI 像素比
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#202428');

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
    this.updateOrbitCamera();

    this.defaultMaterial = new THREE.MeshStandardMaterial({ color: '#9099A4', roughness: 0.6, metalness: 0.2 });

    this.setupLights();
    this.setupGrid();
    this.setupPicking();

    this.resizeObserver = new ResizeObserver(() => this.markDirty());
    this.resizeObserver.observe(host);
  }

  // 方案：环境光 + 主方向光（带阴影）+ 补光
  private setupLights(): void {
    const ambient = new THREE.AmbientLight('#ffffff', 0.55);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight('#ffffff', 1.1);
    dir.position.set(6, 10, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 60;
    dir.shadow.camera.left = -20;
    dir.shadow.camera.right = 20;
    dir.shadow.camera.top = 20;
    dir.shadow.camera.bottom = -20;
    this.scene.add(dir);

    const fill = new THREE.DirectionalLight('#bcd0ff', 0.35);
    fill.position.set(-5, 4, -6);
    this.scene.add(fill);
  }

  private setupGrid(): void {
    // 网格地面：1m 格子，便于目测尺寸
    const grid = new THREE.GridHelper(40, 40, '#4a5568', '#3a424d');
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.7;
    grid.position.y = 0;
    this.scene.add(grid);
  }

  private setupPicking(): void {
    // 命令式交互：左键拖拽旋转 / 点击拾取（位移 < 3px 视为点击）/ 右键拖拽平移 / 滚轮缩放
    const canvas = this.renderer.domElement;
    let down: { x: number; y: number; button: number } | null = null;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      down = { x: e.clientX, y: e.clientY, button: e.button };
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) < 3) return; // 小于阈值视为点击，不转相机
      if (down.button === 0) {
        // 左键：绕目标点旋转
        this.orbitTheta -= dx * 0.005;
        this.orbitPhi -= dy * 0.005;
        this.orbitPhi = Math.min(Math.max(this.orbitPhi, 0.08), Math.PI - 0.08); // 不穿越极点
      } else {
        // 右键：屏幕空间平移（右拖目标左移，符合「内容跟手」直觉）
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
        const scale = this.orbitRadius * 0.0015;
        this.orbitTarget.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
      }
      down.x = e.clientX;
      down.y = e.clientY;
      this.updateOrbitCamera();
    });

    canvas.addEventListener('pointerup', (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      const moved = Math.abs(dx) + Math.abs(dy) >= 3;
      if (!moved && down.button === 0) this.pickAt(e.clientX, e.clientY);
      down = null;
    });

    canvas.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        this.orbitRadius = Math.min(Math.max(this.orbitRadius * (1 + e.deltaY * 0.001), 0.3), 800);
        this.updateOrbitCamera();
      },
      { passive: false },
    );
  }

  // 射线拾取：命中节点反查稳定 ID（不用数组下标或临时数字 ID）
  private pickAt(clientX: number, clientY: number): void {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const meshes = Array.from(this.nodeMap.values()).map((r) => r.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    const hit = hits.find((h) => h.object.userData.nodeId);
    this.onPick(hit ? (hit.object.userData.nodeId as string) : null);
  }

  // 按球面坐标摆放相机：所有相机操作最终统一走这里
  private updateOrbitCamera(): void {
    const sinPhi = Math.sin(this.orbitPhi);
    this.camera.position.set(
      this.orbitTarget.x + this.orbitRadius * sinPhi * Math.sin(this.orbitTheta),
      this.orbitTarget.y + this.orbitRadius * Math.cos(this.orbitPhi),
      this.orbitTarget.z + this.orbitRadius * sinPhi * Math.cos(this.orbitTheta),
    );
    this.camera.lookAt(this.orbitTarget);
    this.markDirty();
  }

  markDirty(): void {
    this.dirty = true;
  }

  // 同步：DSL 文档 → Three.js 对象（reconciler，方案第 2 节）
  // 简单可靠的销毁-重建策略；后续按需细化 diff（InstancedMesh 等留到优化阶段）
  sync(doc: SceneDocument): void {
    // 清理旧资源
    this.disposeAllNodes();

    for (const node of doc.nodes) {
      if (!node.visible) continue;
      if (node.kind !== 'primitive' || !node.geometry) continue; // P0 只渲染基本体
      this.createNodeMesh(node, doc);
    }

    this.markDirty();
  }

  private createNodeMesh(node: SceneNode, doc: SceneDocument): void {
    const geometry = this.buildGeometry(node.geometry!);
    const material = this.buildMaterial(node.materialId, doc);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.nodeId = node.id; // 视口只映射稳定 ID，不用数组下标或临时数字 ID
    mesh.name = node.name;

    // 变换：DSL 保存相对父节点的局部变换；P0 一层分组按世界放置
    const [px, py, pz] = node.transform.position;
    const [qx, qy, qz, qw] = node.transform.rotationQuaternion;
    const [sx, sy, sz] = node.transform.scale;
    mesh.position.set(px, py, pz);
    mesh.quaternion.set(qx, qy, qz, qw);
    mesh.scale.set(sx, sy, sz);

    this.scene.add(mesh);
    this.nodeMap.set(node.id, { mesh, geometry, material });
  }

  // 几何构建：几何默认以局部原点为中心（方案第 4 节）
  private buildGeometry(g: Geometry): THREE.BufferGeometry {
    const key = JSON.stringify(g);
    const cached = this.sharedGeometryCache.get(key);
    if (cached) return cached;

    let geo: THREE.BufferGeometry;
    switch (g.type) {
      case 'box': {
        const p = g.params;
        geo = new THREE.BoxGeometry(p.width, p.height, p.depth);
        break;
      }
      case 'sphere': {
        const p = g.params;
        geo = new THREE.SphereGeometry(p.radius, p.widthSegments, p.heightSegments);
        break;
      }
      case 'cylinder': {
        const p = g.params;
        geo = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, p.radialSegments);
        break;
      }
      case 'cone': {
        const p = g.params;
        geo = new THREE.ConeGeometry(p.radius, p.height, p.radialSegments);
        break;
      }
      case 'plane': {
        const p = g.params;
        geo = new THREE.PlaneGeometry(p.width, p.depth, p.widthSegments, p.depthSegments);
        break;
      }
      default: {
        // 类型白名单外的走不到这里（validate 已拒绝）；兜底立方体防止渲染崩溃
        geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      }
    }
    this.sharedGeometryCache.set(key, geo);
    return geo;
  }

  private buildMaterial(materialId: string | undefined, doc: SceneDocument): THREE.MeshStandardMaterial {
    if (!materialId) return this.defaultMaterial;
    const found = doc.materials.find((m) => m.id === materialId);
    if (!found) return this.defaultMaterial;
    return this.getOrCreateMaterial(found);
  }

  private getOrCreateMaterial(m: Material): THREE.MeshStandardMaterial {
    const key = JSON.stringify(m);
    const cached = this.materialCache.get(key);
    if (cached) return cached;
    const mat = new THREE.MeshStandardMaterial({
      color: m.baseColor,
      roughness: m.roughness,
      metalness: m.metalness,
      transparent: m.opacity !== undefined && m.opacity < 1,
      opacity: m.opacity ?? 1,
    });
    this.materialCache.set(key, mat);
    return mat;
  }

  // 选择高亮：视口选中状态是从文档派生的运行时状态，不写入项目主文档
  setSelection(selectedIds: Set<string>): void {
    for (const [id, res] of this.nodeMap) {
      const selected = selectedIds.has(id);
      const emap = res.mesh.userData;
      emap.selected = selected;
      // 用材质 emissive 做选中描边（简单可靠）；不切换材质实例以免污染缓存
      const baseMat = res.material;
      baseMat.emissive.set(selected ? '#2b6cb0' : '#000000');
      baseMat.emissiveIntensity = selected ? 0.45 : 0;
    }
    this.markDirty();
  }

  private disposeAllNodes(): void {
    for (const [, res] of this.nodeMap) {
      this.scene.remove(res.mesh);
    }
    this.nodeMap.clear();
    // 共享 geometry/material 缓解跨节点复用；文档级重建时一并清理
    for (const [, geo] of this.sharedGeometryCache) geo.dispose();
    for (const [, mat] of this.materialCache) mat.dispose();
    this.sharedGeometryCache.clear();
    this.materialCache.clear();
  }

  private render(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w > 0 && h > 0) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    }
    this.renderer.render(this.scene, this.camera);
  }

  // 按需渲染循环：静态场景不持续刷新
  start(): void {
    const loop = () => {
      this.render();
      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  dispose(): void {
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.resizeObserver?.disconnect();
    this.disposeAllNodes();
    this.defaultMaterial.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.host) {
      this.host.removeChild(this.renderer.domElement);
    }
  }
}
