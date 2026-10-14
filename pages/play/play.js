const { instrument } = require('../../utils/analytics-page')
const analytics = require('../../utils/analytics')
const {readResult}=require('../../utils/fun-share')
const {bingo,BINGO_VERSION,canCompareBingo}=require('../../utils/pet-bingo')
const store=require('../../utils/store')
const {calculateAge,SIZE_OPTIONS}=require('../../utils/pet-age')
const {questions,personality}=require('../../utils/pet-personality')
function kind(pet){return pet.species==='cat'||pet.type==='cat'||/猫|英短|美短|布偶|暹罗|缅因|加菲/.test(pet.breed||'')?'cat':'dog'}
Page(instrument('play', {
 data:{peer:null,bingoVersion:BINGO_VERSION,bingoCells:bingo([],'dog',BINGO_VERSION).cells,bingoSelected:[],bingoCount:0,bingoLines:0,tool:'age',species:'dog',name:'',birthday:'',breed:'',size:1,sizeOptions:SIZE_OPTIONS,catSize:-1,catSizeOptions:['小型（骨架小，如新加坡猫）','中型（体格适中，如阿比西尼亚猫）','大型（骨架大、身躯长，如缅因猫）','暂不确定（幼猫或拿不准）'],today:'',started:false,index:0,answers:[],question:{},selected:-1,progress:0,error:'',restored:false},
 onLoad(options={}){
  let scene='';try{scene=decodeURIComponent(options.scene||'')}catch(e){}
  const requested=options.tool||scene
  const tool=['age','personality','bingo'].includes(requested)?requested:'age'
  if(tool==='bingo'&&options.peer){try{const peer=readResult(options.peer);if(peer.t!=='bingo')throw new Error();this.peer={v:peer.v,n:peer.n,s:peer.s,q:peer.q};this.setData({peer:this.peer})}catch(e){this.setData({error:'好友卡片已失效，仍可制作自己的宾果卡片'})}}
  const pet=store.get('pet')||{},petSpecies=kind(pet)
  const species=this.peer&&this.peer.v===BINGO_VERSION?this.peer.s:petSpecies
  this.breedBySpecies={cat:'',dog:'',[petSpecies]:pet.breed||''}
  this.bingoBySpecies={cat:[],dog:[]}
  const weight=Number(pet.weight)||0,size=petSpecies==='dog'&&weight?weight<=9?0:weight<=23?1:weight<=41?2:3:1
  this.setData({tool,species,name:pet.name||'',birthday:pet.birthday||'',breed:this.breedBySpecies[species],size,today:store.todayKey(),bingoVersion:this.peer?this.peer.v:BINGO_VERSION})
  this.setBingo([])
  this.toolFlow = analytics.beginFlow(tool)
  wx.setNavigationBarTitle({title:tool==='bingo'?'宠物行为宾果':tool==='age'?'宠物年龄计算器':'宠物性格测试'})
  if(wx.showShareMenu)wx.showShareMenu({menus:['shareAppMessage','shareTimeline']})
 },
 toggleBingo(e){
  const id=Number(e.currentTarget.dataset.id)
  if(!Number.isInteger(id)||id<0||id>8)return
  const selected=this.data.bingoSelected.includes(id)?this.data.bingoSelected.filter(v=>v!==id):this.data.bingoSelected.concat(id)
  this.setBingo(selected)
 },
 setBingo(selected){
  const result=bingo(selected,this.data.species,this.data.bingoVersion)
  this.setData({bingoSelected:selected,bingoCells:result.cells,bingoCount:result.count,bingoLines:result.lines})
 },
 clearBingo(){this.setBingo([])},
 finishBingo(){this.goResult({v:this.data.bingoVersion,t:'bingo',n:(this.data.name||'我家毛孩子').trim().slice(0,12)||'我家毛孩子',s:this.data.species,q:this.data.bingoSelected.slice().sort((a,b)=>a-b),e:store.todayKey(),...(this.peer?{peer:this.peer}:{})})},
 draftKey(){return store.isDemoMode()?'paw_fun_quiz_v1_demo_'+this.data.species:require('../../utils/pet-context').storageKey('paw_fun_quiz_v1_real_'+this.data.species)},
 chooseSpecies(e){
  const species=e.currentTarget.dataset.value
  if(!['cat','dog'].includes(species)||species===this.data.species)return
  this.breedBySpecies={...this.breedBySpecies,[this.data.species]:this.data.breed}
  this.bingoBySpecies={...this.bingoBySpecies,[this.data.species]:this.data.bingoSelected}
  if(this.peer&&!canCompareBingo({s:species,v:this.data.bingoVersion},this.peer))this.peer=null
  this.setData({species,breed:this.breedBySpecies[species]||'',error:'',restored:false,peer:this.peer||null})
  this.setBingo(this.bingoBySpecies[species]||[])
 },
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value,error:''})},
 chooseDate(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value,error:''})},
 chooseSize(e){
  const value=Number(e.detail.value),isCat=this.data.species==='cat'
  const options=isCat?this.data.catSizeOptions:this.data.sizeOptions
  if(!Number.isInteger(value)||value<0||value>=options.length)return
  this.setData({[isCat?'catSize':'size']:value,error:''})
 },
 calculate(){try{const result=calculateAge(this.data,store.todayKey());this.goResult(result)}catch(e){analytics.failure('age','calculate',new Error('validation'));this.setData({error:e.message})}},
 goResult(result){
  if(!this.toolFlow || this.toolFlow.steps[1])this.toolFlow=analytics.beginFlow(result.t)
  analytics.handoffTool(this.toolFlow)
  wx.navigateTo({url:'/pages/play/result?r='+encodeURIComponent(JSON.stringify(result)),success:()=>analytics.track(result.t,'complete','tool_result'),fail:error=>{analytics.takeTool(result.t);analytics.failure(result.t,'tool_result',error);wx.showToast({title:'结果页暂时无法打开，请重试',icon:'none'})}})
 },
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
}))
