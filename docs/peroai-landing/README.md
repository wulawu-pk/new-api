# peroai 主站首页（参考用）

这是 https://peroai.cc/landing/ 当前线上首页的原样副本（2026-11-21 从部署目录复制，与线上文件逐字节一致）。

它**不参与** new-api 的构建和镜像（`docs/` 在 `.dockerignore` 里），线上首页由服务器上的 Caddy 直接提供静态文件。
放在这里只是给新前端设计做参考：文案、板块、价格表和代码示例的结构都可以照着它来。

## 文件

- `index.html`：整页，样式和脚本都内联在里面。
- `brand/peroai-logo.svg`：logo。线上路径是 `/brand/peroai-logo.svg`。

## 它用到的接口

页面在浏览器里只调两个公开接口，不需要登录：

- `GET /api/status`：站点状态
- `GET /api/pricing`：模型、分组和价格（`usable_group` 是 `{分组: 中文说明}`，分组倍率在 `group_ratio`）

本地预览时这两个请求会失败（没有后端），价格区会是空的。想看到真实数据，可以在浏览器直接打开 https://peroai.cc/landing/ 对照。

## 现行设计约定（「纸面」）

- 背景 `#F6F5F0`，文字 `#15171A`，次要文字 `#62666D`，边框 `#E1DFD7`，唯一强调色 `#1D6B53`（浅色 `#E2EEE8`）
- 字体 IBM Plex Sans / Mono，加中文回退
- 圆角 7–12px，不用渐变
- 品牌名一律小写 `peroai`
- 价格按美元显示（¥1 = $1）

这些是现在的风格，重新设计可以改。改动请开分支、发合并请求到 `peroai`。
