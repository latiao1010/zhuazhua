const {bingo}=require('./pet-bingo')
const {CLOUD_ENV_ID}=require('./cloud')
const {personality}=require('./pet-personality')
const {dateParts}=require('./pet-age')
function readResult(raw){
 let result;try{result=JSON.parse(raw[0]==='{'?raw:decodeURIComponent(raw))}catch(e){throw new Error('这张分享卡片暂时无法打开')}
 if(!result||result.v!==1||!['age','personality','bingo'].includes(result.t)||!['cat','dog'].includes(result.s)||!dateParts(result.e))throw new Error('分享信息不完整，请重新生成')
 const base={v:1,t:result.t,n:String(result.n||'毛孩子').slice(0,12),s:result.s,e:result.e}
 if(result.t==='bingo'){
  bingo(result.q)
  let peer
  if(result.peer){bingo(result.peer.q);if(!['cat','dog'].includes(result.peer.s))throw new Error('好友卡片信息无效');peer={n:String(result.peer.n||'好友的毛孩子').slice(0,12),s:result.peer.s,q:result.peer.q}}
  return {...base,q:result.q,...(peer?{peer}:{})}
 }
 if(result.t==='personality'){personality(result.q,result.s);return {...base,q:result.q}}
 const bounded=(value,max)=>Number.isInteger(value)&&value>=0&&value<=max
 if(!bounded(result.a,1200)||!bounded(result.d,36600)||!bounded(result.b,366)||!(result.h===null||bounded(result.h,200))||!['幼年期','青年成年期','成熟成年期','老年期','幼年成长期','青年期','成年期'].includes(result.g))throw new Error('分享信息无效，请重新生成')
 return {...base,a:result.a,d:result.d,b:result.b,h:result.h,g:result.g,x:!!result.x}
}
function viewResult(result){
 if(result.t==='bingo'){
  const b=bingo(result.q),peer=result.peer
  const common=peer?result.q.filter(i=>peer.q.includes(i)):[]
  return {...b,name:result.n,species:result.s,tool:result.t,date:result.e,peer,commonCount:common.length,
   cells:b.cells.map(c=>({...c,peerSelected:!!peer&&peer.q.includes(c.id),common:common.includes(c.id)})),
   quote:peer?(common.length?'这些小习惯，我们都有！':'各有各的可爱，也能做好朋友。'):b.quote,
   shareTitle:peer?`${result.n}和${peer.n}有 ${common.length} 个同款小习惯，你家呢？`:`我家${result.n}的行为宾果中了 ${b.count}/9 项，你家呢？`}
 }
 if(result.t==='personality'){const p=personality(result.q,result.s);return {...p,name:result.n,species:result.s,tool:result.t,date:result.e,shareTitle:`我家${result.n}是${p.title}，你家的呢？`}}
 const years=Math.floor(result.a/12),months=result.a%12
 const ageText=years?`${years} 岁${months?' '+months+' 个月':''}`:months?`${months} 个月`:'还不满 1 个月'
 return {tool:'age',name:result.n,species:result.s,date:result.e,ageText,humanAge:result.h,days:result.d,dayLabel:result.x?'已陪伴你':'来到世界',birthdayDays:result.b,stage:result.g,
  quote:result.h===null?'每一段陪伴，都值得被珍藏。':'原来，它也在认真长大。',shareTitle:result.h===null?`${result.n}的专属年龄卡片`:`我家${result.n}相当于人类约 ${result.h} 岁了！`}
}
function sharePath(result){return '/pages/play/result?r='+encodeURIComponent(JSON.stringify(result))}
function withTimeout(promise,ms){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('timeout')),ms);promise.then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)})})}
async function getCode(tool){
 if(!wx.cloud||!wx.cloud.callFunction)throw new Error('cloud_unavailable')
 let envVersion='release';try{envVersion=wx.getAccountInfoSync().miniProgram.envVersion||'release'}catch(e){}
 const fs=wx.getFileSystemManager(),root=wx.env.USER_DATA_PATH
 const prefix=`${root}/paw-fun-code-v2-${tool}-${envVersion}`
 for(const extension of ['png','jpg']){const filePath=prefix+'.'+extension;try{fs.accessSync(filePath);return {filePath,envVersion}}catch(e){}}
 // Public tool codes have no pet data and work in demo mode too.
 wx.cloud.init({env:CLOUD_ENV_ID})
 const response=await withTimeout(wx.cloud.callFunction({name:'pet-fun-code',config:{env:CLOUD_ENV_ID},data:{tool,envVersion}}),8000)
 const result=response&&response.result
 if(!result||!result.ok||typeof result.base64!=='string'||result.base64.length>900000)throw new Error('code_unavailable')
 const filePath=prefix+(result.mime==='jpg'?'.jpg':'.png')
 await new Promise((resolve,reject)=>fs.writeFile({filePath,data:result.base64,encoding:'base64',success:resolve,fail:reject}))
 return {filePath,envVersion}
}
function rounded(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();ctx.fillStyle=fill;ctx.fill()}
function text(ctx,value,x,y,size,color='#493b35',weight='normal'){ctx.font=`${weight} ${size}px sans-serif`;ctx.fillStyle=color;ctx.fillText(String(value),x,y)}
function portrait(ctx,x,y,species){
 ctx.save();ctx.translate(x,y)
 ctx.fillStyle='#fff5e8';ctx.beginPath();ctx.arc(0,0,75,0,Math.PI*2);ctx.fill()
 ctx.fillStyle='#ecc5a3';ctx.beginPath()
 if(species==='cat'){ctx.moveTo(-48,-21);ctx.lineTo(-48,-65);ctx.lineTo(-8,-43);ctx.lineTo(8,-43);ctx.lineTo(48,-65);ctx.lineTo(48,-21)}else{ctx.ellipse(-44,0,17,47,-.3,0,Math.PI*2);ctx.ellipse(44,0,17,47,.3,0,Math.PI*2)}ctx.fill()
 ctx.fillStyle='#ffe1b8';ctx.beginPath();ctx.ellipse(0,0,50,49,0,0,Math.PI*2);ctx.fill()
 ctx.fillStyle='#fff5e9';ctx.beginPath();ctx.ellipse(0,18,31,23,0,0,Math.PI*2);ctx.fill()
 ctx.fillStyle='#654a3d';[-18,18].forEach(v=>{ctx.beginPath();ctx.arc(v,-7,4,0,Math.PI*2);ctx.fill()})
 ctx.beginPath();ctx.moveTo(-6,10);ctx.lineTo(6,10);ctx.lineTo(0,17);ctx.closePath();ctx.fill()
 ctx.lineWidth=2;ctx.strokeStyle='#90654e';ctx.beginPath();ctx.moveTo(0,17);ctx.lineTo(0,25);ctx.moveTo(-9,25);ctx.quadraticCurveTo(0,32,9,25);ctx.stroke()
 ctx.fillStyle='#f7bda5';[-33,33].forEach(v=>{ctx.beginPath();ctx.ellipse(v,13,8,5,0,0,Math.PI*2);ctx.fill()});ctx.restore()
}
function loadImage(canvas,path){return new Promise((resolve,reject)=>{const img=canvas.createImage();img.onload=()=>resolve(img);img.onerror=reject;img.src=path})}
async function drawPoster(canvas,model,code){
 const w=600,h=880;canvas.width=w*2;canvas.height=h*2;const ctx=canvas.getContext('2d');ctx.scale(2,2)
 ctx.fillStyle=model.tool==='age'?'#fff2e8':'#eff8f2';ctx.fillRect(0,0,w,h)
 rounded(ctx,28,28,544,824,30,'#fffdf9');text(ctx,'爪爪日常  /  陪伴小发现',58,73,17,'#a88772')
 if(model.photo){
  const img=await withTimeout(loadImage(canvas,model.photo),5000)
  const side=Math.min(img.width,img.height)
  ctx.save();ctx.beginPath();ctx.arc(300,175,75,0,Math.PI*2);ctx.clip();ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,225,100,150,150);ctx.restore()
 }else portrait(ctx,300,175,model.species)
 ctx.textAlign='center';text(ctx,model.name,300,287,31,'#493b35','bold')
 if(model.tool==='age'){
  text(ctx,'今年 '+model.ageText,300,329,23,'#9a7f70')
  text(ctx,'相当于人类约',300,380,21,'#a38270')
  text(ctx,model.humanAge===null?'超出参考范围':model.humanAge,300,457,model.humanAge===null?32:78,'#cb7857','bold')
  if(model.humanAge!==null)text(ctx,'岁',368,453,25,'#b27e62')
  rounded(ctx,58,486,484,91,20,'#fff2e7');text(ctx,model.dayLabel+' '+model.days+' 天',300,523,27,'#765542','bold');text(ctx,'当前阶段：'+model.stage,300,556,19,'#9c7b67')
  text(ctx,model.birthdayDays===0?'今天生日快乐！':`距离下一个生日还有 ${model.birthdayDays} 天`,300,613,23,'#846b58')
  text(ctx,model.quote,300,654,21,'#b38368')
 }else if(model.tool==='bingo'){
  text(ctx,model.peer?`同款对照 · 共同命中 ${model.commonCount} 项`:`行为宾果 · 中了 ${model.count} / 9 项`,300,329,29,'#668b74','bold')
  model.cells.forEach((item,i)=>{const x=60+(i%3)*164,y=351+Math.floor(i/3)*88;rounded(ctx,x,y,152,78,14,item.common?'#d6e9cf':item.selected?'#e4f0df':item.peerSelected?'#fff0df':'#f5f2ed');ctx.textAlign='left';text(ctx,model.peer?(item.common?'共同':item.selected?'我家':item.peerSelected?'好友':'—'):(item.selected?'✓':'·'),x+12,y+24,model.peer?13:18,'#6c8f73');ctx.textAlign='center';text(ctx,item.label,x+76,y+53,19,item.selected?'#4e735a':'#978d83')})
  text(ctx,model.peer?`好友：${model.peer.n}`:model.lines?`BINGO！连成 ${model.lines} 条线`:'每一个小习惯，都很像它',300,645,22,'#759179')
  text(ctx,model.quote,300,682,19,'#8a907b')
 }else{
  text(ctx,'你家'+(model.species==='cat'?'猫咪':'狗狗')+'是',300,327,22,'#8da08e');text(ctx,model.title,300,375,40,'#668b74','bold');text(ctx,model.tag,300,414,20,'#92927d')
  model.metrics.forEach((item,i)=>{const y=465+i*46;ctx.textAlign='left';text(ctx,item.label,62,y,20,'#8b7a6c');rounded(ctx,169,y-14,285,10,5,'#edf1e8');if(item.value)rounded(ctx,169,y-14,285*item.value/100,10,5,'#a6c5ac');ctx.textAlign='right';text(ctx,item.value+'%',530,y,21,'#759179','bold')});ctx.textAlign='center';text(ctx,model.quote,300,668,19,'#8a907b')
 }
 ctx.textAlign='left';text(ctx,model.tool==='age'?'年龄为科普估算，不代表实际生理年龄':model.tool==='bingo'?'日常趣味观察 · 勾选属于它的小习惯':'趣味观察结果 · 指数不是行为概率',60,712,15,'#a7978b');text(ctx,'生成于 '+model.date,60,735,14,'#b4a397')
 if(code){const img=await withTimeout(loadImage(canvas,code.filePath),5000);ctx.drawImage(img,435,738,98,98);text(ctx,model.tool==='bingo'?'你家中了几项？':'你也来测一测',60,788,24,'#8d6850','bold');text(ctx,code.envVersion==='release'?'长按识别小程序码':'开发 / 体验码，仅授权用户可访问',60,817,15,'#a8917c')}
 else{text(ctx,model.tool==='bingo'?'你家中了几项？':'你也来测一测',60,785,24,'#8d6850','bold');text(ctx,'微信搜索「爪爪日常」',60,818,18,'#a8917c')}
 return new Promise((resolve,reject)=>wx.canvasToTempFilePath({canvas,x:0,y:0,width:w*2,height:h*2,destWidth:w*2,destHeight:h*2,fileType:'png',success:r=>resolve(r.tempFilePath),fail:reject}))
}
module.exports={readResult,viewResult,sharePath,getCode,drawPoster}
