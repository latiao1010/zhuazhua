const {readResult,viewResult,sharePath,getCode,drawPoster}=require('../../utils/fun-share')
Page({
 data:{choosingPhoto:false,model:null,error:'',poster:'',generating:false,codeState:'loading',codeVersion:'',posterError:'',saving:false},
 onLoad(options={}){
  this.alive=true
  try{this.result=readResult(String(options.r||''));this.setData({model:viewResult(this.result)});wx.setNavigationBarTitle({title:this.result.t==='bingo'?'专属行为宾果':this.result.t==='age'?'专属年龄卡片':'专属性格卡片'});if(wx.showShareMenu)wx.showShareMenu({menus:['shareAppMessage','shareTimeline']})}
  catch(e){this.setData({error:e.message})}
 },
 onReady(){if(this.result)this.generate()},
 onUnload(){this.alive=false},
 canvas(){return new Promise((resolve,reject)=>this.createSelectorQuery().select('#shareCanvas').fields({node:true,size:true}).exec(res=>res[0]&&res[0].node?resolve(res[0].node):reject(new Error('canvas_unavailable'))))},
 async generate(){
  if(this.data.generating||!this.result)return
  this.setData({generating:true,poster:'',posterError:'',codeState:'loading'})
  try{
   let code=null
   try{code=await getCode(this.result.t)}catch(e){}
   if(!this.alive)return
   const canvas=await this.canvas()
   let poster
   try{poster=await drawPoster(canvas,this.data.model,code)}catch(e){if(!code)throw e;code=null;poster=await drawPoster(canvas,this.data.model,null)}
   if(this.alive)this.setData({poster,codeState:code?'ready':'unavailable',codeVersion:code?code.envVersion:''})
  }catch(e){if(this.alive)this.setData({posterError:'卡片暂未生成成功，请点击重试'})}
  finally{if(this.alive)this.setData({generating:false})}
 },
 choosePhoto(){
  if(this.data.generating||this.data.choosingPhoto)return
  this.setData({choosingPhoto:true})
  wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['compressed'],success:r=>{
   if(!this.alive)return
   const file=r.tempFiles&&r.tempFiles[0]
   if(!file||!file.tempFilePath)return
   if(file.size>15*1024*1024){wx.showToast({title:'请换一张小于 15MB 的照片',icon:'none'});return}
   this.setData({'model.photo':file.tempFilePath});this.generate()
  },fail:e=>{if(!/cancel/i.test(e.errMsg||''))wx.showToast({title:'未能读取照片，请检查相册权限后重试',icon:'none'})},complete:()=>{if(this.alive)this.setData({choosingPhoto:false})}})
 },
 removePhoto(){if(this.data.generating)return;this.setData({'model.photo':''});this.generate()},
 photoError(){if(this.alive&&this.data.model.photo){this.setData({'model.photo':'',poster:'',posterError:'照片读取失败，请换一张照片后重新生成'})}},
 compare(){
  if(!this.result||this.result.t!=='bingo')return
  const {v,t,n,s,q,e}=this.result
  wx.navigateTo({url:'/pages/play/play?tool=bingo&peer='+encodeURIComponent(JSON.stringify({v,t,n,s,q,e})),fail:()=>wx.showToast({title:'页面暂时无法打开，请重试',icon:'none'})})
 },
 preview(){if(this.data.poster)wx.previewImage({urls:[this.data.poster],current:this.data.poster})},
 posterAction(){if(this.data.poster)this.shareImage();else this.generate()},
 save(){
  if(!this.data.poster||this.data.saving)return
  this.setData({saving:true})
  wx.saveImageToPhotosAlbum({filePath:this.data.poster,success:()=>wx.showToast({title:'已保存到相册'}),fail:error=>{
   if(/cancel/i.test(error.errMsg||''))return
   if(/auth|deny|denied/i.test(error.errMsg||''))wx.showModal({title:'需要相册权限',content:'允许保存图片后，就能把卡片留在相册里。',confirmText:'去设置',success:r=>{if(r.confirm)wx.openSetting({})}})
   else wx.showToast({title:'保存失败，可先预览图片后长按保存',icon:'none'})
  },complete:()=>{if(this.alive)this.setData({saving:false})}})
 },
 shareImage(){if(!this.data.poster)return;if(wx.showShareImageMenu)wx.showShareImageMenu({path:this.data.poster,needShowEntrance:true,entrancePath:sharePath(this.result),fail:error=>{if(!/cancel/i.test(error.errMsg||''))this.preview()}});else this.preview()},
 tryTool(){const tool=this.result?this.result.t:'age';wx.redirectTo({url:'/pages/play/play?tool='+tool})},
 onShareAppMessage(){return this.result?{title:this.data.model.shareTitle,path:sharePath(this.result),...(this.data.poster?{imageUrl:this.data.poster}:{})}:{title:'发现毛孩子的小秘密',path:'/pages/play/play?tool=age'}},
 onShareTimeline(){return this.result?{title:this.data.model.shareTitle,query:'r='+encodeURIComponent(JSON.stringify(this.result)),...(this.data.poster?{imageUrl:this.data.poster}:{})}:{title:'陪伴小发现',query:''}}
})
