# 爪爪日常 · 微信小程序

一个包含宠物档案、喂食与排便记录、AI 聊天、AI Q 版头像、天气提醒和资料管理的交互式 MVP。

## 运行

1. 打开微信开发者工具。
2. 选择“导入项目”，目录指向本文件夹。
3. AppID 可使用测试号，编译即可预览。

## 数据与 AI

- 档案、喂食、排便和聊天记录存储在 `wx` 本地存储中。
- “AI聊聊”通过本机代理调用 DeepSeek，API Key 不会进入小程序代码或安装包；服务不可用时自动回退到离线建议。
- 默认模型为 `deepseek-v4-flash`。如需使用 Pro，可在 `server/.env.local` 中设置 `DEEPSEEK_MODEL=deepseek-v4-pro`。
- 本地启动代理：`powershell -ExecutionPolicy Bypass -File .\Start-AI-Proxy.ps1`。
- 正式发布时需要把 `server/deepseek-proxy.js` 部署到 HTTPS 服务，在小程序中通过 `wx.setStorageSync('paw_ai_proxy_url', 'https://你的域名/api/chat')` 设置地址，并在微信公众平台配置 request 合法域名。
- “AI Q版头像”通过本机代理调用即梦 `image2image`；需要先安装 `dreamina` CLI 并完成 OAuth 登录，生成会消耗即梦积分。

## 实时天气

- 档案页使用 Open-Meteo 获取当前位置的气温和未来 24 小时逐小时降雨概率，无需 API Key。
- 本地模拟器已关闭域名校验，可直接测试；真机或发布前需在微信公众平台把 `https://api.open-meteo.com` 加入 request 合法域名。
- 用户拒绝定位时使用上海坐标作为默认演示位置；接口不可用时显示离线安全提示。
- 健康与用药信息仅用于日常记录和风险提示，不替代兽医诊断或处方。

## 原创素材

`assets/momo-chibi.png` 为本项目使用 imagegen 生成的原创 Q 版头像。
