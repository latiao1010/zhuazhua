const { instrument } = require('../../utils/analytics-page')
const analytics = require('../../utils/analytics')
const {readResult,viewResult,sharePath,getCode,drawPoster}=require('../../utils/fun-share')
Page(instrument('result', {
 data:{model:null,error:'',poster:'',generating:false,codeState:'loading',codeVersion:'',codeError:'',posterError:'',saving:false},
 onLoad(options={}){
  this.alive=true
  try{this.result=readResult(String(options.r||''));this.setData({model:viewResult(this.result)});wx.setNavigationBarTitle({title:this.result.t==='bingo'?'专属行为宾果':this.result.t==='age'?'专属年龄卡片':'专属性格卡片'});if(wx.showShareMenu)wx.showShareMenu({menus:['shareAppMessage','shareTimeline']})}
  catch(e){this.setData({error:e.message})}
  if(this.result){this.toolFlow=analytics.takeTool(this.result.t);analytics.stepFlow(this.toolFlow,1)}
 },
 onReady(){if(this.result)this.generate()},
 onUnload(){this.alive=false},
 canvas(){return new Promise((resolve,reject)=>this.createSelectorQuery().select('#shareCanvas').fields({node:true,size:true}).exec(res=>res[0]&&res[0].node?resolve(res[0].node):reject(new Error('canvas_unavailable'))))},
 async generate(){
  if(this.data.generating||!this.result)return false
  const forceCode=this.data.codeState==='unavailable'
  this.setData({generating:true,poster:'',posterError:'',codeState:'loading',codeError:''})
  const finish=analytics.startOperation(this.result.t,'poster')
  try{
   const code=await getCode(this.result.t,{force:forceCode})
   if(!this.alive){finish(null,true);return false}
   const canvas=await this.canvas()
   const poster=await drawPoster(canvas,this.data.model,code)
   if(!this.alive){finish(null,true);return false}
   this.setData({poster,codeState:'ready',codeVersion:code.envVersion})
   analytics.track(this.result.t,'complete','poster')
   finish()
   analytics.stepFlow(this.toolFlow,2)
   return true
  }catch(e){
   finish(e)
   analytics.failure(this.result.t,'poster',e)
   console.warn('带码分享图片生成失败',{reason:e.reason||e.message||'poster_failed',errCode:e.errCode||0})
   if(this.alive)this.setData({poster:'',posterError:'带小程序码的图片暂未生成，请稍后重试',codeState:'unavailable',codeVersion:'',codeError:e.reason||e.message||'poster_failed'})
   return false
  }
  finally{if(this.alive)this.setData({generating:false})}
 },
 preview(){if(this.data.poster)wx.previewImage({urls:[this.data.poster],current:this.data.poster})},
 async ensurePoster(){
  if(this.data.poster&&this.data.codeState==='ready')return true
  const ready=await this.generate()
  if(!ready&&this.alive)wx.showToast({title:'带码图片暂未生成，请重试',icon:'none'})
  return ready
 },
 async posterAction(){
  if(!this.alive||this.data.generating||this.data.saving)return
  if(await this.ensurePoster()&&this.alive)this.shareImage()
 },
 async save(){
  if(!this.alive||this.data.generating||this.data.saving)return
  if(!await this.ensurePoster())return
  // 图片检查会异步让出执行权，返回后再次拦截连点和已离开的页面。
  if(!this.alive||this.data.saving)return
  this.setData({saving:true})
  wx.saveImageToPhotosAlbum({
   filePath:this.data.poster,
   success:()=>{analytics.track(this.result.t,'complete','save_image');if(this.alive)wx.showToast({title:'已保存到手机相册'})},
   fail:error=>{
    if(!this.alive||/cancel/i.test(error.errMsg||''))return
    analytics.failure(this.result.t,'save_image',error)
    if(/auth|deny|denied/i.test(error.errMsg||'')){
     wx.showModal({title:'需要相册权限',content:'允许保存到相册后，即可将这张卡片保存到手机。',confirmText:'去设置',success:result=>{
      if(!result.confirm||!this.alive)return
      wx.openSetting({success:settings=>{if(this.alive&&settings.authSetting&&settings.authSetting['scope.writePhotosAlbum'])this.save()}})
     }})
    }else wx.showModal({title:'暂时无法保存',content:'可以打开图片后长按保存，或稍后重试。',confirmText:'查看图片',success:result=>{if(this.alive&&result.confirm)this.preview()}})
   },
   complete:()=>{if(this.alive)this.setData({saving:false})}
  })
 },
 shareImage(){
  if(!this.data.poster||this.data.codeState!=='ready')return
  if(!wx.showShareImageMenu){this.preview();return}
  analytics.track(this.result.t,'share','image_menu');analytics.stepFlow(this.toolFlow,3)
  wx.showShareImageMenu({path:this.data.poster,needShowEntrance:true,entrancePath:sharePath(this.result),fail:error=>{analytics.failure(this.result.t,'image_menu',error);if(!/cancel/i.test(error.errMsg||''))this.preview()}})
 },
 tryTool(){const tool=this.result?this.result.t:'age';wx.redirectTo({url:'/pages/play/play?tool='+tool})},
 onShareAppMessage(){return this.result?{title:this.data.model.shareTitle,path:sharePath(this.result),...(this.data.poster?{imageUrl:this.data.poster}:{})}:{title:'发现毛孩子的小秘密',path:'/pages/play/play?tool=age'}},
 onShareTimeline(){return this.result?{title:this.data.model.shareTitle,query:'r='+encodeURIComponent(JSON.stringify(this.result)),...(this.data.poster?{imageUrl:this.data.poster}:{})}:{title:'陪伴小发现',query:''}}
}))
