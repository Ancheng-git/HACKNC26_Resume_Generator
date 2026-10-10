# 前端接口契约检查

2026-10-10。按用户提供的 `background-upload-integration-zh.md` 和 `first_3_interfaces.txt` 核对，用户明确将范围收窄为前端请求契约，不要求真实后端联调。

## 核对结果

- `API_BASE` 统一位于 `src/api.js`，默认 `http://127.0.0.1:8000`。
- 资料上传：`POST /api/backgrounds`，FormData 字段为 `resume`、重复 `background_files`（最多五份）、`photo`；不手动设置 Content-Type。HTTP 201 为正常成功响应。保存 `background_id`，仅 `ready_for_generation` 为真时可生成，展示警告。上传文档允许无照片保存，但当前 UI 依照既有产品要求必须选照片，这不改变后端契约。
- 提交：`POST /api/generations`，JSON 为 `company`、`job_description`、`background_id`。上传扩展文档是对早期“仅两个字段”约定的更新，后端现有模型也接受 `background_id`。新增前端 120/50000 字符限制，HTTP 202 表示任务接收，使用返回 ID，不自动重发 POST。
- 查询：`GET /api/generations/{id}`，立即查询、响应后约两秒再次查询，终态停止。关闭业务面板/切换申请仍保留各任务轮询；页面退出时清理计时器和 AbortSignal。旧任务响应不能覆盖新任务。404/网络失败显示查询不可用，主动重新查询不会重发生成请求。
- 下载：三个类型使用成功响应中的 `files[type].url`，与 API 地址组合；限制为后端同源。检查 response.ok 后才创建 Blob 下载，使用返回的 `name`；错误显示英文并可重试下载，独立保存各类型状态。释放 object URL，失败任务不显示下载。
- 成功时展示返回 ATS 分数与 warnings，低分成功不擅自改为失败。后端错误结构转换为文字；用户内容与返回消息不作为 HTML 渲染。界面不显示虚假进度。

## 本次修复

`src/index.html`、`src/workspace.js`：修正标题上限（原 280 → 契约 120）、JD 上限 50000，新增 ATS 返回值展示、提交期间禁用按钮、轮询 AbortSignal/页面清理和旧响应保护。

`src/api.js`、`src/workspace.js`：新增下载响应检查、原文件名、下载反馈与 URL 回收，保留三个原下载入口。未修改材质、后端或接口路径/字段。

`tests/workspace.test.mjs`：扩展模拟回归，检查长度上限、低分成功与警告、下载成功/404/409、文件名/URL 回收、409/422 错误、查询 404 和旧响应保护。原上传、独立草稿、场景面板、状态与轮询回归继续保留。

## 验证边界

`node --test tests/*.test.mjs` 和 `npm run build` 运行验证。测试使用模拟 DOM/fetch；不等同于真实上传解析或 AI 生成成功。本次没有运行真实 AI、没有消耗模型额度。检查时 8000 端口没有运行服务，完整生成工作流不在当前仓库中，用户已明确不要求联调。

启动前端：`cd frontend; npm run dev`，打开 `http://localhost:5173/`。真实联调时后端来源允许列表需包含完整的 `http://localhost:5173`（`RESUME_FRONTEND_ORIGINS`）；localhost 与 127.0.0.1 是不同来源。
