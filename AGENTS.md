# AGENTS.md — 给 AI 助手的项目指南

本文件是这个仓库的「AI 交接单」。任何 AI 助手在改动代码前，请先读本文件，再按需阅读下列文档。

## 先读什么

| 顺序 | 文件 | 用途 |
| --- | --- | --- |
| 1 | `README.md` | 项目概览、换电脑恢复步骤 |
| 2 | `使用说明.md` | 面向用户的功能、配置、实测结论、已知限制 |
| 3 | `ps5-recorder/README.md` | 插件安装、代码结构、常见问题 |
| 4 | `research/dsh-plugin-contract.md` | DSH 插件 Host/Client 契约、`plugin_manager` 用法 |
| 5 | `research/youtube-upload-facts.md` | YouTube Data API、OAuth、上传额度等事实 |

## 项目是什么

一个 DeepSeek Harness（DSH）本地插件：控制 OBS 录制 PS5 采集卡画面，停止后用 ffmpeg 无损转封装、命名、生成封面，再上传到用户自己的 YouTube 频道。

- **不是**独立网页应用，**没有**构建步骤，**没有** npm 运行时依赖（只用 Node 内置模块）。
- Host 半在 `ps5-recorder/index.js`，通过 DSH 的 `webServer` 暴露 `/ps5-recorder-api/*`（仅监听本机、校验 Origin）。
- Client 半在 `ps5-recorder/client.js`，是 React 面板，注册到 `main` 与 `sidebar.panellist`，通过 `fetch` 调本机 API。
- 插件通过 `ps5-recorder/cordis.patch.yml` 被 DSH 加载。

## 数据流

```text
PS5 ─HDMI─> 采集卡 ─USB─> OBS ─WebSocket(obs-websocket v5)─> 插件
                                                              │
                 停止录制 ─> ffmpeg 无损转封装 MP4 ─> 命名/封面 ─> 上传队列
                                                              │
                                            YouTube Data API v3（OAuth 本机回调 + PKCE）
```

## 本机数据（不要提交）

| 内容 | 位置 |
| --- | --- |
| 设置、集数、上传队列 | `~/.dsh/ps5-recorder/state.json` |
| YouTube 令牌（0600） | `~/.dsh/ps5-recorder/youtube-tokens.json` |
| 成片、封面 | `~/Movies/PS5/`（可在设置中改） |

## 开发与验证

环境：macOS、Node.js（DSH 自带运行时即可）、OBS Studio、ffmpeg。

```bash
node --version
ffmpeg -version
```

本仓库没有 `npm install` 步骤。调试脚本直接运行，例如：

```bash
node dev-tools/remux-test.mjs      # MKV → MP4 无损转封装
node dev-tools/encoder-test.mjs    # 编码器检查
node dev-tools/queue-upload-integration.mjs  # 本地模拟 YouTube，验证上传/续传/刷新令牌
node dev-tools/ui-smoke.mjs        # jsdom + React 渲染面板冒烟测试
```

涉及真实 OBS / 采集卡的脚本（`record-test.mjs`、`stop-test.mjs`、`e2e-test.mjs` 等）需要 OBS 正在运行且采集卡有信号；不要在没有设备时把它们当作失败。

安装/重装插件：

```text
plugin_manager({ action: 'install_bundle', target: '<仓库绝对路径>/ps5-recorder' })
```

安装后需要刷新 DSH Web 页面才能看到侧边栏图标。

## 硬约束

1. **零 npm 依赖**：Host 端只用 Node 内置模块；不要为了小功能引入依赖。
2. **不要提交密钥/令牌/运行时状态**：遵守 `.gitignore`；不要把 `state.json`、`youtube-tokens.json`、OAuth 客户端密钥写进代码或文档。
3. **不要破坏 DSH profile**：不要手动改 `~/.dsh/profiles/*`，插件安装交给 `plugin_manager`。
4. **API 兼容**：改动 `/ps5-recorder-api/*` 时同步更新 `client.js`，保持请求/响应字段一致。
5. **ffmpeg 只做无损转封装**：默认不要重新编码（`-c copy`），除非用户明确要求。
6. **中文文档**：面向用户的说明保持中文；代码注释可中英混用。
7. **实测优先**：涉及 OBS/YouTube 的结论要标明「已实测」还是「未验证」，不要把推测写成事实。

## 常见坑

- OBS 的 WebSocket 设置修改后必须重启 OBS 才生效。
- PS5 必须关闭 HDCP，否则采集卡黑屏。
- OAuth 选 External + 测试模式时 refresh token 约 7 天过期；Personal 模式不会。
- YouTube 新频道封面接口可能 429 限流，上传成功但封面失败是已知情况，可后台重试或手动设置。
- 暂停是通过 OBS 暂停录制实现，暂停时长不计入成片；恢复后画面应连续。

## 改动完成前

- 至少跑一个相关的 `dev-tools/` 脚本，或在文档中说明为何无法运行。
- 检查 `git status`，确认没有把本机数据、录制成片、密钥加入暂存区。
- 如果改了用户可见行为，同步更新 `README.md` / `ps5-recorder/README.md` / `使用说明.md`。
