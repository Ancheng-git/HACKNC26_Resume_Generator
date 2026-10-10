# 本地前端接口

在现有工作流外增加 HTTP 接口：前端 → 本机后端 → 本机 Claude Code → 原有脚本 → 下载。
不接入新的模型 API，不改原有生成脚本、命令、参考资料或已生成文档。

## 启动

在项目根目录运行，使用 Python 3.11+（已在 macOS / Python 3.13 验证接口）：

```bash
cd /Users/anchengli/Desktop/custom-tailored-resumes
python3 -m venv --system-site-packages backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
claude auth status
```

原流程需要的 python-docx、Pillow、PyMuPDF（视觉预览需要）、Node/docx 和 LibreOffice 仍需可用。`--system-site-packages` 复用当前 Python 已安装的文档依赖；如果该解释器缺依赖，应在此虚拟环境中安装，不要改生成脚本绕过检查。

若 Claude Code 未登录，在同一 macOS 用户的终端运行 `claude` 完成正常登录。本后端不会读取认证令牌或切换认证方式。

```bash
RESUME_FRONTEND_ORIGINS=http://localhost:5173 \
backend/.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --workers 1
```

不要加 `--reload` 或多个 worker。单任务锁和状态保存在单个进程内。服务关闭会终止活动任务及其子进程；服务重启后旧任务 ID 返回 404，磁盘文件仍保留。停服使用 Ctrl+C。

接口说明页面：<http://127.0.0.1:8000/docs>。

可配置的环境变量：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `RESUME_FRONTEND_ORIGINS` | 空 | 逗号分隔的完整前端来源，例如 `http://localhost:5173,http://127.0.0.1:5173`；不允许 `*` 或 `null`。来源包含协议、主机和端口，不带路径或末尾斜杠。 |
| `RESUME_CLAUDE` | `claude` | 可执行文件名或绝对路径，不是带参数的 Shell 命令。 |
| `RESUME_TIMEOUT_SECONDS` | `1200` | 整个任务的最长秒数，包括认证、生成和验证。 |
| `RESUME_SOFFICE` | 原脚本自动查找 | 原有 LibreOffice 可执行文件覆盖路径。 |

## 三个接口

### 提交任务

`POST /api/generations`，`Content-Type: application/json`：

```json
{"company":"Figma","job_description":"完整职位描述"}
```

公司名称 1–120 字符，JD 1–50000 字符，去除首尾空白后不能为空，不接收额外字段。

HTTP 202：

```json
{"id":"服务端生成的唯一 ID","status":"queued"}
```

已有任务运行时返回 409，不排队。输入不合法返回 422。请求返回时不等待生成完成。

### 查询任务

`GET /api/generations/{id}`。

状态为 `queued`、`running`、`succeeded` 或 `failed`。`stage` 为实际执行阶段，不提供估算百分比。失败时仅返回安全的错误摘要，不返回内部日志或个人资料。

成功示例（文件名和 ID 以实际响应为准）：

```json
{
  "id":"task-id",
  "status":"succeeded",
  "stage":"completed",
  "error":null,
  "files":{
    "ats_resume":{"name":"Resume_Figma_2026-10-08.docx","url":"/api/generations/task-id/files/ats_resume"},
    "professional_resume":{"name":"Professional_Figma_2026-10-08.docx","url":"/api/generations/task-id/files/professional_resume"},
    "professional_cover_letter":{"name":"Professional_CoverLetter_Figma_2026-10-08.docx","url":"/api/generations/task-id/files/professional_cover_letter"}
  },
  "ats":{"composite_score":88,"must_have_pct":100},
  "warnings":[]
}
```

未知 ID 或服务重启前的 ID 返回 404。

### 下载

`GET /api/generations/{id}/files/{type}`。

`type` 仅允许 `ats_resume`、`professional_resume`、`professional_cover_letter`。仅成功任务可以下载，其他状态返回 409。文件缺失、被改动或指向任务目录外时返回 404。非法类型返回 422。不接受文件系统路径。

响应使用 DOCX Content-Type 和附件文件名。前端应使用查询结果中的 URL，不自行拼接磁盘路径。

## 前端示例

```javascript
const API = 'http://127.0.0.1:8000';

async function generate(company, jobDescription) {
  const response = await fetch(`${API}/api/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company, job_description: jobDescription })
  });
  const submitted = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(submitted.detail));

  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const poll = await fetch(`${API}/api/generations/${submitted.id}`);
    const task = await poll.json();
    if (!poll.ok) throw new Error(JSON.stringify(task.detail));
    // 在这里把 task.status / task.stage 显示到页面。
    if (task.status === 'failed') throw new Error(task.error);
    if (task.status === 'succeeded') {
      // 显示 task.warnings，并为每个文件创建下载链接。
      return Object.entries(task.files).map(([type, file]) => ({
        type, name: file.name, href: API + file.url
      }));
    }
  }
}
```

真实页面应在组件卸载时停止轮询，并显示网络错误。三份文件有不同用途：ATS 简历用于招聘系统，两个 Professional 文件供人工阅读。

## 如何复用原流程

1. 新建 `backend/runs/<id>/`，不复用旧目录。
2. 复制当前 `scripts/` 和 `reference/`，只复制必要的运行资料；`node_modules/` 通过链接复用，不复制整个仓库。
3. 保存输入 JD 和请求，读取当前 `.claude/commands/tailor-resume.md` 并去掉 YAML 说明头，将其正文显式传给 Claude Code；`workflow.md` 是本次审计快照，不是另一份维护源。
4. 调用 `claude auth status`，确认已登录，再运行 `claude -p`，通过 stdin 提交任务。没有使用 `--bare`、新 API Key 或全局跳过权限检查的参数。
5. 工具仅开放 Read/Write/Edit/Glob/Grep/Bash；Bash 自动许可限定在 Python 和 Node 命令。非交互权限模式为 `dontAsk`，需要额外批准的工具会被拒绝，不会自动提升权限；若 Claude 改用已允许的工具完成工作，最终仍以结果和文件验证判定成功。
6. 工作流自行撰写内容、运行原脚本、精简超页内容并查看 PNG。后端不增加另一套 AI 撰写或 ATS 生成器。
7. 后端检查本任务的三个指定文件、对应最终哈希的视觉审阅记录和预览，再使用原项目的可信 `check_pages.py`、`ats_check.py` 独立检查，全部完成后才发布下载。

使用程序化 CLI 的方式已对照本机 2.1.289 的 `--help` 和[官方文档](https://code.claude.com/docs/en/headless)。后端显式传入原指令，因此不依赖 `/tailor-resume` 在非交互模式下的斜杠命令展开，也不复制维护一套提示词。

## 验证规则和限制

- 恰好一页及正文完整性由原检查器验证；不隐藏超页，不缩小字体绕过限制。
- ATS 阈值仍为综合分 80、必需关键词覆盖 90%。原工作流允许三轮修改后如实报告无法补齐的缺口，因此后端保留这个例外：低于阈值时必须有三轮修改记录和缺口报告，响应给出 `warnings`。前端必须显示这个警告。
- `completion.json` 的视觉审阅、修改轮次和缺口描述由 Claude 报告。后端能验证记录对应最终文件、PNG 存在及机械检查通过，不能独立证明 AI 已正确判断视觉质量或个人经历真实性。完整分析保存在本地 `report.md`，不通过接口返回个人材料。
- 每个任务目录含私人资料副本和日志，已被 Git 忽略；本版不自动清理，停服后可手动删除不再需要的任务目录。
- 路径隔离、指令和工具规则不是操作系统沙箱。Python/Node 执行仍拥有本机用户权限。此版本仅适合可信的个人本地使用，不是面向不可信用户的公网服务。
- 不修改现有认证方式，但 Claude Code 自身依然需要联网，额度和费用取决于现有账号。
- `localhost` 指向访问者自己的电脑。朋友在另一台电脑上使用前端时，不能通过自己的 localhost 访问你的后端；本次只支持本机，不开放公网或局域网。
- 本版不含登录、数据库、任务恢复、取消 API 或多任务并发。

## 本次验证记录（2026-10-08）

接口及失败路径用模拟 Claude 子进程验证；成功路径使用已有 Figma 文档作为测试夹具，并实际调用原页数和 ATS 检查器。这不代表已生成新的 AI 定制内容。

七组测试通过，涵盖输入与来源校验、忙碌响应、未知任务、认证失败、子进程失败、退出码为零但结果失败、超时与子进程清理、服务关闭、缺失文件、超页、ATS 未达标及三轮修改例外、下载类型／路径限制、文件变动和符号链接，以及可恢复的工具权限拒绝。

通过实际 HTTP 服务提交了一次已保存的 Figma JD，Claude Code 使用现有环境认证完成真实生成。初版将可恢复的工具拒绝误判为失败；修复后没有再次调用模型，而是对同一任务目录重新执行最终验证及 ASGI 下载测试。三份文件各一页且文字完整，ATS 综合分 94，必需关键词覆盖 100%；三张预览也已人工式视觉复核。不是一次修复后从提交到完成的全新运行，但生成、验证和下载各环节均有实际证据。

任务目录为 `backend/runs/277591bfb611442d885d5b10c4825fc7/`。测试服务已关闭，内存任务状态不保留；文件仍可从该目录读取。未提供朋友的前端代码，因此尚未验证其页面联调。

## 上传个人资料包（新增）

`POST /api/backgrounds`，使用 `multipart/form-data`，不调用模型：

| 文件字段 | 要求 |
| --- | --- |
| `resume` | 必须一份主要简历，支持 PDF、DOCX、旧版 DOC；个人信息、联系方式、教育和主要经历应在此文件中。 |
| `background_files` | 可选，最多五份补充经历文件；重复使用此字段名，格式同上。 |
| `photo` | 可选一张 JPG/PNG 本人头像。没有照片时资料仍可保存，但不能用于生成三份文档。 |

单份文档最多 10 MB，头像最多 5 MB，整个请求（含 multipart 边界）最多 30 MB。PDF 最多 100 页；解压过大的 DOCX 和超大图片也会被拒绝。图片按实际内容解码；上传路径由后端生成，不使用客户端文件名作为磁盘路径。

成功 HTTP 201：

```json
{
  "background_id": "32位资料包ID",
  "ready_for_generation": true,
  "warnings": []
}
```

没有头像时 `ready_for_generation` 为 false，前端应提示重新上传带本人头像的完整资料包。第一版不提供更新、列表或删除资料包接口。

错误：413 超出大小限制；415 格式不支持或不是 multipart 请求；422 文件不可读、资料字段不完整或照片无效。损坏的 multipart 结构及超过解析器文件数量限制可能返回 400。

旧版 DOC 使用现有 LibreOffice 转换，单次转换超时 60 秒。PDF 提取文字后整理为标准输入，并保留原文件；PDF 多栏顺序可能变化，会返回警告。扫描件、加密文件和无法读取文字的资料会被拒绝。本版不包含 OCR，不改写或补全个人事实。

上传成功后，在原生成请求中增加可选 `background_id`：

```json
{
  "company": "Figma",
  "job_description": "完整职位描述",
  "background_id": "上传返回的32位ID"
}
```

传入 ID 时，只使用该资料包中的个人资料和照片；缺少资料或 ID 无效不会回退到项目拥有者的资料。未知 ID 返回 404，缺少头像返回 422。字段省略或为 null 时，仍使用原项目的 `reference/`，旧前端和命令行流程不受影响。查询和下载接口保持原样。

前端新增调用示例：

```javascript
async function uploadBackground(resumeFile, backgroundFiles, photoFile) {
  const form = new FormData();
  form.append('resume', resumeFile);
  for (const file of backgroundFiles ?? []) {
    form.append('background_files', file);
  }
  if (photoFile) form.append('photo', photoFile);

  // 不手动设置 Content-Type，浏览器自动生成 multipart boundary。
  const response = await fetch(`${API}/api/backgrounds`, {
    method: 'POST', body: form
  });
  const pack = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(pack.detail));
  return pack;
}

// 上传后显示 pack.warnings，只有 pack.ready_for_generation 才提交生成：
// JSON.stringify({company, job_description, background_id: pack.background_id})
```

资料包保存于 `backend/backgrounds/<id>/`，包含原始文件、标准化参考资料和 manifest.json，已被 Git 忽略。每个生成任务获得独立资料副本；默认个人资料不混入上传模式，仅复用公共 JSON 格式示例。文件内的指令作为资料文字处理，不能覆盖工作流规则。

资料包 ID 和任务 ID 一样仅在本次服务运行期间有效。服务重启后需要重新上传，磁盘文件仍保留，可在停服后手动清理。这不是账号身份系统，仍仅用于可信的本机使用。

### 上传功能测试

测试不调用 Claude。使用标准库 unittest、已有文档库和开发测试依赖 httpx：

```bash
backend/.venv/bin/python -m pip install httpx
backend/.venv/bin/python -m unittest backend.test_backgrounds -v
```

覆盖 DOCX/PDF/真实 DOC 转换、补充经历、头像、缺失照片、格式错误、扫描与加密 PDF、大小和文件数量限制、转换失败与超时、清理、资料包隔离、旧请求兼容、OpenAPI 和 CORS。测试生成的资料使用合成数据，临时文件自动清理。
