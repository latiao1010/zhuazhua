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

- 首页自动获取当前位置的天气，不再提供手选城市。使用微信 `wx.getFuzzyLocation({ type: 'wgs84' })`，只申请模糊位置；不申请精确位置，不回退到上海等默认城市，也不通过 IP 绕过定位拒绝。
- 首次如需隐私授权，首页显示“开启天气”和隐私指引入口；同意后才调用微信定位。已拒绝定位时显示“去授权”，由用户主动打开微信设置；不会定时反复弹授权窗。授权正常后进入首页自动加载。
- 天气使用 [Open-Meteo Forecast API](https://open-meteo.com/en/docs)，包含气温、体感、天气状况与未来 24 小时降水预报。它提供的是天气模型数据，并非实测站点数据。
- 城市名使用 [BigDataCloud 客户端逆地理编码接口](https://www.bigdatacloud.com/geocoding-apis/free-reverse-geocode-to-city-api)。只把刚经微信授权取得的模糊坐标从真机客户端发送给接口，不经服务器代理，不传旧手选城市坐标。服务商说明会使用坐标与 IP 的匿名配对改善定位数据；需在小程序隐私保护指引中披露此第三方处理。失败时显示“当前位置”，天气仍按定位坐标获取。
- 模拟器使用其模拟位置查询天气，跳过仅适用于用户真实设备位置的城市识别接口，并标注“模拟器位置”；真实城市识别需在手机上体验。
- 天气和位置仅在会话内存中缓存，不写入宠物档案或云端。位置最多复用 5 分钟、天气最多缓存 15 分钟；同一位置复用天气，改变位置后重新查询。手动刷新会重新定位。首页每 15 分钟更新，离开后停止定时刷新。
- 未授权、定位失败或天气接口失败时显示相应状态，不显示虚构天气；城市识别失败不影响坐标天气。时间按所在地时区显示，跨日降水标注今天/明天。

### 真机配置

1. 在微信公众平台的“开发管理 → 接口设置”申请开通 `wx.getFuzzyLocation`。代码已在 `app.json` 声明 `requiredPrivateInfos` 和 `scope.userFuzzyLocation` 的用途，但声明不等于后台权限开通。参考 [微信官方接口说明及类型定义](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts)。
2. 在公众平台完善隐私保护指引，声明模糊位置用于天气查询、城市识别，以及 Open-Meteo、BigDataCloud 的数据处理。实际获取位置前仍需用户授权。
3. 在公众平台配置 request 合法域名：`https://api.open-meteo.com`、`https://api.bigdatacloud.net`。本地模拟器关闭了域名校验，但不会替代公众平台配置。
4. 当前 Open-Meteo 免费接口限非商业用途；含广告、订阅或其他商业用途时需按 [使用条款](https://open-meteo.com/en/terms) 切换商业授权，密钥放后端。BigDataCloud 免费客户端接口遵守其 [公平使用要求](https://www.bigdatacloud.com/docs/article/why-is-reverse-geocoding-api-free)，不用于服务端或批量查询。

数据署名：天气 [Open-Meteo](https://open-meteo.com/)（CC BY 4.0），城市识别 [BigDataCloud](https://www.bigdatacloud.com/)。

## 原创素材

`assets/momo-chibi.png` 为本项目使用 imagegen 生成的原创 Q 版头像。
