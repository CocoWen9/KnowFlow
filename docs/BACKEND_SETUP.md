# KnowFlow 2.0 后端配置

本版本保留游客本地工作区，登录用户使用 Supabase Auth、PostgreSQL 和现有 Cloudflare Worker。尚未创建 Supabase 项目时，可以开发、运行测试并使用本地模式。

## 本地运行和验证

使用 Node.js 22（`nvm use`），执行：

```sh
npm ci
npm test
npm run build
npm run worker:check
npm run dev
```

数据库测试使用 PGlite 在本机运行 PostgreSQL，无需远端账号。它验证真实 SQL、权限、事务回滚和版本检查；不能替代上线后的 Supabase Auth/PostgREST 集成验收。

访问 `/tests/browser-smoke.html` 可以使用内存模拟云端工作区，验证冲突提示、恢复副本和失败重试。该页面不连接真实账号。

## 创建云端项目

1. 在 Supabase 创建项目。
2. 打开 SQL Editor，依次执行 `supabase/migrations/` 下的 SQL 文件。首次迁移在全新项目中执行一次；后续结构调整应增加新迁移。
3. 启用邮件密码登录。在 Authentication 的 URL Configuration 中配置站点地址及允许的邮件确认回跳地址。开发地址为 `http://127.0.0.1:5173/`；GitHub Pages 地址包含 `/KnowFlow/`。
4. 获取项目 URL 和 publishable key（旧项目可使用 anon key）。不需要向浏览器提供数据库密码或 service-role key。

## 配置前端

将 `.env.example` 复制为 `.env.local`，填写：

```dotenv
VITE_API_URL=http://127.0.0.1:8787
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
```

重新启动 Vite。Vite 配置在构建时写入前端，需要在修改后重新构建。

## 配置 Worker

将 `worker/.dev.vars.example` 复制为 `worker/.dev.vars`，填写同一个 Supabase 项目的 URL 和公开 API key，配置允许的前端来源。执行 `npm run worker:dev`。

生产环境通过 Cloudflare 控制台或 Wrangler 设置对应 Worker 变量，然后执行 `npm run worker:deploy`。前端 `VITE_API_URL` 应指向部署后的 Worker。

GitHub Pages 部署时，在仓库 Actions Variables 中设置 `VITE_API_URL`、`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。这些都是浏览器可见配置，禁止填入管理员密钥。现有 GitHub Actions 工作流会读取它们。

## 产品流程

- 未登录：继续使用原有 localStorage 图库。
- 注册：若项目要求邮件确认，确认后再登录。
- 登录：打开个人云端图库；已有本地图不会自动上传。
- “Import local graphs”：将本地图复制到账号，保留本地原件。相同内容重复导入复用已创建的目标图；原件改变后导入为新的副本。
- 保存失败：当前编辑保存在按账号和工作区实例隔离的本地备份中，可重试。
- 版本冲突：暂停覆盖。选择将编辑保存为新图，或加载云端版本；加载前保留恢复副本。
- 退出登录：返回本地图库。云端备份不会混入游客图库；共享电脑应按需要清除浏览器站点数据。

## 数据和并发约定

图 ID 使用 UUID；节点和边的 ID 在一张图内唯一。父节点、边的两端必须属于同一张图。结构父子关系由 `parentId` 决定，关系标签和节点位置不能改变层级。

保存携带 `expectedVersion` 和 `mutationId`，数据库在一次事务内检查版本并修改关联数据。客户端按图串行保存；响应丢失时复用同一个 mutation ID 重试。冲突返回 HTTP 409，不自动覆盖。节点和边数据按表保存，上下文来源快照保留在 JSONB 中。

AI 调用仍是同步 HTTP 请求，前端将结果和上下文随图保存。切图、删除节点和重试时，通过图 ID、节点 ID 和请求 ID 防止旧回答覆盖新状态。此版本没有后台任务队列或多人实时合并。

## 上线验收

创建两个测试账号验证：账号 A 无法读取或修改 B 的图；同账号换浏览器可以恢复；两个页面同时修改时出现冲突；删除分支不留下悬空边；断网重试不重复创建图；导入和恢复不会清除原件。配置云端后，AI 接口要求登录。
