const cloud = require('wx-server-sdk')
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV})
const cache = new Map()
exports.main = async(event={}) => {
  const tool=['age','personality','bingo'].includes(event.tool) ? event.tool:'age'
  const envVersion=['release','trial','develop'].includes(event.envVersion) ? event.envVersion:'release'
  const key=tool+'_'+envVersion
  if(cache.has(key)) return cache.get(key)
  try {
    const result=await cloud.openapi.wxacode.getUnlimited({scene:tool,page:'pages/play/play',width:280,checkPath:envVersion==='release',envVersion,isHyaline:false})
    if(!result.buffer || (result.errCode && result.errCode!==0)) throw new Error('code_unavailable')
    const buffer=Buffer.from(result.buffer)
    // Reject JSON error buffers instead of labelling them as images.
    if(buffer.length<100 || (buffer[0]!==0xff && buffer[0]!==0x89)) throw new Error('invalid_image')
    const response={ok:true,base64:buffer.toString('base64'),mime:buffer[0]===0xff?'jpg':'png'}
    cache.set(key,response)
    return response
  } catch(error) { return {ok:false,error:'miniprogram_code_unavailable'} }
}
