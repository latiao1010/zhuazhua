// 仅在 pet-analytics-qa 部署完成后，由模拟器 automation_evaluate 执行导出的函数。
// 真实云数据库写入限独立 QA 集合；不修改用户档案或正式统计集合。
module.exports = async function analyticsCloudSmoke() {
  const env = 'cloudbase-d3glshm6n124d98a4', name = 'pet-analytics-qa'
  wx.cloud.init({ env })
  const checks = [], call = async data => {
    const r = (await wx.cloud.callFunction({ name, config: { env }, data })).result
    if (!r || !r.ok) throw new Error(data.action + ': ' + (r?.error || 'empty'))
    return r
  }
  const check = (label, condition) => { if (!condition) throw new Error(label); checks.push(label) }
  try {
    const status = await call({ action: 'status' }); check('当前账号具备联调所需的管理员身份', status.admin === true)
    const now = Date.now(), tag = 'qa-' + now.toString(36), version = 'qa-' + now.toString(36)
    const event = { id: tag + '-click', time: now, module: 'age', kind: 'click', action: 'openDiscovery', schema: 2, version, platform: 'devtools', channel: 'unknown', session: tag + '-session' }
    const q = { reporter: tag + '-device', day: new Date(now + 8 * 3600000).toISOString().slice(0, 10), version, revision: 1, generated: 1, confirmed: 0, rejected: 0, overflow: 0, expired: 0, failedBatches: 0, partialBatches: 0, successfulBatches: 0, storageFailures: 0 }
    const first = await call({ action: 'collect', events: [event], quality: [q] }); check('真实云端确认点击和诊断', first.ids.includes(event.id) && first.qualityIds.length === 1)
    await call({ action: 'collect', events: [event], quality: [{ ...q, revision: 2, confirmed: 1, successfulBatches: 1 }] })
    const quality = await call({ action: 'delivery_summary', days: 1 }), row = quality.rows.find(r => r.version === version)
    check('重复点击只统计一次，诊断更新可读', row?.received === 1 && row.confirmed === 1 && row.generated === 1)
    const summary = await call({ action: 'summary', days: 1 }); check('点击进入云端汇总', summary.rows.some(r => r.module === 'age' && r.clicks >= 1))
    const submitted = await call({ action: 'feedback_submit', feedback: { id: tag + '-feedback', type: 'bug', module: 'age', message: '隔离联调验收：卡片生成测试反馈，不是真实用户反馈。', version, platform: 'devtools' } })
    const mine = await call({ action: 'feedback_mine' }), own = mine.rows.find(r => r.id === submitted.id)
    check('提交者可读取刚提交的反馈', !!own)
    const list = await call({ action: 'feedback_list' }); check('管理员列表包含反馈', list.rows.some(r => r.id === submitted.id))
    await call({ action: 'feedback_update', id: own.id, updatedAt: own.updatedAt, status: 'resolved', reply: '隔离联调验收回复：已验证处理结果可读。', fixVersion: version })
    const result = (await call({ action: 'feedback_mine' })).rows.find(r => r.id === own.id)
    check('提交者能看到回复和修复版本', result?.status === 'resolved' && result.reply && result.fixVersion === version && result.repliedAt > 0)
    const saved = await call({ action: 'release_save', release: { version, publishedAt: now, notes: '隔离联调验收记录，并非小程序实际上线。', goal: '验证上线记录保存和查询', updatedAt: 0 } })
    const releases = await call({ action: 'release_list' }); check('版本上线记录可保存并读取', releases.rows.some(r => r.id === saved.row.id && r.version === version))
    return { ok: true, checks, testVersion: version, collection: 'pet_usage_qa_20261010_v32', realSecondWechatAccountTested: false }
  } catch (error) { return { ok: false, checks, error: error.message, collection: 'pet_usage_qa_20261010_v32' } }
}
