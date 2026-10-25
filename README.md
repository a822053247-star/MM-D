# 幻兽幸存者 · 抖音首局验证工程

独立目录：`E:\study\game\MM\douyin`。仅适配抖音小游戏，原项目不参与构建，也不需要启动原网页服务。

后续工作见[抖音小游戏迁移计划](docs/MIGRATION_PLAN.md)：真机验证、正式六波、完整构筑、无尽地区、捕捉囚坊和发布验收分阶段推进。

当前提供两个入口：**六波闯关基础版**和**三分钟练习**。六波版复用原波次导演、第五波商店、第六波荆冠兽王和胜败规则；焰绒起始火焰横扫，可学习火花弹、飞叶弹与基础强化。练习保留180秒生存及原有火花弹。

六波流程已接入，但M2仍在进行：地图仍为简化草甸；火焰横扫已使用压缩后的原三帧贴图主体，精英为几何占位，Boss使用基础待机图集，完整动作与美术仍待补齐。奖励池仅开放有对应表现的内容，暂不包含其他角色、完整武器库、融合、无尽、捕捉与囚坊。详细交付见[M2进度](docs/M2_PROGRESS.md)。游戏新名称尚未确认，暂未统一重命名。

特效资源采用[每份图集小于100 KB的像素方案](docs/vfx-compression/PIXEL_BUDGET.md)：冰环36,138字节、梦系53,277字节，保留全部帧；火焰约24.7 KiB已接入。原图在`art-source/vfx/`，候选在`resources/vfx-samples/`，推荐资源在`resources/vfx-ready/`；仅明确接入的图集进入发布包。

## 本地开发

使用 Node.js 22.18+（本机验证版本为 24.14.1）。

```powershell
cd E:\study\game\MM\douyin
npm ci
npm run verify
```

按用户最新要求，默认验证仅执行类型检查、生产构建与包体检查，不自动运行模拟器、浏览器或全量回归。`npm test`、`npm run check:campaign`和`npm run test:browser`保留为按需使用的工具。

`npm run preview` 构建测试预览并启动 <http://127.0.0.1:5188>。可用鼠标拖动左侧屏幕移动，点击右下冲刺；真实多指触控需要手机验证。该页面运行浏览器内的 `tt` API 模拟器，不能当作抖音开发者工具或真机验证结果。测试控制接口、模拟器、HTML 和测试资源均不进入正式 `dist`。

## 导入抖音开发者工具

1. `config/project.config.json` 已配置 AppID `tt29225f9fb75cc59502`。需要切换项目时可修改该文件，或在构建前设置环境变量：

   ```powershell
   $env:DOUYIN_APP_ID = '填写你的tt开头AppID'
   npm run build
   ```

2. 在抖音开发者工具中选择**小游戏**项目，导入本工程的 **`dist` 目录**，使用自己的 AppID。不要把整个源码目录当成上传目录。
3. 预览并确认 `first-play` 分包加载、中文文字、角色/敌人动画、音乐、双指摇杆/冲刺、三选一、切后台恢复与重开。
4. 后续由用户按需进行 Android/iPhone 扫码体验。已在本机抖音开发者工具成功编译并进入游戏，尚未完成手机真机或上线验证；之后不自动执行模拟器测试。

`npm run prepare:release` 检查 AppID 和本地体积；AppID 留空时会明确失败，不会把缺少项目标识的包误报为可发布。这个命令不上传、不提交审核。正式上架的账号能力与接入要求，需另按抖音后台完成。

## 包体预算

| 项目 | 预算 | 首次测量 |
|---|---:|---:|
| 主包 | ≤3 MiB | 约0.868 MiB |
| 首局总下载内容：主包 + first-play | 5–10 MiB | 约7.965 MiB |

`docs/size-report.json` 是每次生产构建生成的实际文件清单，以最新报告为准。`npm run check:size` 可单独检查。超过主包3 MiB或首局10 MiB会直接阻止构建成功。5 MiB是目标区间下界，不通过填充无用文件凑体积。

计量方式为**未压缩的产物字节数**，包含配置、许可证与分包入口；不是 gzip 体积，也不是抖音 IDE 最终计量。十二项资源包括焰绒两张动画、六类敌人朝向图集、Boss待机图集、营地背景、草甸音乐和火焰三帧运行图集。不复制原项目的完整`public`、模型、源切片或完整卡图仓库。

当前首局无需自建 CDN 或服务器：启动通过 `tt.loadSubpackage` 加载 `first-play`，完成图片解码后开放菜单。下载/图片失败时显示重试，避免进入贴图不完整的对局。

## 工程结构

```text
src/main.ts          加载、固定步长、生命周期、流程与存档
src/platform.ts      抖音 API 入口；只创建一个上屏 Canvas
src/model.ts         首局调度与移动；调用原 Combat/Progression
src/input.ts         触点归属、多指操作、取消与跨弹窗误触保护
src/hud.ts           离屏 Canvas UI，通过 WebGL 合成到同一屏幕
src/view.ts          Three.js 场景、动画、实例化敌人与投射物
src/audio.ts         tt.createInnerAudioContext 背景音乐
src/campaign-view.ts 六波敌人、横扫、Boss与危险预警的基础呈现
src/core/            原项目62份源码快照及记录在M2进度中的兼容改动
resources/first-play 十二项发布资源
scripts/compress-vfx.py 特效帧提取、裁边、编码候选、偏移与质量报告
config/              抖音 game.json 与项目配置
scripts/build.mjs    单文件 IIFE 构建、分包复制、体积和浏览器 API 检查
scripts/three-douyin.mjs Three.js 原生工厂适配，版本固定
docs/                来源哈希、体积报告、测试结果与截图
dist/                可导入抖音开发者工具的正式产物
```

Three.js 继续使用 `0.186.1`，要求 WebGL 2。打包时将引擎的 Canvas/Image 工厂转换为 `tt` API，移除网页专用开发者登记和浏览器特性探测；不全局伪造 `window`、`document`。工厂补丁与固定版本绑定，升级依赖前须审查；输出若出现 `document`、`window`、`fetch`、浏览器 Worker或动态 import，则构建失败。

## 已验证与待验证

- 类型检查、生产构建与包体预算通过。初始验证版曾通过8项模型/触控/资源/体积测试；它们不代表后续全部功能已回归。
- Chromium WebGL 2 中的 `tt` 模拟：加载、移动、双指冲刺、后台暂停、升级冻结/选择、横竖屏、重开、记录持久化、失败重试。
- 额外在没有 `window`/`document` 的 Worker 中用原生 Canvas 类对象启动场景与战斗，检查是否意外依赖浏览器全局。
- 生产构建不包含测试控制接口。截图与详细结果见 `docs/screenshots/`、`docs/browser-verification.json`。
- 六波关键路径已通过一次确定性快进检查：波次边界、商店购买与旧凭据拒绝、Boss进入/自动横扫击败/通关、重开与超时失败。记录在`docs/campaign-check.json`，不代表自然完整对局。
- **尚未验证**：完整六波的自然对局、手机WebGL 2/真实触控/音乐/后台恢复、设备内存与持续性能。模拟与快进检查不能替代真机体验。

原资源保持未修改，来源路径和 SHA-256 记录在 `docs/source-snapshot.json`；衍生特效记录在`docs/vfx-compression/report.json`，运行图集哈希由构建器校验。依赖许可证保留在 `THIRD_PARTY_LICENSES.txt` 并随包发布。`scripts/import-source.mjs` 是一次性快照工具，仅在明确需要更新原代码快照时手动运行，普通构建不会调用它。

抖音官方参考：[开发指南](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/dev-guide/bytedance-mini-game)、[小游戏配置](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/framework/mini-game-configuration)、[分包加载](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/subpackages/basic)、[代码包限制](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/subpackages/introduction)。
"# MM-D" 
