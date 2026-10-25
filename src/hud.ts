import * as THREE from 'three';
import type { FirstRun } from './model';
import type { TouchInput, Button } from './input';
import { normalizeSafeArea, type DouyinPlatform } from './platform';
import { ATTACKS } from './core/run-build';

export class HUD {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  buttons: Button[] = [];
  width = 960;
  height = 540;
  left = 18;
  right = 942;
  private context: CanvasRenderingContext2D;
  constructor(private platform: DouyinPlatform) {
    this.canvas = platform.createCanvas();
    this.context = this.canvas.getContext('2d')!;
    if (!this.context) throw new Error('无法创建界面画布');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.position.z = -1; this.scene.add(mesh);
    this.resize();
  }
  resize() {
    const { windowWidth: w, windowHeight: h } = this.platform.info;
    const safeArea = normalizeSafeArea(this.platform.info);
    this.height = Math.round(960 * h / w);
    this.canvas.width = 960; this.canvas.height = this.height;
    this.left = Math.max(18, (safeArea?.left ?? 0) * 960 / w + 12);
    this.right = Math.min(942, (safeArea?.right ?? w) * 960 / w - 12);
  }
  private rect(x: number, y: number, w: number, h: number, color: string) {
    const c = this.context; c.fillStyle = color; c.fillRect(x, y, w, h);
  }
  private text(value: string, x: number, y: number, size = 20, color = '#fff8df', align: CanvasTextAlign = 'left') {
    const c = this.context; c.font = `${size >= 28 ? 'bold ' : ''}${size}px sans-serif`; c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(value, x, y);
  }
  private button(action: string, label: string, x: number, y: number, w: number, h = 48, color = '#f4b55b') {
    this.rect(x, y + 4, w, h, '#102c28'); this.rect(x, y, w, h, color);
    this.text(label, x + w / 2, y + h / 2, 20, '#183b32', 'center');
    this.buttons.push({ action, x, y, w, h });
  }
  private begin() { this.context.clearRect(0, 0, 960, this.height); this.buttons = []; }
  private finish() { this.texture.needsUpdate = true; }
  boot(percent: number, error?: string) {
    this.begin(); this.rect(0, 0, 960, this.height, '#143e36');
    this.text('幻兽幸存者', 480, this.height * .32, 46, '#fff0b8', 'center');
    this.text(error ? '资源准备遇到问题' : '正在准备草甸冒险', 480, this.height * .51, 22, '#b9d4b0', 'center');
    this.rect(280, this.height * .61, 400, 8, '#365b4a'); this.rect(280, this.height * .61, 4 * percent, 8, '#f2bd67');
    if (error) {
      this.text(error.slice(0, 52), 480, this.height * .70, 16, '#ffd5a5', 'center');
      this.button('retry', '重新加载', 390, this.height * .79, 180);
    } else this.text(`${Math.round(percent)}%`, 480, this.height * .70, 18, '#d1dfc4', 'center');
    this.finish();
  }
  draw(model: FirstRun, input: TouchInput, music: boolean, best: number, background?: HTMLImageElement) {
    this.begin();
    const h = this.height, c = this.context, state = model.combat;
    if (model.mode === 'menu') {
      if (background) {
        const scale = Math.max(960 / background.width, h / background.height);
        c.drawImage(background, (960 - background.width * scale) / 2, (h - background.height * scale) / 2, background.width * scale, background.height * scale);
      }
      this.rect(0, 0, 960, h, 'rgba(8,35,28,.55)');
      this.text('幻兽幸存者', 480, h * .29, 54, '#fff0be', 'center');
      this.text('草甸 · 焰绒的初次冒险', 480, h * .42, 24, '#e2e8bb', 'center');
      this.button('start', '六波闯关', 370, h * .53, 220, 50);
      this.button('trial', '三分钟练习', 370, h * .53 + 62, 220, 40, '#bed1a7');
      this.text('左手移动 · 自动攻击 · 右手冲刺', 480, h * .84, 17, '#e5edcf', 'center');
      this.text('闯关：第五波休整，第六波击败荆冠兽王', 480, h * .90, 15, '#c4d8be', 'center');
      this.button('music', music ? '音乐：开' : '音乐：关', this.left, h - 60, 126, 40, '#bed1a7');
      this.text(`最高击败 ${best}`, this.right, h - 40, 16, '#d8e1c3', 'right');
    } else {
      this.rect(this.left, 14, 300, 76, 'rgba(14,43,35,.88)');
      this.text('焰绒', this.left + 14, 35, 21, '#fff0b8');
      this.text(`Lv.${state.progression.level}    击败 ${state.kills}`, this.left + 100, 35, 17);
      this.rect(this.left + 14, 56, 270, 11, '#574d3b');
      this.rect(this.left + 14, 56, 270 * Math.max(0, state.hp / state.maxHp), 11, '#b4d977');
      this.rect(this.left + 14, 74, 270, 4, '#304c49');
      this.rect(this.left + 14, 74, Number.isFinite(state.progression.threshold) ? 270 * state.progression.experience / state.progression.threshold : 270, 4, '#8ddad2');
      this.text(`${Math.ceil(state.hp)} / ${state.maxHp}`, this.left + 284, 60, 11, '#172f25', 'right');
      this.rect(402, 16, 156, 54, 'rgba(14,43,35,.88)');
      const seconds = Math.ceil(model.remaining);
      this.text(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, 480, 37, 26, '#ffe5a7', 'center');
      this.text(`${model.run ? '闯关' : '练习'} ${model.stage} / ${model.run ? 6 : 3}`, 480, 60, 12, '#c7dbb4', 'center');
      if (model.run) {
        this.text(`金币 ${model.run.coins}`, this.right, 124, 17, '#fff0b8', 'right');
        const boss = state.encounters.boss;
        if (boss?.active) {
          this.rect(330, 92, 300, 9, '#443837');
          this.rect(330, 92, 300 * Math.max(0, boss.hp / (boss.maxHp ?? 6000)), 9, '#e3a375');
          this.text(`${state.encounters.bossName}${state.encounters.enraged ? ' · 狂暴' : ''}`, 480, 118, 16, '#fff0b8', 'center');
        }
      }
      if (model.mode === 'playing') {
        // Keep the native menu capsule at the top right unobstructed.
        this.button('pause', '暂停', this.right - 88, 148, 88, 40, '#d3d9b6');
        this.button('dash', model.dashCooldown > 0 ? `冲刺 ${model.dashCooldown.toFixed(1)}` : '冲刺', this.right - 122, h - 94, 112, 64, '#f2c078');
        const joy = input.joystick;
        const x = joy?.x ?? this.left + 92, y = joy?.y ?? h - 104;
        c.beginPath(); c.arc(x, y, 54, 0, Math.PI * 2); c.fillStyle = 'rgba(234,242,203,.19)'; c.fill();
        c.beginPath(); c.arc(x + (joy?.dx ?? 0), y + (joy?.dy ?? 0), 23, 0, Math.PI * 2); c.fillStyle = 'rgba(241,233,178,.66)'; c.fill();
        if (model.elapsed < 8) this.text(model.run ? '自动火焰横扫 · 拾取经验强化 · 留意红色预警' : '拖动左侧屏幕移动，火花弹会自动锁敌', 480, h - 30, 16, '#f7edc4', 'center');
        if (model.run) this.text(state.runBuild.attacks.map(a => `${ATTACKS[a.attackId].title} ${a.level}`).join(' / '), 480, h - 58, 14, '#e5ebc5', 'center');
        if (state.encounters.barrage.running) this.text(state.encounters.barrage.dodgeHint, 480, h - 30, 16, '#fff0b8', 'center');
        const reward = state.treasureRewards.find(item => item.active && item.age < 4);
        if (reward) this.text(`携宝兽掉落：${reward.items.map(item => item.title).join('、')}`.slice(0, 46), 480, 146, 15, '#ffe6a8', 'center');
      } else {
        this.rect(0, 0, 960, h, 'rgba(7,27,24,.78)');
        if (model.mode === 'preparing') {
          this.text(model.preparationFailed ? '技能准备遇到问题' : '正在准备技能', 480, h * .37, 30, '#ffe6a8', 'center');
          this.text('战斗已暂停，技能准备完成后继续', 480, h * .49, 18, '#dce7c8', 'center');
          if (model.preparationFailed) this.button('skill-retry', '重新准备', 370, h * .60, 220, 46);
          this.button('skill-cancel', '取消准备', 370, h * .60 + (model.preparationFailed ? 58 : 0), 220, 42, '#bed1a7');
        } else if (model.mode === 'upgrade') {
          this.text('选择一项强化', 480, h * .18, 32, '#ffe6a8', 'center');
          const offers = state.progression.offers;
          const width = Math.min(244, (this.right - this.left - 52) / 3), gap = 18;
          const start = (960 - (width * offers.length + gap * (offers.length - 1))) / 2;
          const y = h * .29, cardHeight = Math.min(238, h * .55);
          offers.forEach((id, i) => {
            const skill = state.progression.skills.find(s => s.id === id)!;
            const x = start + i * (width + gap);
            this.rect(x, y, width, cardHeight, '#e8e7c7');
            this.rect(x, y, width, 6, skill.color);
            this.text(`强化 ${state.progression.ranks[id] + 1} / ${skill.maxRank}`, x + 18, y + 30, 15, '#67765b');
            this.text(skill.title, x + 18, y + 75, 24, '#234b3d');
            // Two short lines fit phone landscape without canvas text clipping.
            const words = [...skill.benefit], max = Math.max(8, Math.floor((width - 36) / 16));
            for (let line = 0; line < 3 && line * max < words.length; line++) this.text(words.slice(line * max, (line + 1) * max).join(''), x + 18, y + 115 + line * 24, 16, '#455a47');
            this.button(`choose:${id}`, '选择', x + 16, y + cardHeight - 56, width - 32, 40, '#d3ac68');
          });
          this.text('选择期间战斗暂停', 480, h * .91, 15, '#c9d9b8', 'center');
        } else if (model.mode === 'shop' && model.run?.shop) {
          const run = model.run, shop = run.shop!;
          this.text('第五波休整 · 行旅商店', 480, h * .15, 28, '#ffe6a8', 'center');
          this.text(`金币 ${run.coins}  ·  生命 ${Math.ceil(state.hp)} / ${state.maxHp}`, 480, h * .23, 17, '#dce7c8', 'center');
          const gap = 12, width = Math.min(186, (this.right - this.left - gap * 3) / 4);
          const start = (960 - (width * 4 + gap * 3)) / 2, y = h * .30, height = Math.min(220, h * .48);
          shop.items.forEach((item, i) => {
            const x = start + i * (width + gap);
            this.rect(x, y, width, height, item.sold ? '#9fae97' : '#e8e7c7');
            this.text(item.title.slice(0, 9), x + 12, y + 28, 18, '#234b3d');
            const words = [...item.benefit], lineLength = Math.max(7, Math.floor((width - 24) / 14));
            for (let line = 0; line < 3 && line * lineLength < words.length; line++) this.text(words.slice(line * lineLength, (line + 1) * lineLength).join(''), x + 12, y + 61 + line * 20, 14, '#455a47');
            const canBuy = shop.canBuy(i, run.coins);
            if (canBuy) this.button(`buy:${i}:${shop.token}`, `${item.price} 金币`, x + 10, y + height - 48, width - 20, 36);
            else this.text(item.sold ? '已购买' : item.kind === 'empty' ? '暂无商品' : run.coins < item.price ? `${item.price} 金币 · 不足` : '暂不可购买', x + width / 2, y + height - 28, 14, '#455a47', 'center');
          });
          this.button(`refresh:${shop.token}`, `刷新 ${shop.refreshCost} 金币`, 250, h * .84, 200, 42, '#bed1a7');
          this.button(`next:${shop.token}`, '迎战荆冠兽王', 510, h * .84, 200, 42);
        } else if (model.mode === 'rest') {
          this.text('第五波完成', 480, h * .40, 34, '#ffe6a8', 'center');
          this.text(`休整 ${Math.ceil(model.run?.intermissionRemaining ?? 0)} 秒后进入商店`, 480, h * .55, 21, '#dce7c8', 'center');
        } else if (model.mode === 'paused') {
          this.text('冒险已暂停', 480, h * .24, 36, '#ffe6a8', 'center');
          this.button('resume', '继续冒险', 370, h * .40, 220);
          this.button('restart', '重新开始', 370, h * .40 + 62, 220, 46, '#bed1a7');
          this.button('menu', '返回营地', 370, h * .40 + 122, 220, 42, '#a7c5b0');
          this.button('music', music ? '音乐：开' : '音乐：关', this.left, h - 60, 126, 40, '#bed1a7');
        } else {
          this.text(model.victory ? '草甸挑战完成' : '冒险暂时结束', 480, h * .25, 38, '#ffe4a2', 'center');
          this.text(`存活 ${Math.floor(model.elapsed)} 秒   击败 ${state.kills}   等级 ${state.progression.level}`, 480, h * .42, 22, '#dce7c8', 'center');
          if (model.run) this.text(model.victory ? '荆冠兽王已击败，六波挑战完成' : model.run.failure === 'boss-timeout' ? 'Boss挑战超时' : '生命耗尽', 480, h * .48, 16, '#dce7c8', 'center');
          this.button('restart', '再来一次', 370, h * .55, 220);
          this.button('menu', '返回营地', 370, h * .55 + 62, 220, 42, '#bed1a7');
        }
      }
    }
    if (this.platform.info.windowHeight > this.platform.info.windowWidth) {
      this.rect(0, 0, 960, h, '#143e36'); this.buttons = [];
      this.text('请横屏游玩', 480, h / 2, 36, '#ffe4a2', 'center');
    }
    this.finish();
  }
}
