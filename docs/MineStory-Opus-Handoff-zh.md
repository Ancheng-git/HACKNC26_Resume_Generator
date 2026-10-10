# MineStory：前端进展与 3D 生态工坊实施交接

更新日期：2026-10-10。本文交给下一位前端开发者或 AI 编程助手，作为本轮视觉升级的需求与约束。本文不授权修改后端、发布网站、合并 PR 或处理账号密钥。请先检查接手时的实际代码与最新后端约定；如其与本文发生冲突，明确指出，不静默猜测。

## 1. 项目与目标

项目参加 HackNC 的 Frutiger Aero Track。产品名称 MineStory：用户提供自己的真实经历、已有简历、照片与补充文件；针对多个职位复用这些资料，生成定制申请材料。每个职位对应独立的申请项目。

最终产品方向：帮助学生和早期求职者用已有技能进入环境、气候、清洁能源与自然保护相关职业。允许用户带入职位描述，不限制为某一个职业，例如软件、数据、设计、运营也可以参与环境工作。

本轮目标：将当前平面网页升级为可交互的真实 3D 场景。参考 Bruno Simon 网站的空间交互、第三人称镜头、探索感与转场；采用 Minecraft 启发的方块结构，以及 Frutiger Aero 的玻璃、水、光照和自然氛围。保留已完成的产品流程与接口。

不要求复制 Bruno 的地图、模型或玩法，也不要求实现完整 Minecraft 游戏。

## 2. 当前源码与交付状态

远程仓库：https://github.com/Ancheng-git/HACKNC26_Resume_Generator

已推送分支：`frontend-integration`。
已推送提交：`9216298`，标题 `Add MineStory frontend with resume backend integration`。
用户已表示创建 PR，是否合并到 main 未再次核实。接手时检查分支与最新提交，不能假设 main 已包含前端。

本地本轮推荐开发目录：

```text
C:\Users\alex_\Desktop\Hacknc\HACKNC26_Resume_Generator\frontend
```

另外存在两份旧目录：

```text
C:\Users\alex_\Desktop\Hacknc\MineStory-local-source
C:\Users\alex_\Desktop\Hacknc\minestory
```

不要在三个目录之间交叉修改。新工作以仓库里的 frontend 为准。dist 为构建产物，不作为源码修改。

当前结构：

```text
frontend/
  package.json
  package-lock.json
  README.md
  .gitignore
  src/
    index.html
    styles.css
    api.js
    script.js
    workspace.js
    assets/
  tools/
    dev-server.mjs
    build.mjs
  tests/
    workspace.test.mjs
```

当前采用原生 HTML/CSS/JavaScript，无 React/Vue，无第三方构建依赖。npm build 复制 src 到 dist，开发服务器不是 Vite，不支持自动热更新。

```powershell
cd frontend
npm ci
npm run dev
# http://localhost:5173
node tests/workspace.test.mjs
npm run build
```

以后引入 Three.js 可以增加必要依赖和调整构建，但保留 npm run dev / build 的工作方式及 5173 端口。若开发服务器改变，需要同步核对 CORS。

## 3. 已完成组件与验证边界

### 3.1 个人资料箱

- LinkedIn 木牌已删除，不再需要 LinkedIn 输入或抓取。
- 一份主简历必选：PDF、DOCX、DOC。
- 一张个人照片前端必选：JPG、JPEG、PNG。
- 五个可选补充文件槽位，每个最多一份，可单独清除。
- 主简历支持选择及拖拽。
- 点保存才上传；上传中避免重复点击。
- 展示错误与后端 warnings。
- 上传返回 ready_for_generation=true 且存在 background_id 后才保存新资料包并允许进入工作台。
- 保存成功自动关箱；失败不应伪装成上传成功。
- 面板曾向右溢出，已改为桌面向左打开，手机采用正常布局。新 3D 场景也必须避免这类溢出。

### 3.2 多申请工作台

- 首次进入自动创建并选中 `default`。
- 点击加号询问标签，确认后立即出现在左侧。
- 空标签或取消不会创建项目，也不会影响旧项目。
- 每个申请独立保存 Title、Description、任务状态与文件结果。
- 输入过程中保存当前项目草稿，切换可恢复未生成的文本。
- 当前只有一个合并的 Title 输入和一个 Description 输入。
- 空白 Description（包括只有空格）禁止生成并提示；Title 也必填。
- 资料包上传成功后才能提交生成。
- 重复提交同一个运行中项目被拦截。
- 三种文档标签：Resume、ATS resume、Cover letter。

### 3.3 接口层

- api.js：后端地址、JSON 响应与错误处理、上传限制、FormData 上传。
- script.js：资料选择与上传交互。
- workspace.js：项目管理、职位提交、状态轮询、下载链接。
- 现有脚本共享全局状态，并依赖实际 DOM ID 与加载顺序：api.js → script.js → workspace.js。
- 如果改为模块，需要一次性修正依赖和挂载关系，不能只是删除旧 DOM 后继续运行原脚本。

### 3.4 已验证与尚未验证

已通过：JavaScript 语法检查、模拟接口流程测试、生产构建。
模拟测试覆盖 multipart 字段、警告、ready 状态、文件限制、default 项目、独立草稿、生成 JSON、状态与下载 URL。

尚未确认：室友的真实前后端端到端联调结果。不能宣称真实 AI 生成与下载已经由此前端验证通过。
当前没有 3D 场景、人物动画、角色移动、真实账号、职位搜索服务、多模型切换、在线文档编辑或 DOCX 内嵌预览。
前端资料与项目状态都在页面内存里，刷新后清空。不是账号资料库或持久历史系统。

## 4. 必须保留的接口契约

### 4.1 地址与运行

默认 API_BASE：`http://127.0.0.1:8000`。
前端来源：`http://localhost:5173`，后端 RESUME_FRONTEND_ORIGINS 需要允许该精确来源。
localhost 与 127.0.0.1 是不同来源。后端仅监听本机时，两者应在同一台电脑运行。不能把前端部署后仍指向访问者的 localhost，当成远程后端。

### 4.2 上传资料

```http
POST /api/backgrounds
Content-Type: multipart/form-data（由浏览器自动设置）
```

```javascript
const form = new FormData();
form.append('resume', resumeFile);
for (const file of supplementaryFiles) form.append('background_files', file);
form.append('photo', photoFile);
```

禁止手动填写 multipart Content-Type，避免丢失 boundary。
HTTP 201 示例：

```json
{
  "background_id": "32位十六进制ID",
  "ready_for_generation": true,
  "warnings": []
}
```

每份文档最多 10 MB；照片最多 5 MB；整个请求最多 30 MB；PDF 最多 100 页。multipart 有额外开销，前端文件总大小检查不能替代后端判断。
后端照片可选但无照片不可生成；产品当前要求照片必选，保留这个前端约束。
后端不包含 OCR；扫描、加密、损坏文件等可能报错。不能声称支持扫描件识别。
错误可能是 400、413、415、422。保持可理解的错误显示，不能只显示“失败”。

### 4.3 提交职位与启动生成

```http
POST /api/generations
Content-Type: application/json
```

```json
{
  "company": "Figma",
  "job_description": "完整职位描述",
  "background_id": "此前上传返回的ID"
}
```

HTTP 202：

```json
{"id":"任务ID","status":"queued"}
```

重要：前期讨论曾称接口为 title/description；后来正式文档和仓库 app.py 明确要求 company/job_description。实际 HTTP JSON 必须使用后者，不能根据旧讨论改字段。
当前 UI 的合并 Title 字符串整体映射到 company，不自动拆分。company 上限 120 字符，JD 上限 50000 字符。当前 Title HTML 上限 280，与后端不一致；升级时应修正为 120，Description 补充 50000 上限，仍保持单个 Title 输入。
请求不允许额外字段。必须传 background_id，不能删除它后默默使用项目拥有者的默认资料。
后端全局一次只运行一个任务；多个申请项目不等于并发生成或真正队列。409 表示忙，提示稍后再试。

### 4.4 状态查询

```http
GET /api/generations/{id}
```

后端状态：queued、running、succeeded、failed。
实际 stage 包括 queued、preparing、generating、validating、completed、failed，以接手时代码为准。
轮询约两秒一次，上一次结束后安排下一次；完成/失败停止。
网络断开不代表生成失败，不能自动重新 POST 制造重复任务。
404 可能因服务重启导致。backend 重启后 background_id 和任务 ID 均失效，须重新上传。
无真实百分比，不显示虚构百分比。默认任务最长约 20 分钟，以后端配置为准。
没有取消任务接口，关闭面板不能标记成服务器任务已取消。

### 4.5 三份文件

```http
GET /api/generations/{id}/files/{kind}
```

kind：ats_resume、professional_resume、professional_cover_letter。
成功查询中 files 是按 kind 索引的对象；仓库 runner.py 的实际项字段为 `name` 和 `url`，不是 filename。现有前端仍检查 filename，并回退显示类型；升级时改为优先 name，必要时兼容 filename。
URL 为相对地址，使用 API_BASE 拼接，使用实际返回地址，不猜本机文件路径。
真实输出为 DOCX，服务端 FileResponse 提供附件下载。没有 PDF/HTML 内容接口，不要把 Word 下载 URL 塞进 iframe 后称为预览已实现。第一版可以诚实显示文件卡片和下载按钮；在线预览与编辑需另有转换或内容接口。

## 5. 不可擅自修改与可修改范围

不可擅改：

- 后端 app.py、backgrounds.py、runner.py、requirements.txt 及生成工作流，室友负责联调。
- HTTP 路径、字段、状态、文件 kind 和 background_id 关联。
- 用户经历的真实性；不得生成虚假成就或环保经历。
- 已实现的单资料包复用、多申请隔离、default、标签创建、上传验证与错误处理。
- 不把真实请求替换成看似成功的延时模拟。
- 不把密钥、个人文件和环境文件提交 Git；保留 gitignore。
- 未经用户要求不推送、合并、发布或创建账号服务。

可修改：

- 页面布局、样式、材质、场景模型、镜头、动画。
- DOM 结构与前端组织，前提是同步迁移功能并回归检查。
- window.prompt/alert 可改成像素告示牌风格的可访问弹窗，保持原行为。
- 添加 Three.js 与必要构建工具，不要求为此迁移 React。
- 删除旧背景 PNG 和图片式宝箱的引用；确认无引用后可清理不用资产。
- 文件名兼容、输入长度、状态显示等前端契约一致性修复。

## 6. 赛题原文与设计原则

用户提供的赛题：

> Frutiger Aero is the glossy, optimistic design style of the mid-2000s to early 2010s, full of glassy buttons, bubbles, blue skies, lush greenery, and the belief that technology and nature could thrive together. The Frutiger Aero Track challenges you to bring that utopian vision back to life by building projects that blend its signature aesthetic with real sustainability and nature-focused ideas. Whether you're designing an eco-tracker with shimmering Vista-style UI, visualizing ocean or air-quality data through bubbly skeuomorphic interfaces, or creating tools that help people reconnect with the outdoors, this is your chance to make a greener future look as bright as we once imagined it.
> Clear skies, clean code. Let's build the future we were promised!

设计必须同时表达视觉与用途：

1. 方块几何、人物与场景交互来自 Minecraft 启发。
2. 玻璃、明亮反光、水、蓝天、绿植与乐观科技感来自 Frutiger Aero。
3. 实际用途是帮助人探索并申请环境相关职业。

不能只做 Minecraft 木屋并加几片叶子。暗矿洞、满屏灰色像素框和强烈复古噪点不作为主风格。
不能用“生成简历减少了多少碳”或“每次生成拯救一棵树”等无证据指标证明环保价值。

## 7. 用户认可的场景故事

开场：树下有一个 Steve 风格的方块人物坐着休息。用户点击 Click to start，人物醒来、站起并自动走向附近生态小屋。
门前：像素告示牌/门牌呈现登录/注册入口的设计。当前没有账号 API，首版提供明确的访客进入，不假装注册成功，不收集无用途密码。
进入：人物自动走进小屋；镜头转到室内剖面。
屋内：资料箱、工作台、墙上公告板、熔炉、铁砧分别对应产品动作。

建议用原创方块角色实现 Steve 式轮廓与动作，不依赖下载官方皮肤。登录与多模型属于规划中的功能，不是本轮已存在的能力。

## 8. 镜头与控制

- 室外采用斜上方第三人称镜头，轻柔跟随角色。可用正交或长焦透视，先通过实际画面选择。
- 开场近景突出树与睡眠人物；点击后拉远展示路径和小屋。
- 第一版固定镜头朝向，不自由旋转；不是第一人称射击操作。
- 室内隐藏屋顶与挡视线的前墙，形成清晰剖面，五个物体一眼可见。
- 互动时镜头轻轻靠近，打开 HTML 面板；关闭恢复场景视角。
- WASD/方向键可走动，直接点击物体也能自动走近并操作；手机支持点击，不要求键盘。
- 小地图场景可用预设可行走区域和航点，不必引入通用寻路系统。
- 输入表单时暂停角色快捷键；恢复时清理按键状态，防止角色一直走。
- 角色不能穿墙、穿箱或走出场景。近物体有高亮、名称与交互提示。
- 开场可跳过，返回资料面板不重复播放整段开场。

## 9. 五种物体的业务职责

| 物体 | 产品用途 | 本轮可落实能力 |
| --- | --- | --- |
| 大资料箱 | 主简历、照片、五个补充文件 | 复用真实上传接口，成功开关箱动画 |
| 工作台/工作箱 | 多职位申请与结果管理 | default、标签、Title/Description、生成、下载 |
| 墙上公告板 | 发现绿色职业 | 分类介绍招聘网站，外部打开；可加入核实过的岗位卡 |
| 熔炉 | 可视化真实生成状态 | submitting/queued/running/validating 的文字与灯火，成功/失败反馈 |
| 铁砧 | 模型和生成设置 | 场景入口与说明；无后端支持的设置不可假装保存生效 |

熔炉显示整个服务真实活动状态，而不是只看当前选中项目。运行中换项目、关闭面板不熄灭任务指示。失败不能与成功使用相同反馈。无需百分比动画。

多个大箱子可以是同一资料包的分类入口：主简历、照片、补充经历。提交仍作为一个完整 FormData 包，不能假设后端支持分开更新照片。

“简历微调”目前没有编辑接口。工作台可以保留它的设计位置，但首版实现的是管理输入和获取结果，不编造在线编辑能力。

## 10. Frutiger Aero 的具体视觉规范

场景：鲜明蓝天、柔软方块云、草地层次、树冠、花、水面、木结构玻璃工坊。太阳能板或小风机可作为少量环境细节，不堆装饰。
材质：纯色块和真实几何细节为主，玻璃有适量透明/反光，地面与道具有柔和阴影。用户明确不想要整幅背景贴图和图片式宝箱。
允许独立的 3D 模型资产；如要使用纹理须说明用途，不用纹理图冒充空间。人物照片只用于上传资料，不自动变成公开角色纹理。
界面：玻璃渐变、轻微顶部高光、圆润或有厚度的按钮；边框可有像素轮廓，不能所有内容都强制像素化。
阅读：像素字体仅用于品牌、短标签和场景提示；职位描述、错误说明与文档保持正常易读字体。半透明面板仍应有足够实色底保证对比。
动画：呼吸、树叶轻摆、水波、箱盖、站立行走与镜头转场。一次强调一个主体，尊重 prefers-reduced-motion，声音默认可关闭。

## 11. 环保用途如何落实

公告板参考：

- Climatebase：https://climatebase.org/ ，气候领域及软件、设计、运营等职能。
- Terra.do：https://www.terra.do/climate-jobs/job-board/ ，气候职业与转型资源。
- Conservation Job Board：https://www.conservationjobboard.com/ ，生态、野生动物、森林、环境教育等。
- Green Jobs Network：https://greenjobs.net/ ，环境与可持续职业资源。

第一版可以外部链接，在点击前说明将打开新标签页。不要假装这些网站已嵌入、允许 iframe、支持我们自己的搜索 API。
如果加入绿色岗位卡，人工挑选少量真实岗位，保留来源、查看日期及雇主申请链接。核对到岗位原页面，不能用过期职位冒充实时推荐。
解释岗位的环境相关性时用具体职责作为依据，不因公司名称带 green 就保证环保。
用户上传职位、生成对应申请是核心闭环。岗位匹配解释需要真实内容来源与实现，未接入时只做诚实的静态介绍。

## 12. 技术实施建议

采用 Three.js 场景 + HTML/CSS 面板。3D 负责空间、物体、角色、灯光和转场；DOM 负责表单、长文本、错误、状态和下载。
保持一个主渲染循环，不为每个弹窗创建新的循环。离开/隐藏场景可减少渲染，窗口调整更新画布与镜头；限制设备像素比，避免高 DPI 设备过载。
简单立方体角色使用头、躯干、四肢分组即可实现站起和行走。先追求自然的节奏、正确比例与构图，再增加细节。
交互拾取只针对可点击物体，避免地面/透明玻璃抢点击。站点可固定导航目标，不必完整物理引擎。
业务状态与视觉状态分开：角色站立不等于已登录，箱盖闭合不等于上传成功，炉火结束不等于生成成功。
保留无 WebGL/低性能设备的普通页面入口，使核心上传与申请可用。
模型加载失败需回退或提示，不无限加载。必要依赖应可本地构建，避免只靠远程 CDN 才能演示。

参考资源（作为参考，不自动复制）：

- https://bruno-simon.com/ ：空间交互与镜头参考。
- https://threejs.org/ ：实现工具。
- https://kenney.nl/assets/voxel-kit ：CC0 体素素材。
- https://kenney.nl/assets/nature-kit ：CC0 自然模型，风格需筛选统一。
- https://github.com/BenjaminAster/CSS-Minecraft ：CSS 方块示例。
- https://github.com/Jiyath5516F/Minecraft-CSS ：控件参考，仓库标注 MPL-2.0，不当作 3D 引擎。

记录实际采用的资产、来源和许可。不要下载整套 Minecraft 或 Bruno 的作品当成自有资产。

## 13. 实施阶段与交付

### A：场景验证

独立开发分支；保留可运行旧界面。搭建树、人物、自然小岛与玻璃小屋，确定尺度、镜头、配色与光照。先给出浏览器实际截图/预览，不先做一堆业务页面。
验收：真实几何空间；无大背景图；能读出 Aero 的玻璃与自然科技感；不是漆黑矿洞。

### B：开场与进入

实现休息、Click to start、站起、走到门前、访客进入、进入室内与镜头转场。
验收：可跳过、可重复打开、不重复触发、人物不穿墙、过渡稳定。

### C：场景功能连接

连接资料箱、工作台、公告板、熔炉；铁砧说明未来设置边界。用真实现有接口，保留旧验证。
验收：上传成功才保存；工作台 default 与独立项目正常；切换草稿不丢；状态与文件所属项目正确。

### D：视觉与设备优化

玻璃面板、光照、水、微动画、键盘与点击移动、手机布局、降级页面、无障碍。
目标可在团队演示电脑上稳定运行。记录测试设备和场景帧率；不要无测量地宣称 60 FPS。

### E：真实联调

由团队已有后端环境完成上传、生成、查询、下载。记录是否真的调用了模型及生成结果，不将模拟测试当作端到端成功。
账号、多模型、在线微调、自动岗位搜索属于后续阶段，只有新接口明确提供后才接入。

## 14. 回归与视觉验收清单

功能：

- 无资料不能生成；无照片不能进入可生成状态。
- 补充文件零至五份均正确；保存成功关箱，失败仍可修正。
- 上传字段重复方式、background_id 与生成 JSON 完全正确。
- 首次 default 仅一个；新标签不覆盖旧项目；取消不丢输入。
- 空格描述被拒绝，Title/Description 长度符合后端。
- 409、404、413、415、422 和网络失败有提示，不虚假完成。
- 多项目状态隔离，终态停轮询，三个文件正确下载。
- 熔炉真实反映任务；关闭面板不停止后端。

视觉：

- 第一眼看到明亮自然与玻璃科技；方块世界与 Aero 统一。
- 角色自动行走和交互物体可理解；地图不需要教学才能完成申请。
- 室内无遮挡，点击目标清楚；窄屏面板无越界。
- 文本可读、焦点可见、Esc 关闭面板、面板开时角色不动。
- 至少检查桌面宽屏、常见笔记本尺寸、手机宽度与 reduced-motion。

交付：更新 README、必要测试、资产清单、浏览器截图/预览；说明已完成与未完成能力。不要只交概念图。

## 15. 给下一位 AI 的执行指令

请先读取实际源码、仓库指令与这份文档，确认当前分支。以用户后续消息为最高任务范围。
本轮采用渐进替换：先实现阶段 A 的可运行 3D 场景，保持上传与工作台可用；验收视觉后继续 B/C/D。不要为了做场景先删光已有接口。
在开发中持续给出简短进度，指出视觉或接口的不确定性。用实际浏览器画面验收，不用“理论上很好看”替代验证。
不要一次建设完整游戏、账号系统和模型服务。要交付一个精致、流畅、确实能用于绿色职业申请的生态工坊。
