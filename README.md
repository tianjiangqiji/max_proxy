## 演示图片

![](more\PixPin_2025-12-06_14-26-46.png)
![](more\PixPin_2025-12-06_14-26-55.png)


## 部署说明

执行 `npm run build` 后，会生成 `dist/`（前端静态资源）与 `dist-server/`（Node 后端）。将 `dist-server/` 上传到目标服务器后即可通过 `node dist-server/server.cjs` 启动服务。
(more 文件夹有编译好的，可以直接使用，可查看[快速部署.md](快速部署.md)文档)
### dist-server/.env

构建脚本会把 `backend.env` 与 `frontend.env` 的默认值写入 `dist-server/.env`。生产环境建议只修改该文件：

```
PORT=3001
FRONTEND_PORT=4173
BACKEND_URL=http://localhost:3001
FRONTEND_URL=http://localhost:4173
```

- `PORT`：API 服务监听端口（`/api/v1`、`/api/admin` 等）。反代时可将 Nginx 指向此端口。
- `FRONTEND_PORT`：自动托管 dist 静态站点时使用的端口。若交由外部 Web 服务器托管，可将该值改为未使用的端口或设置 `SERVE_DIST_FRONTEND=false`。
- `BACKEND_URL`：前端访问 API 时拼接的基础 URL。若前后端在同一台服务器且通过内网通信，可保持 `http://localhost:PORT`；若部署在不同服务器，则替换为外网可达的后端地址，例如 `https://api.example.com`.
- `FRONTEND_URL`：给日志或提示中使用的前端访问地址。若通过反向代理对外暴露 `https://panel.example.com`，则应写入该地址。

#### 部署示例

1. **同机部署 + 反向代理**
   - `BACKEND_URL=http://127.0.0.1:3001`
   - `FRONTEND_URL=http://127.0.0.1:4173`
   - Nginx 将 `https://api.example.com` 代理到 `127.0.0.1:3001`，`https://panel.example.com` 代理到 `127.0.0.1:4173`。

2. **前后端不同服务器**
   - 后端服务器 `.env`：`PORT=3001`、`BACKEND_URL=https://api.example.com`
   - 前端服务器 `.env`：`FRONTEND_PORT=80`、`FRONTEND_URL=https://panel.example.com`
   - 发布前端静态资源到 CDN 或 Web 服务器，`BACKEND_URL` 填后端实际公网地址，确保跨域或代理允许访问。

修改完 `.env` 后重新启动 `node dist-server/server.cjs` 即可生效。无需重新编译。 ***

```bash
npm run dev         # 启动前端开发（5173） + 后端开发（3001）

npm run build       # 编译后端 + 打包前端
npm run preview     # 前端静态预览（4173）
npm run start:api   # 启动后端（3001）
```

- `dist-server/` 内部包含自动生成的 `package.json`，可以在该目录执行 `npm install --production` 安装必要依赖，再运行 `npm start` 启动后端。
默认账号：admin
默认密码：123456
