import * as THREE from 'three';
import { ASSETS, assetPath } from './assets';
import { CreatureAnimator, clipFrame } from './core/creature-animation';
import { enemyFacing, ENEMY_DIRECTION_FRAMES } from './core/enemy-directions';
import { COMBAT_LIMITS, type Projectile } from './core/combat';
import { ARENA_HALF_EXTENT } from './core/arena-boundary';
import { OBSTACLES, type FirstRun } from './model';
import type { DouyinPlatform } from './platform';
import type { HUD } from './hud';
import { CampaignView } from './campaign-view';
import { SkillVfx } from './skill-vfx';
import { EffectAssets } from './assets/effect-assets';
import { ProjectileVfx } from './projectile-vfx';
import type { ProjectileDetail } from './content/projectile-recipes';
import { WaterVfx } from './water-vfx';
import { ThunderVfx } from './thunder-vfx';
import { FrostVfx } from './frost-vfx';
import { BladeVfx } from './blade-vfx';
import { PositionVfx } from './position-vfx';
import { AreaAttackVfx } from './area-attack-vfx';
import { DreamVfx } from './dream-vfx';
type VisibleEnemyKind = 'normal' | 'fast' | 'tank' | 'draft-crystal-swarm' | 'draft-spore-bomber' | 'draft-treasure-runner';

function texture(image: HTMLImageElement) {
  const result = new THREE.Texture(image);
  result.colorSpace = THREE.SRGBColorSpace;
  result.magFilter = result.minFilter = THREE.NearestFilter;
  result.generateMipmaps = false; result.needsUpdate = true;
  return result;
}

class EnemyBatch {
  readonly mesh: THREE.InstancedMesh;
  private frames: THREE.InstancedBufferAttribute;
  private pose = new THREE.Object3D();
  private color = new THREE.Color();
  private facings = new Map<number, ReturnType<typeof enemyFacing>>();
  constructor(image: HTMLImageElement) {
    const geometry = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);
    this.frames = new THREE.InstancedBufferAttribute(new Float32Array(COMBAT_LIMITS.enemies * 2), 2);
    this.frames.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('atlasFrame', this.frames);
    const material = new THREE.MeshBasicMaterial({ map: texture(image), alphaTest: .12, side: THREE.DoubleSide, toneMapped: false });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute vec2 atlasFrame;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv.x = (atlasFrame.y > 0.5 ? 1.0 - uv.x : uv.x) / 5.0 + atlasFrame.x / 5.0;
        #endif`);
    };
    material.customProgramCacheKey = () => 'douyin-enemy-5-directions-v1';
    this.mesh = new THREE.InstancedMesh(geometry, material, COMBAT_LIMITS.enemies);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0;
  }
  update(model: FirstRun, kind: VisibleEnemyKind, camera: THREE.Camera) {
    const seen = new Set<number>(); let count = 0;
    for (const enemy of model.combat.enemies) {
      if (!enemy.active || enemy.rank || enemy.kind !== kind) continue;
      seen.add(enemy.id);
      const facing = enemyFacing(enemy.x - enemy.previousX, enemy.z - enemy.previousZ, { rightX: 1, rightZ: 0, upX: 0, upZ: -.7 }, this.facings.get(enemy.id));
      this.facings.set(enemy.id, facing);
      const [frame, mirror] = ENEMY_DIRECTION_FRAMES[facing];
      const height = kind === 'tank' ? 2.8 : kind === 'fast' ? 1.8 : kind === 'draft-crystal-swarm' ? 1.4 : 2.1;
      this.pose.position.set(enemy.x, .03 + Math.abs(Math.sin(enemy.age * 7)) * .07, enemy.z);
      this.pose.quaternion.copy(camera.quaternion); this.pose.scale.set(height, height, 1); this.pose.updateMatrix();
      this.mesh.setMatrixAt(count, this.pose.matrix);
      this.color.set(enemy.flash > 0 ? '#fff3d2' : enemy.age < enemy.spawnTime ? '#a4b58c'
        : (enemy.freezeTime ?? 0) > 0 ? '#a9e3ff' : '#ffffff');
      this.mesh.setColorAt(count, this.color); this.frames.setXY(count, frame, mirror); count++;
    }
    this.mesh.count = count; this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.frames.needsUpdate = true;
    for (const id of this.facings.keys()) if (!seen.has(id)) this.facings.delete(id);
  }
}

export class GameView {
  readonly effectAssets: EffectAssets;
  readonly projectileVfx: ProjectileVfx;
  readonly waterVfx: WaterVfx;
  readonly thunderVfx: ThunderVfx;
  readonly frostVfx: FrostVfx;
  readonly bladeVfx: BladeVfx;
  readonly positionVfx: PositionVfx;
  readonly areaAttackVfx: AreaAttackVfx;
  readonly dreamVfx: DreamVfx;
  readonly skillVfx: SkillVfx;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-18, 18, 10, -10, .1, 130);
  readonly animator = new CreatureAnimator('yanrong');
  private hero?: THREE.Sprite;
  private walk?: THREE.Texture;
  private diagonal?: THREE.Texture;
  private enemies?: Record<VisibleEnemyKind, EnemyBatch>;
  private campaign: CampaignView;
  private pose = new THREE.Object3D();
  private bolts = this.pool(new THREE.SphereGeometry(.16, 6, 4), '#ffd16b', COMBAT_LIMITS.projectiles);
  private boltColor = new THREE.Color();
  private gems = this.pool(new THREE.OctahedronGeometry(.16, 0), '#98ecad', COMBAT_LIMITS.orbs);
  private sparks = this.pool(new THREE.SphereGeometry(.08, 4, 3), '#fff1ad', COMBAT_LIMITS.effects);
  private orbits = this.pool(new THREE.SphereGeometry(.27, 8, 6), '#9eeaf0', 3);
  private waves = this.pool(new THREE.RingGeometry(.95, 1, 48), '#a5e9de', COMBAT_LIMITS.shockwaves);
  private heroShadow = new THREE.Mesh(new THREE.CircleGeometry(.7, 20), new THREE.MeshBasicMaterial({ color: '#1a3a29', transparent: true, opacity: .3, depthWrite: false }));
  constructor(private platform: DouyinPlatform) {
    const canvas = platform.canvas;
    // Three.js requires an event target even though tt delivers touch/lifecycle separately.
    canvas.addEventListener ??= () => {};
    canvas.removeEventListener ??= () => {};
    canvas.setAttribute ??= () => {};
    const context = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true, stencil: false }) as WebGL2RenderingContext | null;
    if (!context) throw new Error('当前设备无法创建 WebGL 2 场景，请更新抖音后重试');
    this.renderer = new THREE.WebGLRenderer({ canvas, context, alpha: false, antialias: false });
    this.effectAssets = new EffectAssets(platform, texture => {
      if (this.renderer.getContext().isContextLost()) throw new Error('画面上下文已中断');
      this.renderer.initTexture(texture);
    });
    this.skillVfx = new SkillVfx(this.effectAssets);
    this.projectileVfx = new ProjectileVfx(this.effectAssets);
    this.waterVfx = new WaterVfx();
    this.thunderVfx = new ThunderVfx();
    this.frostVfx = new FrostVfx();
    this.bladeVfx = new BladeVfx();
    this.positionVfx = new PositionVfx();
    this.areaAttackVfx = new AreaAttackVfx();
    this.dreamVfx = new DreamVfx(this.effectAssets);
    this.setEffectDetail(platform.read<unknown>('mm-douyin-effect-detail', 'full') === 'reduced' ? 'reduced' : 'full');
    this.campaign = new CampaignView(this.effectAssets);
    this.renderer.autoClear = false; this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.scene.background = new THREE.Color('#82a06b');
    this.scene.fog = new THREE.Fog('#c4d0a0', 50, 105);
    this.scene.add(new THREE.HemisphereLight('#fff3ce', '#4b744b', 2.2));
    const light = new THREE.DirectionalLight('#fff5d7', 2); light.position.set(-8, 18, 10); this.scene.add(light);
    const groundCanvas = platform.createCanvas(); groundCanvas.width = groundCanvas.height = 128;
    const c = groundCanvas.getContext('2d')!;
    c.fillStyle = '#83a474'; c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 220; i++) {
      const x = (i * 73) % 128, y = (i * 47) % 128;
      c.fillStyle = ['#95af7d', '#729768', '#9bb780'][i % 3]; c.fillRect(x, y, 2, 3);
    }
    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    groundTexture.colorSpace = THREE.SRGBColorSpace; groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(28, 28); groundTexture.magFilter = THREE.NearestFilter;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshLambertMaterial({ map: groundTexture }));
    ground.rotation.x = -Math.PI / 2; this.scene.add(ground);
    const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-ARENA_HALF_EXTENT, .04, -ARENA_HALF_EXTENT), new THREE.Vector3(ARENA_HALF_EXTENT, .04, -ARENA_HALF_EXTENT),
      new THREE.Vector3(ARENA_HALF_EXTENT, .04, ARENA_HALF_EXTENT), new THREE.Vector3(-ARENA_HALF_EXTENT, .04, ARENA_HALF_EXTENT),
    ]), new THREE.LineBasicMaterial({ color: '#e2cf8a' })); this.scene.add(border);
    const trunkGeometry = new THREE.CylinderGeometry(.24, .4, 2, 6), canopyGeometry = new THREE.IcosahedronGeometry(1.7, 0);
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: '#80644a' }), leafMaterial = new THREE.MeshLambertMaterial({ color: '#527c53' });
    for (const obstacle of OBSTACLES) {
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial), canopy = new THREE.Mesh(canopyGeometry, leafMaterial);
      trunk.position.set(obstacle.x, 1, obstacle.z); canopy.position.set(obstacle.x, 3, obstacle.z);
      canopy.scale.set(1, .85, 1); this.scene.add(trunk, canopy);
    }
    this.heroShadow.rotation.x = -Math.PI / 2; this.heroShadow.position.y = .025; this.scene.add(this.heroShadow);
    this.scene.add(this.campaign.group);
    this.scene.add(this.skillVfx.group);
    this.scene.add(this.projectileVfx.group);
    this.scene.add(this.waterVfx.group);
    this.scene.add(this.thunderVfx.group);
    this.scene.add(this.frostVfx.group);
    this.scene.add(this.bladeVfx.group);
    this.scene.add(this.positionVfx.group);
    this.scene.add(this.areaAttackVfx.group);
    this.scene.add(this.dreamVfx.group);
    this.resize();
  }
  private pool(geometry: THREE.BufferGeometry, color: string, size: number) {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }), size);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false;
    this.scene.add(mesh); return mesh;
  }
  async loadImages() {
    this.effectAssets.setReferences('startup', ['flame-sweep-weapon']);
    const [[walk, diagonal, normal, fast, tank, menu, crystal, spore, treasure, boss]] = await Promise.all([
      Promise.all([ASSETS.walk, ASSETS.diagonal, ASSETS.normal, ASSETS.fast, ASSETS.tank, ASSETS.menu,
        ASSETS.crystal, ASSETS.spore, ASSETS.treasure, ASSETS.boss].map(file => this.platform.image(assetPath(file)))),
      this.effectAssets.prepare(['flame-sweep-weapon']),
    ]);
    this.walk = texture(walk); this.diagonal = texture(diagonal);
    const material = new THREE.SpriteMaterial({ map: this.walk, alphaTest: .12, transparent: true, depthWrite: false, toneMapped: false });
    this.hero = new THREE.Sprite(material); this.hero.center.set(.5, 1 - 240 / 256);
    this.hero.scale.set(3.45, 2.3, 1); this.scene.add(this.hero);
    this.enemies = { normal: new EnemyBatch(normal), fast: new EnemyBatch(fast), tank: new EnemyBatch(tank),
      'draft-crystal-swarm': new EnemyBatch(crystal), 'draft-spore-bomber': new EnemyBatch(spore), 'draft-treasure-runner': new EnemyBatch(treasure) };
    this.campaign.setBossImage(boss);
    for (const batch of Object.values(this.enemies)) this.scene.add(batch.mesh);
    this.effectAssets.setReferences('startup', []);
    return menu;
  }
  resize() {
    const info = this.platform.info;
    const ratio = Math.min(info.pixelRatio || 1, 1.5, Math.sqrt(1_300_000 / (info.windowWidth * info.windowHeight)));
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(info.windowWidth, info.windowHeight, false);
    const half = 10.5, aspect = info.windowWidth / info.windowHeight;
    this.camera.left = -half * aspect; this.camera.right = half * aspect; this.camera.top = half; this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }
  reset() {
    this.animator.reset(); this.projectileVfx.reset(); this.waterVfx.reset(); this.thunderVfx.reset(); this.frostVfx.reset();
    this.bladeVfx.reset();
    this.positionVfx.reset();
    this.areaAttackVfx.reset();
    this.dreamVfx.reset();
  }
  setEffectDetail(detail: ProjectileDetail) {
    this.projectileVfx.setDetail(detail); this.waterVfx.setDetail(detail); this.thunderVfx.setDetail(detail);
    this.frostVfx.setDetail(detail);
    this.bladeVfx.setDetail(detail);
    this.positionVfx.setDetail(detail);
    this.areaAttackVfx.setDetail(detail);
    this.dreamVfx.setDetail(detail);
  }
  sampleEffects(model: FirstRun) {
    this.projectileVfx.sample(model.combat); this.bladeVfx.sample(model.combat); this.areaAttackVfx.sample(model.combat);
  }
  update(model: FirstRun, dt: number) {
    const player = model.player, combat = model.combat;
    this.camera.position.set(player.x, 24, player.z + 28); this.camera.lookAt(player.x, 0, player.z); this.camera.updateMatrixWorld();
    if (this.hero && this.walk && this.diagonal) {
      this.animator.step(dt, model.velocity.x, model.velocity.z, { rightX: 1, rightZ: 0, upX: 0, upZ: -.7 });
      const clip = this.animator.clip, frame = clipFrame(clip, this.animator.time);
      const tex = clip.asset.endsWith('diagonal') ? this.diagonal : this.walk;
      const rows = (tex.image as HTMLImageElement).height / 256, col = frame % 4, row = Math.floor(frame / 4);
      tex.repeat.set((clip.mirror ? -1 : 1) / 4, 1 / rows);
      tex.offset.set((col + (clip.mirror ? 1 : 0)) / 4, 1 - (row + 1) / rows);
      this.hero.material.map = tex;
      this.hero.material.color.set(combat.hurtFlash > 0 ? '#ffb0a4' : '#ffffff');
      this.hero.position.set(player.x, .06, player.z); this.hero.visible = model.mode !== 'menu';
    }
    this.heroShadow.position.x = player.x; this.heroShadow.position.z = player.z;
    this.heroShadow.visible = model.mode !== 'menu';
    if (this.enemies) for (const kind of Object.keys(this.enemies) as VisibleEnemyKind[]) this.enemies[kind].update(model, kind, this.camera);
    const viewport = { x: player.x, z: player.z, halfWidth: this.camera.right, halfDepth: this.camera.top / Math.sin(Math.atan2(24, 28)) };
    combat.spawnViewport = viewport; combat.attackViewport = viewport;
    this.campaign.update(model, this.camera);
    this.skillVfx.update(model);
    this.projectileVfx.update(combat, model.mode !== 'menu');
    this.waterVfx.update(combat, !!model.run && model.mode !== 'menu');
    this.thunderVfx.update(combat, !!model.run && model.mode !== 'menu');
    this.frostVfx.update(combat, !!model.run && model.mode !== 'menu');
    this.bladeVfx.update(combat, !!model.run && model.mode !== 'menu');
    this.positionVfx.update(combat, !!model.run && model.mode !== 'menu');
    this.areaAttackVfx.update(combat, !!model.run && model.mode !== 'menu');
    this.dreamVfx.update(combat, !!model.run && model.mode !== 'menu');
    const fill = (mesh: THREE.InstancedMesh, items: readonly { active: boolean; x: number; z: number }[], height: number) => {
      let n = 0;
      for (const item of items) if (item.active && !(mesh === this.bolts && this.projectileVfx.owns(item as Projectile))) {
        this.pose.position.set(item.x, height, item.z); this.pose.rotation.set(0, 0, 0); this.pose.scale.setScalar(1); this.pose.updateMatrix(); mesh.setMatrixAt(n++, this.pose.matrix);
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    };
    fill(this.bolts, combat.projectiles, .8); fill(this.gems, combat.orbs, .22); fill(this.sparks, combat.effects, .6);
    let boltIndex = 0;
    for (const shot of combat.projectiles) if (shot.active && !this.projectileVfx.owns(shot)) this.bolts.setColorAt(boltIndex++, this.boltColor.set(shot.attackId === 'leaf' ? '#81d46d' : '#ffffff'));
    if (this.bolts.instanceColor) this.bolts.instanceColor.needsUpdate = true;
    this.orbits.count = combat.stats.orbitCount;
    for (let i = 0; i < this.orbits.count; i++) {
      const angle = combat.orbitAngle + i * Math.PI * 2 / this.orbits.count;
      this.pose.position.set(player.x + Math.cos(angle) * combat.stats.orbitRadius, .8, player.z + Math.sin(angle) * combat.stats.orbitRadius);
      this.pose.rotation.set(0, 0, 0); this.pose.scale.setScalar(1); this.pose.updateMatrix(); this.orbits.setMatrixAt(i, this.pose.matrix);
    }
    this.orbits.instanceMatrix.needsUpdate = true;
    let waveCount = 0;
    for (const wave of combat.shockwaves) if (wave.active) {
      this.pose.position.set(wave.x, .06, wave.z); this.pose.rotation.set(-Math.PI / 2, 0, 0); this.pose.scale.setScalar(Math.max(.01, wave.radius)); this.pose.updateMatrix(); this.waves.setMatrixAt(waveCount++, this.pose.matrix);
    }
    this.waves.count = waveCount; this.waves.instanceMatrix.needsUpdate = true;
  }
  render(hud: HUD) {
    this.renderer.info.reset();
    this.renderer.clear(); this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth(); this.renderer.render(hud.scene, hud.camera);
  }
}
