# 第一阶段：迁移现状与开发基线

记录日期：2026-10-26。目标是将原 MonsterBonk 正式玩法迁移并转变为抖音小游戏，六波版是中间交付，不是全部迁移的终点。

原项目：`D:\projects\MonsterBonk-Mobile`。开发项目：`D:\projects\MM\douyin\MM-D`。

本阶段已完成源码盘点、资源文件计量与下一阶段接入设计。按用户要求，未运行测试、类型检查、构建、浏览器、模拟器或真机验证；下文的行为描述来自静态阅读，不代表运行验收。本阶段不修改运行逻辑或重新导入原项目。

## 1. 可追溯基线

机器可读记录：[migration-baseline.json](migration-baseline.json)。包括两仓库 HEAD、任务开始时的工作区状态、全部 62 个 core 文件的双方 SHA-256、四张图集的文件大小、PNG 尺寸与 SHA-256。

- 两仓库开始时工作区均干净；原项目未改动。
- 62 个 core 文件中，54 个与原项目对应文件文本一致（忽略 CRLF/LF），6 个存在文本差异，2 个在当前原项目中不存在。
- 差异不等同于错误，也不假定目标工程只是旧快照；后续采用逐项合并，禁止整目录覆盖。
- 历史 [source-snapshot.json](source-snapshot.json) 保留原始导入记录，本次新增基线不覆盖它。

| 目标 core 文件 | 当前差异及后续处理 |
|---|---|
| `combat.ts` | 增加起始武器覆盖、彩色弹幕、武器置换、地区宝箱偏向等接入。保留现有适配，不能用原文件覆盖。 |
| `progression.ts` | 奖励白名单、彩色弹幕及置换等扩展。第二阶段只调整外部内容配置来源，保留核心资格判定。 |
| `run-build.ts` | 起始攻击参数、武器槽配置和置换等扩展。第二阶段不改构筑算法。 |
| `run-flow.ts` | 地区选择、武器槽配置和经济诊断等扩展。代码存在不表示小游戏入口已开放无尽。 |
| `shop.ts` | 无尽武器置换接口。当前第二阶段不扩展该入口。 |
| `content/content-types.ts` | 彩色弹幕内容 ID。不能据此开放对应奖励。 |
| `colored-barrage.ts`、`endless-regions.ts` | 当前原项目不存在同路径文件；作为目标工程已有实现保留，不反向写回原项目。 |

## 2. 当前运行链路

| 环节 | 实际入口 | 第二阶段改动边界 |
|---|---|---|
| 启动 | `main.ts: boot/load` → `DouyinPlatform.loadFirstPlay` → `GameView.loadImages` | 保留抖音本地分包路径，不引入 CDN 或浏览器 API。 |
| 正式与练习 | `model.ts: FirstRun.start/step` → `Combat` / `RunFlow` | 正式起始火焰横扫；练习走现有独立分支，不让内容注册改掉模式规则。 |
| 奖励支持范围 | `model.ts: CAMPAIGN_SKILLS` → `Progression.allowedSkills` | 将当前 14 项静态白名单派生自启用内容配置，不扩大名单。 |
| 升级/商店确认 | `main.ts: prepareSkillAction` → `SkillVfx.ready/prepare` → `model.choose/buy` | 资源模块负责准备，流程门禁负责确认与恢复，核心继续负责资格与授予。 |
| 宝箱补准备 | `main.ts: frame` 读取已有构筑，发现未准备技能后进入 `preparing` | 当前检查位于一帧模拟循环之后；第二阶段需要明确授予与下一次模拟的边界，避免新增技能先模拟后准备。 |
| 生命周期 | `main.ts: suspend`、`preparation` 版本、`preparationInterrupted` | 保留取消/重开失效和后台中断约束；异步完成不能擅自继续战斗。 |
| 绘制 | `GameView.update` → `CampaignView.update`、`SkillVfx.update` | 保留池数组读取、模拟年龄与固定容量，不引入每帧快照复制。 |

当前正式白名单：`damage`、`haste`、`multishot`、`vitality`、`movement`、`range`、`orbit`、`shockwave`、`spark-weapon`、`flame-sweep-weapon`、`leaf-weapon`、`shatter-ring`、`dream-dart-weapon`、`sakura-echo`。

## 3. 四张图集与资源所有权

| 图集 | 文件字节 | 尺寸 | RGBA 基础层估算字节 | 当前加载/使用 |
|---|---:|---|---:|---|
| `flame-sweep` | 25,286 | 396×132 | 209,088 | `GameView.loadImages` 启动加载，`CampaignView.setSweepImage` 创建纹理，扇形几何绘制。 |
| `ice-ring` | 36,138 | 588×392 | 921,984 | `SkillVfx.prepare` 按 `shatter-ring` 准备，冰环批次保留空心遮罩。 |
| `dream-dart` | 20,914 | 392×326 | 511,168 | `dream-dart-weapon` 准备，梦弹批次绘制。 |
| `dream-bloom` | 53,277 | 392×680 | 1,066,240 | `dream-dart-weapon` 与 `sakura-echo` 共享同一花瓣批次纹理。 |

四张实际 PNG 合计 135,615 字节；全部加载时 RGBA 基础层估算 2,708,480 字节（约 2.583 MiB），不包含解码副本、角色地图、缓冲和驱动开销，不是真机显存测量。

现有代码已经对 SkillVfx 的同图集请求去重，梦弹与回响也已共享花瓣纹理；问题在于火焰走另一条路径，缺少跨路径统一资源所有权、引用、预算和释放。不能把本来已有的共享计为本次新增收益。

纹理设置 `needsUpdate` 仅声明待上传；目前的 `loaded` 表示图片已加载且纹理已绑定，不能据此证明 GPU 上传完成。第二阶段需明确 downloaded / decoded / drawable 的状态含义，并在绘制就绪前完成必要纹理准备。

## 4. 包体和构建基线

以下来自已有 [size-report.json](size-report.json)，不是本次重新构建所得：

| 指标 | 历史字节 |
|---|---:|
| 主包 JS | 918,753 |
| 主包总量 | 920,233 |
| 首局（主包＋first-play） | 8,472,146 |

`npm run verify` 当前等于 `npm run build`，其中执行类型检查及 `scripts/build.mjs`；构建脚本还执行图集预算/哈希、包体和禁用浏览器 API 扫描。它不运行 `npm test` 或 `check:campaign`。当前按用户指令均不执行。

发布清单目前分散：`assets.ts` 引用火焰，`VFX_ATLASES` 描述火焰元数据，`PIXEL_VFX` 描述其余三张，`build.mjs` 复制整个 `resources/first-play` 并追加像素图集。`size-lib.mjs` 只计算固定 first-play 组合。当前没有保留模块分析报告，不能承诺统一注册表就能移除 Combat 静态导入的全部历史技能。

## 5. 第二阶段可直接执行的改动顺序

1. 新建 `src/content/enabled.ts` 与 `effect-recipes.ts`：统一现有正式资格、稳定 ID、四张图集依赖和表现状态。复用生成图集元数据，不手改生成清单；规则/表现接入与用户验收分别记录。
2. 新建 `src/assets/effect-assets.ts`：实现 prepare/ready/release/inspect，内部去重解码与纹理、失败可重试、活跃引用不可回收。预加载候选与装备引用分开，连续 prepare 不重复增加引用；纹理 dispose 只由该模块负责。
3. 从 `skill-vfx.ts` 提取 `src/render/vfx/atlas-batch.ts`：保留 begin/put/finish、原容量、帧 UV、冰环/花瓣/梦弹 Shader 差异。批次借用纹理，不负责销毁共享纹理。
4. 将 `CampaignView.setSweepImage` 改为接收统一准备的纹理，保留扇形几何及 25/45/160 ms 帧时序。火焰目前直接改变纹理 repeat/offset；统一缓存后应将帧 UV 放到绘制端，避免修改共享纹理状态。
5. 将 `main.ts` 确认流程移入小型应用流程模块，例如 `src/game/content-preparation.ts`；升级、商店和宝箱共用门禁，保留取消/重开版本、后台中断与输入重置。资源模块不改变 mode 或授予奖励。
6. 接回 `GameView`、`SkillVfx`、`FirstRun` 与发布脚本，让支持名单、依赖、已启用图集从统一配置派生；核对四图集均有使用路径，原图和候选不进入包。开发记录标明未验证，之后获得测试安排再执行相应检查。

第二阶段不同时迁移新武器、完整地图、融合或囚坊，不预建无真实使用者的 TrailBatch/TelegraphBatch/CDN Adapter。阶段三以后按 [plan.md](../plan.md) 顺序继续开发，最终发布前仍需安排运行与设备验收。
