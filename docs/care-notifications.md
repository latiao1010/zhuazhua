# 护理通知上线配置

客户端入口：“我的 → 数据同步 · 提醒 · 就诊摘要”。未配置时明确显示“暂未配置”，不会宣称已开启微信通知。

1. 在微信公众平台选择一个只含“护理事项（thing）”和“提醒时间（time/date）”的订阅消息模板。其他字段的模板需扩展 `care-reminders.js` 字段映射后使用。
2. 在 `pet-data` 云函数环境变量中配置：
   - `CARE_REMINDER_TEMPLATE_ID`：实际模板 ID。
   - `CARE_REMINDER_FIELDS`：实际字段映射 JSON，例如 `{"label":"thing1","date":"time2"}`。字段必须与模板一致，示例不可直接当作实际配置。
   - `CARE_REMINDER_STATE`：`developer`、`trial` 或 `formal`，默认 `formal`。
3. 部署整个 `cloudfunctions/pet-data`，含 `care-reminders.js` 和 `config.json`；启用 `careReminderDispatch` 每 5 分钟触发器及 `subscribeMessage.send` 权限。
4. 新建云数据库集合 `pet_care_reminders`（服务端会尝试自动创建）；客户端访问权限设置为不可读写，仅通过云函数操作。
5. 在真机为一个未来日期、时间订阅一次。验证拒绝授权不创建通知、接受后仅发送一次、暂停不发送、修改护理日期或已完成护理不发送旧提醒。

时间按北京时间解释，触发后可能有最多约 5 分钟调度延迟。一次授权只安排一次通知，调整日期后须重新订阅。失败或结果不明确时不自动重发，避免重复通知；用户可在页面查看状态并重新订阅。

这是接入配置说明，不代表云函数已经部署或真机消息已验证。
