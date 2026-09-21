const {readResult}=require('../../utils/fun-share')
const {bingo}=require('../../utils/pet-bingo')
const store=require('../../utils/store')
const {calculateAge,SIZE_OPTIONS}=require('../../utils/pet-age')
const {questions,personality}=require('../../utils/pet-personality')
function kind(pet){return pet.species==='cat'||pet.type==='cat'||/猫|英短|美短|布偶|暹罗|缅因|加菲/.test(pet.breed||'')?'cat':'dog'}
Page({
 data:{peer:null,bingoCells:bingo([]).cells,bingoSelected:[],bingoCount:0,bingoLines:0,tool:'age',species:'dog',name:'',birthday:'',togetherSince:'',breed:'',size:1,sizeOptions:SIZE_OPTIONS,today:'',started:false,index:0,answers:[],question:{},selected:-1,progress:0,error:'',restored:false},
 onLoad(options={}){
  let scene='';try{scene=decodeURIComponent(options.scene||'')}catch(e){}
  const requested=options.tool||scene
  const tool=['age','personality','bingo'].includes(requested)?requested:'age'
  if(tool==='bingo'&&options.peer){try{const peer=readResult(options.peer);if(peer.t!=='bingo')throw new Error();this.peer={n:peer.n,s:peer.s,q:peer.q};this.setData({peer:this.peer})}catch(e){this.setData({error:'好友卡片已失效，仍可制作自己的宾果卡片'})}}
  const pet=store.get('pet')||{}, species=kind(pet)
  const weight=Number(pet.weight)||0,size=weight?weight<=9?0:weight<=23?1:weight<=41?2:3:1
  this.setData({tool,species,name:pet.name||'',birthday:pet.birthday||'',togetherSince:pet.togetherSince||'',breed:pet.breed||'',size,today:store.todayKey()})
  wx.setNavigationBarTitle({title:tool==='bingo'?'宠物行为宾果':tool==='age'?'宠物年龄计算器':'宠物性格测试'})
  if(wx.showShareMenu)wx.showShareMenu({menus:['shareAppMessage','shareTimeline']})
 },
 toggleBingo(e){
  const id=Number(e.currentTarget.dataset.id)
  if(!Number.isInteger(id)||id<0||id>8)return
  const selected=this.data.bingoSelected.includes(id)?this.data.bingoSelected.filter(v=>v!==id):this.data.bingoSelected.concat(id)
  const result=bingo(selected)
  this.setData({bingoSelected:selected,bingoCells:result.cells,bingoCount:result.count,bingoLines:result.lines})
 },
 clearBingo(){this.setData({bingoSelected:[],bingoCells:bingo([]).cells,bingoCount:0,bingoLines:0})},
 finishBingo(){this.goResult({v:1,t:'bingo',n:(this.data.name||'我家毛孩子').trim().slice(0,12)||'我家毛孩子',s:this.data.species,q:this.data.bingoSelected.slice().sort((a,b)=>a-b),e:store.todayKey(),...(this.peer?{peer:this.peer}:{})})},
 draftKey(){return 'paw_fun_quiz_v1_'+(store.isDemoMode()?'demo':'real')+'_'+this.data.species},
 chooseSpecies(e){this.setData({species:e.currentTarget.dataset.value,error:'',restored:false})},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value,error:''})},
 chooseDate(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value,error:''})},
 chooseSize(e){this.setData({size:Number(e.detail.value),error:''})},
 clearTogether(){this.setData({togetherSince:'',error:''})},
 calculate(){try{const result=calculateAge(this.data,store.todayKey());this.goResult(result)}catch(e){this.setData({error:e.message})}},
 goResult(result){wx.navigateTo({url:'/pages/play/result?r='+encodeURIComponent(JSON.stringify(result)),fail:()=>wx.showToast({title:'结果页暂时无法打开，请重试',icon:'none'})})},
 start(){
  let saved;try{saved=wx.getStorageSync(this.draftKey())}catch(e){}
  const valid=saved&&saved.name===this.data.name&&Array.isArray(saved.answers)&&saved.answers.length===10&&saved.answers.includes(null)&&saved.answers.every(v=>v===null||Number.isInteger(v)&&v>=0&&v<4)
  const answers=valid?saved.answers:Array(10).fill(null)
  let index=answers.findIndex(v=>v===null);if(index<0)index=9
  this.setData({started:true,answers,index,restored:!!valid,error:''});this.showQuestion()
 },
 showQuestion(){const {species,index,answers}=this.data;this.setData({question:questions(species)[index],selected:answers[index]===null?-1:answers[index],progress:Math.round(index/10*100),error:''})},
 select(e){const value=Number(e.currentTarget.dataset.index);if(!Number.isInteger(value)||value<0||value>3)return;const answers=this.data.answers.slice();answers[this.data.index]=value;this.setData({answers,selected:value,error:''});try{wx.setStorageSync(this.draftKey(),{name:this.data.name,answers})}catch(e){}},
 next(){
  if(this.data.selected<0){this.setData({error:'请选择最接近平时表现的一项'});return}
  if(this.data.index<9){this.setData({index:this.data.index+1});this.showQuestion();return}
  try{personality(this.data.answers,this.data.species);this.goResult({v:1,t:'personality',n:(this.data.name||'我家毛孩子').trim().slice(0,12)||'我家毛孩子',s:this.data.species,q:this.data.answers,e:store.todayKey()})}catch(e){this.setData({error:e.message})}
 },
 previous(){if(this.data.index>0){this.setData({index:this.data.index-1});this.showQuestion()}},
 restart(){wx.showModal({title:'重新开始？',content:'本次已选答案将清空。',success:r=>{if(r.confirm){wx.removeStorageSync(this.draftKey());this.setData({answers:Array(10).fill(null),index:0,restored:false});this.showQuestion()}}})},
 onShareAppMessage(){return {title:this.data.tool==='bingo'?'宠物行为宾果：看看你家中了几项':this.data.tool==='age'?'测测你家毛孩子相当于人类几岁':'测测你家毛孩子是哪种性格',path:'/pages/play/play?tool='+this.data.tool}},
 onShareTimeline(){return {title:this.data.tool==='bingo'?'宠物行为宾果：看看你家中了几项':this.data.tool==='age'?'它的人类年龄，可能和你想的不一样':'10 道题，发现毛孩子的小性格',query:'tool='+this.data.tool}}
})
