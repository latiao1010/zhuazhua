// 每次用户主动订阅只创建一条待发送通知，不把一次授权当作永久授权。
const crypto = require('crypto')
const COLLECTION = 'pet_care_reminders'
const LABELS = { deworming:'驱虫', medicine:'用药提醒', vaccine:'疫苗接种', bath:'洗澡护理', dental:'刷牙护理', nail:'修剪指甲' }
function configuration() {
  const templateId = process.env.CARE_REMINDER_TEMPLATE_ID || ''
  let fields = {}
  try { fields = JSON.parse(process.env.CARE_REMINDER_FIELDS || '{}') } catch (_) {}
  const ready = !!templateId && /^thing\d+$/.test(fields.label || '') && /^(time|date)\d+$/.test(fields.date || '')
  return { templateId, fields, ready }
}
function createService({ cloud, db, ensureCollection, getAllData }) {
  async function handle(action, openid, event) {
    await ensureCollection(COLLECTION)
    const config = configuration()
    if (action === 'getCareReminderConfig') {
      const result = await db.collection(COLLECTION).where({ openid }).orderBy('updatedAt','desc').limit(20).get()
      return { ok:true, ready:config.ready, templateId:config.ready ? config.templateId : '', jobs:result.data.map(item => ({ _id:item._id, label:item.label, date:item.date, time:item.time, status:item.status, statusText:({ pending:'已订阅，等待发送', sending:'发送处理中', sent:'已发送', paused:'已暂停', cancelled:'护理已完成或日期变化，请重新订阅', failed:'发送未成功，请重新订阅' })[item.status] || item.status })) }
    }
    if (action === 'pauseCareReminder') {
      await db.collection(COLLECTION).where({ _id:String(event.id || ''), openid, status:'pending' }).update({ data:{ status:'paused', updatedAt:Date.now() } })
      return { ok:true }
    }
    if (!config.ready) throw new Error('通知模板尚未配置')
    if (!LABELS[event.key] || !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time || '')) throw new Error('提醒设置不正确')
    const result = await getAllData(openid)
    const care = result.data.care || {}
    const date = care[event.key]
    const dueAt = Date.parse(`${date}T${event.time}:00+08:00`)
    if (!Number.isFinite(dueAt) || dueAt <= Date.now()) throw new Error('请先在护理详情设置未来的提醒日期和时间')
    const id = crypto.createHash('sha256').update(`${openid}:${event.key}`).digest('hex')
    const record = { openid, key:event.key, label:LABELS[event.key], date, time:event.time, dueAt, status:'pending', updatedAt:Date.now(), scope:result.share && result.share.groupId || '', templateId:config.templateId }
    await db.collection(COLLECTION).doc(id).set({ data:record })
    return { ok:true }
  }
  async function dispatch() {
    const config = configuration()
    if (!config.ready) return { ok:false, error:'通知模板尚未配置' }
    await ensureCollection(COLLECTION)
    // 每次处理至多 100 条，下一次触发继续处理剩余记录。
    const jobs = await db.collection(COLLECTION).where({ status:'pending', dueAt:db.command.lte(Date.now()) }).limit(100).get()
    let sent = 0
    for (const job of jobs.data) {
      const lock = await db.collection(COLLECTION).where({ _id:job._id, status:'pending', updatedAt:job.updatedAt }).update({ data:{ status:'sending' } })
      if (!lock.stats || !lock.stats.updated) continue
      try {
        const result = await getAllData(job.openid)
        const care = result.data.care || {}
        if ((result.share && result.share.groupId || '') !== job.scope || care[job.key] !== job.date || care[job.key + 'Last'] >= job.date || job.templateId !== config.templateId) {
          await db.collection(COLLECTION).doc(job._id).update({ data:{ status:'cancelled', updatedAt:Date.now() } })
          continue
        }
        const data = { [config.fields.label]:{ value:job.label }, [config.fields.date]:{ value:config.fields.date.startsWith('time') ? `${job.date} ${job.time}` : job.date } }
        await cloud.openapi.subscribeMessage.send({ touser:job.openid, templateId:config.templateId, page:'pages/account/account', data, miniprogramState:process.env.CARE_REMINDER_STATE || 'formal', lang:'zh_CN' })
        await db.collection(COLLECTION).doc(job._id).update({ data:{ status:'sent', updatedAt:Date.now() } })
        sent++
      } catch(error) {
        // 结果不明确时不自动重发，避免一次提醒重复打扰。
        await db.collection(COLLECTION).doc(job._id).update({ data:{ status:'failed', error:String(error.message || error).slice(0,200), updatedAt:Date.now() } })
      }
    }
    return { ok:true, sent }
  }
  return { handle, dispatch }
}
module.exports = { configuration, createService }
