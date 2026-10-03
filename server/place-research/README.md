# 地点线索研究版

启动（Python 3，无第三方依赖）：

```sh
python3 server/place-research/app.py
```

访问 http://127.0.0.1:8766 。启动时幂等导入 seed.json 中 3 篇帖子与 5 个地点，数据库在 `server/generated/place-research.sqlite3`（已被 Git 忽略）。这是本地 SQLite 研究库，未写入微信正式云数据库。

## 高德查询

在已被 Git 忽略的 `server/.env.local` 中配置 `AMAP_WEB_SERVICE_KEY=你的Web服务Key`，或设置同名环境变量。不要提交 Key。

```sh
python3 server/place-research/app.py --match
```

命令对五个地点各发起一次上海市范围关键词搜索，最多保存五个候选/地点；随后刷新预览。不会自动把排名第一的结果当成匹配成功，也不会把地图结果当成宠物友好证明。失败可重新运行。

接口依据：[高德 POI 搜索 2.0](https://developer.amap.com/api/webservice/guide/api-advanced/newpoisearch)。POI 字段、经纬度与名称为接口真实返回；坐标为高德 GCJ-02。候选数据的持久保存及后续产品使用须符合账号对应的服务授权。

## 表结构

- posts：原帖 ID、标题、作者、日期原文、日期类型、采集日、来源链接。年份未知时 published_at 为空；编辑时间不冒充发布时间。
- places：地点名称、检索词、业务类型、城市。
- evidence：帖子和地点的关联、作者描述、限制/纠错、核验状态。verified_at 当前均为空。
- matches：真实接口查询时间、状态、候选 POI、错误信息。未请求时没有结果行。

原始线索不是官方场所政策。南翔印象城保留为信息冲突，不能推荐。正式云端入库与候选人工确认界面尚未实现。
