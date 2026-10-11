const cloud = require('wx-server-sdk')
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV})
const cache = new Map()
function failure(error) {
  const errCode = Number(error.errCode || error.errcode) || 0
  const message = String(error.errMsg || error.errmsg || error.message || '')
  const reason = errCode === 41030 ? 'page_unavailable'
    : errCode === -604101 || /permission|access denied|unauthorized|api unauthorized|api not found/i.test(message) ? 'permission_denied'
      : /timeout|timed out/i.test(message) ? 'timeout'
        : message === 'invalid_image' ? 'invalid_image' : 'service_unavailable'
  // 只记录诊断分类和错误码，不返回凭证、调用上下文或内部堆栈。
  console.warn('pet-fun-code failed', { errCode, reason })
  return { ok: false, error: 'miniprogram_code_unavailable', errCode, reason }
}
exports.main = async(event={}) => {
  const tool=['age','personality','bingo'].includes(event.tool) ? event.tool:'age'
  const envVersion=['release','trial','develop'].includes(event.envVersion) ? event.envVersion:'release'
  const key=tool+'_'+envVersion
  if(cache.has(key)) return cache.get(key)
  try {
    const result=await cloud.openapi.wxacode.getUnlimited({scene:tool,page:'pages/play/play',width:280,checkPath:envVersion==='release',envVersion,isHyaline:false})
    if(result.errCode || result.errcode) return failure(result)
    if(!result.buffer) throw new Error('invalid_image')
    const buffer=Buffer.from(result.buffer)
    // Reject JSON error buffers instead of labelling them as images.
    if(buffer.length<100 || (buffer[0]!==0xff && buffer[0]!==0x89)) {
      try { return failure(JSON.parse(buffer.toString('utf8'))) } catch (_) { throw new Error('invalid_image') }
    }
    const response={ok:true,base64:buffer.toString('base64'),mime:buffer[0]===0xff?'jpg':'png'}
    cache.set(key,response)
    return response
  } catch(error) { return failure(error) }
}
