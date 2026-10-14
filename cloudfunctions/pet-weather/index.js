const cloud = require('wx-server-sdk')
const { createService } = require('./weather')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const weather = createService()

exports.main = async (event = {}) => {
  // 只接受微信实际调用身份，不信任客户端传入的账号或上游 URL。
  if (!cloud.getWXContext().OPENID) return { ok: false, code: 'unauthorized' }
  return weather.getForecast(event)
}
