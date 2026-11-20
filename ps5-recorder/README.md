# PS5 录制（DeepSeek Harness 插件）

把「PS5 → 采集卡 → OBS 录制 → 整理成片 → 上传 YouTube」收进侧边栏的一个按钮。

- **一键开始**：填游戏英文名 → 点「开始录制」。插件自动启动 OBS，按 1080p60 / H.264 / MKV 录采集卡画面，并自动打开游戏音频（录完恢复原静音状态）。
- **暂停 / 继续 / 停止**：暂停的片段不会进入成片；一段录制 = 一集。
- **自动整理**：停止后用 ffmpeg **无损转封装**成 MP4（不重新编码），按 `游戏 | EP 01` 命名，并抽一帧做封面。
- **确认后上传**：成片先进入「待确认上传」，点「确认上传」才发到自己的 YouTube 频道；可在设置里开启「停止后自动上传」。
- **上传能力**：标题/简介/标签/可见性/播放列表可设；支持续传、失败重试，队列重启后保留；完成后弹出 YouTube Studio 卡片。
- **高画质录制**：自动写入 OBS 硬件编码器质量（默认 85，设置里可调 1–100）。

面板在侧边栏的「PS5 录制」图标；顶部实时显示 OBS 连接、采集卡信号、录制/暂停、YouTube 连接状态。

## 要求

| 需要 | 说明 |
| --- | --- |
| macOS + OBS Studio | 用 OBS 自带的 obs-websocket v5 控制，不装 OBS 插件。OBS 需能正常预览采集卡。 |
| ffmpeg | `brew install ffmpeg`，用于 MKV→MP4 与封面。 |
| 采集卡 | 任意 UVC 采集卡；新卡到了可随时在「设置 › 画面」里刷新并切换设备。 |
| Google 账号 | 自动上传需要一次性创建免费 Google Cloud OAuth「桌面应用」客户端（建议 Personal 模式）。 |

**PS5 必须关闭 HDCP**：`设置 › 系统 › HDMI › 启用 HDCP` → 关闭，否则采集卡拿不到画面。

## 首次配置

1. 在面板点一次「准备 OBS」。插件会把录制路径设为 `~/Movies/PS5`、容器 MKV、编码 H.264 硬件、60 fps，并启用 OBS 的 WebSocket 服务器。**如果 OBS 当时正在运行，请退出后重新打开一次**，让 WebSocket 设置生效。
2. 创建 Google Cloud OAuth 客户端：
   - 用要上传的账号登录 [Google Cloud Console](https://console.cloud.google.com/)，新建项目；
   - [Google Auth Platform](https://console.cloud.google.com/auth/overview) 开始使用，用户类型选 **Personal（个人）**（可避免 7 天令牌过期与「未验证应用」提示；没有该选项则选 External 并把自己加入测试用户）；
   - 在 **API 和服务 › 库** 启用 **YouTube Data API v3**；
   - 在 **Google Auth Platform › 客户端** 新建 **桌面应用** 类型的 OAuth 客户端，复制客户端 ID 与密钥。
3. 把 ID/密钥填进「设置 › 上传」，保存后点「连接 YouTube」并在浏览器里授权。
4. 填游戏名，集数留空自动 +1，点「开始录制」。

## 只有一台显示器

插件只录采集卡画面，不用盯着 OBS：

- **推荐**：采集卡 HDMI 环出（OUT）接显示器，PS5 直出、零延迟，OBS 后台录。
- 没有环出：OBS `视图 › 全屏投影（场景）` 投到显示器上玩。
- **声音**：优先走 HDMI 环出/显示器音频；旧采集卡若只提供视频、没有 USB 音频，面板「游戏音频」会变成橙色提示，此时录出来的成片可能没有声音，需要从采集卡环出或主机端另接音频。

## 文件与数据

| 内容 | 位置 |
| --- | --- |
| 成片、封面 | `~/Movies/PS5/`（可改） |
| 设置、集数、上传队列 | `~/.dsh/ps5-recorder/state.json` |
| YouTube 令牌（0600，仅本机） | `~/.dsh/ps5-recorder/youtube-tokens.json` |

插件 HTTP 接口只监听本机，并校验 Origin；页面拿不到密钥（只有「是否已保存」布尔值）。

## 常见问题

- **采集卡无信号/黑屏**：PS5 开机、HDMI 插采集卡 IN、显示器插 OUT、关闭 HDCP，然后在 OBS 重选设备（插件设置里也能切）。
- **OBS 连接失败**：WebSocket 设置要重启 OBS 才生效。
- **找不到 ffmpeg**：`brew install ffmpeg` 后点刷新。
- **YouTube 几天后失效**：OAuth 项目是 External + 测试模式，refresh token 7 天过期；改用 Personal 模式或发布为「生产」，重新连接。
- **上传中断**：队列里点重试，会断点续传。
- **上传额度**：每个 Cloud 项目每天 100 次 `videos.insert`（1 单位/次），太平洋时间零点重置。

## 代码结构

- `index.js` — Host 半：OBS 控制、成片整理、上传队列、HTTP API（`/ps5-recorder-api`）。
- `lib/ws.mjs` — 极简 RFC 6455 WebSocket 客户端（零依赖）。
- `lib/obs.mjs` — obs-websocket v5 客户端，自动从 OBS 配置读取端口/密码。
- `lib/pipeline.mjs` — ffmpeg 转封装 / 重命名 / 封面。
- `lib/youtube.mjs` — OAuth（loopback + PKCE）、断点续传、播放列表、封面。
- `lib/store.mjs` — `~/.dsh/ps5-recorder` 状态与令牌。
- `client.js` — React 面板（注册到 `main` + `sidebar.panellist`）。
- `docs/DETAIL.md`、`docs/DETAIL.zh.md` — 插件详情页的单图文档；`docs/preview.svg` 为插图。

开发调试脚本在仓库外的 `dev-tools/`（不属于插件包）。
