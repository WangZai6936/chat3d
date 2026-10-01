// Three.js 视口 — 命令式渲染器（方案第 2、11 节）
// - Scene DSL 文档是唯一可信来源；Three.js 对象是其渲染结果，不作为数据源
// - 按需渲染：相机/选择/几何变化时才刷新
// - 严格资源生命周期：geometry/material/texture 引用计数，dispose 不自动释放共享纹理
// - 渲染质感：PMREM 环境贴图 + ACES 色调映射 + 阴影地面 + 雾 + 渐变背景 + 盒子倒角 + 自动取景
import {fitDistance} from './framing';
import {createSceneMaterial} from './material';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildPrimitiveGeometry } from './geometry';
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
  private orbitTheta = 0.733; // 方位角
  private orbitPhi = 1.012; // 仰角（自 +Y 起算，限制不穿越极点）
  private readonly defaultMaterial: THREE.MeshStandardMaterial;
  private readonly sharedGeometryCache = new Map<string, THREE.BufferGeometry>();
  private readonly materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly nodeMap = new Map<string, NodeResources>();
  private selectionHelpers: THREE.BoxHelper[] = [];
  private rafHandle: number | null = null;
  private dirty = true;
  private lastSyncedDoc:SceneDocument|null=null;
  private readonly host: HTMLElement;
  private readonly onPick: (nodeId: string | null) => void;
  private resizeObserver: ResizeObserver | null = null;
  // 视口固有资源（不随场景文档重建）
  private envTexture: THREE.Texture | null = null;
  private backgroundTexture: THREE.CanvasTexture | null = null;
  private floorGeometry: THREE.PlaneGeometry | null = null;
  private floorMaterial: THREE.MeshStandardMaterial | null = null;
  private keyLight: THREE.DirectionalLight | null = null;

  // 世界单位：米。相机近远裁剪面按工业设备场景尺度设定。
  constructor(host: HTMLElement, onPick: (nodeId: string | null) => void) {
    this.host = host;
    this.onPick = onPick;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 方案 11 节：限制高 DPI 像素比
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // ACES 电影级色调映射：高光不截断、中间调更扎实，告别「塑料玩具」感
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';

    this.scene = new THREE.Scene();
    this.backgroundTexture = this.createGradientBackground();
    this.scene.background = new THREE.Color('#e8edef');
    // 线性雾：近处（8m）清晰、远处（60m）融进雾色，大地面不再「平到天边」
    this.scene.fog = null; // Modeling view: do not wash out machines as camera distance grows.

    // 窄视角（45°）：透视畸变更小，更接近观察工业设备的视觉
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 2000);
    this.updateOrbitCamera();

    this.defaultMaterial = new THREE.MeshStandardMaterial({
      color: '#A9AEB6',
      roughness: 0.45,
      metalness: 0.35,
    });

    this.setupEnvironment();
    this.setupLights();
    this.setupGround();
    this.setBackdrop('slate');
    this.setupPicking();

    this.resizeObserver = new ResizeObserver(() => this.markDirty());
    this.resizeObserver.observe(host);
  }

  // 垂直渐变背景：顶部深蓝灰、地平线偏暖，替代原来的纯色黑底
  private createGradientBackground(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#171b21');
    grad.addColorStop(0.55, '#232b34');
    grad.addColorStop(1, '#3a4551');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // 环境光照：RoomEnvironment 经 PMREM 预滤波后作为场景环境贴图
  // - scene.environment 自动给所有 PBR 材质提供柔和补光与真实反射
  // - 金属面不再「死平」，漆面有了漫反射层次
  private setupEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.envTexture = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity=.55;
    envScene.dispose();
    pmrem.dispose();
  }

  // 半球补光 + 主方向光（带阴影）+ 冷色轮廓光
  private setupLights(): void {
    const hemi = new THREE.HemisphereLight('#f5fcff', '#789095', .85);
    this.scene.add(hemi);

    // 暖白主光：模拟厂房高侧窗，投影方向稳定、边缘柔和
    const dir = new THREE.DirectionalLight('#fff5e4', 2.6);
    this.keyLight = dir;
    dir.position.set(-12, 24, 14);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 60;
    dir.shadow.camera.left = -14;
    dir.shadow.camera.right = 14;
    dir.shadow.camera.top = 14;
    dir.shadow.camera.bottom = -14;
    dir.shadow.bias = -0.0002;
    dir.shadow.normalBias = 0.003;
    this.scene.add(dir);

    // 冷色逆光：把物体轮廓从暗背景里剌出来
    const rim = new THREE.DirectionalLight('#b7d5ee', 1.0);
    rim.position.set(15, 13, -10);
    this.scene.add(rim);
  }

  // 地面：接收阴影的哑光地面 + 1m 网格（尺度参照）
  private setupGround(): void {
    this.floorGeometry = new THREE.PlaneGeometry(200, 200);
    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: '#e0e7e9',
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.4,
    });
    const floor = new THREE.Mesh(this.floorGeometry, this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = '__floor';
    this.scene.add(floor);

    const grid = new THREE.GridHelper(60, 60, '#a2b3ba', '#bdc9ce');
    grid.name='__grid';grid.visible=false;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    grid.position.y = 0.002; // 抬高 2mm 避免 Z-fighting
    grid.name = '__grid';
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

  // 自动取景：场景变化后计算包围盒，把整个模型框进视野中心
  // - 相机目标点 = 包围盒中心；半径按最长边与视野张角反推
  // - 阴影相机范围随场景缩放，大模型不会丢阴影
  private frameScene(selected?: Set<string>): void {
    if (this.nodeMap.size === 0) {
      // 空场景：相机回到默认观察机位（撤销到空场景时画面与初始空场景一致）
      this.orbitTarget.set(0, 0.5, 0);
      this.orbitRadius = 6.87;
      this.orbitTheta = 0.675;
      this.orbitPhi = 1.2;
      this.updateOrbitCamera();
      return;
    }
    const box = new THREE.Box3();
    for (const [, res] of this.nodeMap) {
      if(selected?.size && !selected.has(res.mesh.userData.nodeId))continue;
      res.mesh.updateWorldMatrix(true, false);
      box.expandByObject(res.mesh);
    }
    if (box.isEmpty()) return;
    if(!selected?.size){const floor=this.scene.getObjectByName('__floor');if(floor)floor.position.y=box.min.y-.02;}
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.4);
    this.orbitTarget.copy(center);

    const fov = (this.camera.fov * Math.PI) / 180;
    // 让最长边约占视野 55%，留出周边呼吸空间
    const aspect=Math.max(this.host.clientWidth,1)/Math.max(this.host.clientHeight,1);
    const radius = fitDistance(size.toArray() as [number,number,number],this.orbitTheta,this.orbitPhi,fov,aspect);
    this.orbitRadius = Math.min(Math.max(radius, 0.8), 1000);

    // 仰角太低（贴地看）时抬到默认观察角
    // Preserve explicit overhead or user-selected angles during fitting.
    this.updateOrbitCamera();

    // 阴影相机随包络缩放
    if (this.keyLight) {
      const s = Math.max(maxDim * 0.9, 6);
      const cam = this.keyLight.shadow.camera;
      cam.left = -s;
      cam.right = s;
      cam.top = s;
      cam.bottom = -s;
      cam.far = Math.max(s * 4 + 20, 60);
      this.keyLight.position.copy(center).add(new THREE.Vector3(-12,24,14));
      this.keyLight.target.position.copy(center);this.keyLight.target.updateMatrixWorld();
      cam.updateProjectionMatrix();
    }
  }

  // Incremental reconciliation: preserve unchanged mesh/geometry/material identities.
  sync(doc: SceneDocument): void {
    if(doc===this.lastSyncedDoc)return;
    const firstContent=this.nodeMap.size===0;this.clearSelectionHelpers();
    const visible=new Set(doc.nodes.filter(n=>n.visible&&n.kind==='primitive'&&n.geometry).map(n=>n.id));
    for(const [id,res] of this.nodeMap)if(!visible.has(id)){this.scene.remove(res.mesh);this.nodeMap.delete(id);}
    for(const node of doc.nodes){
      if(!visible.has(node.id))continue;
      const existing=this.nodeMap.get(node.id);
      if(!existing){this.createNodeMesh(node,doc);continue;}
      const geometry=this.buildGeometry(node.geometry!),material=this.buildMaterial(node.materialId,doc,node.label);
      existing.geometry=geometry;existing.material=material;existing.mesh.geometry=geometry;existing.mesh.material=material;
      existing.mesh.position.fromArray(node.transform.position);existing.mesh.quaternion.fromArray(node.transform.rotationQuaternion);existing.mesh.scale.fromArray(node.transform.scale);
      existing.mesh.name=node.name;existing.mesh.castShadow=material.opacity>=.95&&!node.label;
    }
    const geometries=new Set([...this.nodeMap.values()].map(v=>v.geometry)),materials=new Set([...this.nodeMap.values()].map(v=>v.material));
    for(const [key,g] of this.sharedGeometryCache)if(!geometries.has(g)){g.dispose();this.sharedGeometryCache.delete(key);}
    for(const [key,m] of this.materialCache)if(!materials.has(m)){m.map?.dispose();m.dispose();this.materialCache.delete(key);}
    this.lastSyncedDoc=doc;
    if(firstContent||!this.nodeMap.size)this.frameScene();
    this.markDirty();
  }

  private createNodeMesh(node: SceneNode, doc: SceneDocument): void {
    const geometry = this.buildGeometry(node.geometry!);
    const material = this.buildMaterial(node.materialId, doc, node.label);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = material.opacity >= 0.95 && !node.label;
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
    const geometry = buildPrimitiveGeometry(g);
    this.sharedGeometryCache.set(key, geometry);
    return geometry;
  }

  private buildMaterial(materialId: string | undefined, doc: SceneDocument, label?:string): THREE.MeshStandardMaterial {
    if (!materialId) return this.defaultMaterial;
    const found = doc.materials.find((m) => m.id === materialId);
    if (!found) return this.defaultMaterial;
    return this.getOrCreateMaterial(found,label);
  }

  private getOrCreateMaterial(m: Material,label?:string): THREE.MeshStandardMaterial {
    const key = JSON.stringify(m)+(label??'');
    const cached = this.materialCache.get(key);
    if (cached) return cached;
    const mat = createSceneMaterial(m,label);
    this.materialCache.set(key, mat);
    return mat;
  }

  // 选择高亮：视口选中状态是从文档派生的运行时状态，不写入项目主文档
  setSelection(selectedIds: Set<string>): void {
    this.clearSelectionHelpers();
    for (const id of selectedIds) {
      const node = this.nodeMap.get(id);
      if (!node) continue;
      const helper = new THREE.BoxHelper(node.mesh, '#65a8ff');
      this.scene.add(helper); this.selectionHelpers.push(helper);
    }
    this.markDirty();
  }

  private clearSelectionHelpers(): void {
    for (const helper of this.selectionHelpers) {
      this.scene.remove(helper); helper.geometry.dispose(); helper.material.dispose();
    }
    this.selectionHelpers = [];
  }

  captureDocument(doc: SceneDocument, view: 'perspective' | 'front' | 'side' | 'top', targetIds?:string[]): string {
    if(this.renderer.getContext().isContextLost())throw new Error('WebGL 上下文丢失，无法截图');
    if(this.host.clientWidth<=0 || this.host.clientHeight<=0)throw new Error('视口不可见，无法截图');
    this.sync(doc);
    const saved = {target:this.orbitTarget.clone(),radius:this.orbitRadius,theta:this.orbitTheta,phi:this.orbitPhi};
    const helpers = [...this.scene.children].filter(o => o.type === 'BoxHelper');
    try {
      helpers.forEach(h=>h.visible=false);
      const angles = {perspective:[0.7,1.05],front:[0,Math.PI/2],side:[Math.PI/2,Math.PI/2],top:[0,0.01]};
      [this.orbitTheta,this.orbitPhi] = angles[view];
      this.frameScene(targetIds?.length?new Set(targetIds):undefined);
      this.updateOrbitCamera(); this.markDirty(); this.render();
      const source=this.renderer.domElement;
      const scale=Math.min(1,1024/Math.max(source.width,source.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('无法读取视口截图');
      context.drawImage(source,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',0.85);
      if(!data.startsWith('data:image/jpeg;base64,')) throw new Error('截图无效');
      return data;
    } finally {
      helpers.forEach(h=>h.visible=true);
      this.orbitTarget.copy(saved.target);this.orbitRadius=saved.radius;this.orbitTheta=saved.theta;this.orbitPhi=saved.phi;
      this.updateOrbitCamera();this.markDirty();
    }
  }

  setBackdrop(mode:'light'|'slate'):void {this.scene.background=new THREE.Color(mode==='slate'?'#465b69':'#e8edef');this.floorMaterial?.color.set(mode==='slate'?'#536a77':'#e0e7e9');this.markDirty();}

  setGridVisible(visible:boolean):void {const grid=this.scene.getObjectByName('__grid');if(grid)grid.visible=visible;this.markDirty();}
  topView():void {this.orbitPhi=.02;this.orbitTheta=0;this.frameScene();this.updateOrbitCamera();this.markDirty();}
  presentationView():void {this.orbitTheta=.733;this.orbitPhi=1.012;this.frameScene();this.markDirty();}
  fitToSelection(ids: string[]): void {if(ids.length){this.frameScene(new Set(ids));this.markDirty();}}

  fitToScene(): void { this.frameScene(); this.markDirty(); }

  private disposeAllNodes(): void {
    this.clearSelectionHelpers();
    for (const [, res] of this.nodeMap) {
      this.scene.remove(res.mesh);
    }
    this.nodeMap.clear();
    // 共享 geometry/material 缓解跨节点复用；文档级重建时一并清理
    for (const [, geo] of this.sharedGeometryCache) geo.dispose();
    for (const [, mat] of this.materialCache) {mat.map?.dispose();mat.dispose();}
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
    this.envTexture?.dispose();
    this.backgroundTexture?.dispose();
    this.floorGeometry?.dispose();
    this.floorMaterial?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.host) {
      this.host.removeChild(this.renderer.domElement);
    }
  }
}
