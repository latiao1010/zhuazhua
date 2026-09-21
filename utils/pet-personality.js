// Original entertainment questionnaire, not MBTI or a clinical assessment.
// Scores are normalized from the selected observations; never randomized.
const QUESTIONS = [
  { text:'陌生人来家里，它通常会？',cat:['主动凑过去闻一闻','远远看着，等对方靠近','找个地方躲起来','看心情，偶尔出来巡视'],dog:['摇着尾巴迎接','先观察，再慢慢靠近','躲到熟悉的人身边','保持距离，自己待着'],dim:'social',scores:[3,2,0,1] },
  { text:'你回到家，它会怎么欢迎你？',cat:['一路跟着，还要蹭蹭','过来打个招呼就走','抬头看一眼，继续休息','等你坐下才靠过来'],dog:['冲过来贴贴，一直跟着','打个招呼，再去玩玩具','躺着看看，等你来找它','过一会儿才慢慢靠近'],dim:'cling',scores:[3,2,0,1] },
  { text:'听到零食袋的声音，它会？',options:['立刻赶来，目光锁定','先看看是什么好吃的','不太在意，继续做自己的事','要尝一口才决定'],dim:'food',scores:[3,2,0,1] },
  { text:'家里出现一个新纸箱，它会？',options:['马上钻进去或围着玩','闻闻看看，慢慢探索','无视它，还是老位置舒服','有点好奇，但要等你陪着'],dim:'explore',scores:[3,2,0,1] },
  { text:'你想抱抱它时，它通常会？',options:['很享受，还会主动贴近','能抱一会儿，之后想下来','更喜欢保持自己的空间','只在熟悉的时机愿意'],dim:'cling',scores:[3,2,0,1] },
  { text:'遇到新来的宠物，它会？',options:['对安全距离外的对方很感兴趣','观察一阵后慢慢适应','主动远离，寻找安静角落','只关注熟悉的人，不想互动'],dim:'social',scores:[3,2,0,1] },
  { text:'平常独处时，它更像哪一种？',options:['到处探索，研究能玩的东西','玩一会儿，然后休息','大部分时间安静睡觉','等你回来才愿意活动'],dim:'explore',scores:[3,2,0,1] },
  { text:'面对新口味的食物，它通常？',options:['符合日常饮食就很愿意尝试','先闻一闻，再吃一点','只喜欢熟悉的口味','偶尔尝尝，不会太积极'],dim:'food',scores:[3,2,0,1] },
  { text:'你在家里走动时，它会？',options:['你到哪，它就跟到哪','偶尔来看看你在做什么','各忙各的，互不打扰','待在能看见你的地方'],dim:'cling',scores:[3,1,0,2] },
  { text:'面对新的玩具或互动游戏，它会？',options:['很快投入，还想再玩一轮','有兴趣，但一会儿就停','更喜欢安静地待着','先观察，需要一点鼓励'],dim:'explore',scores:[3,2,0,1] }
]
const PROFILES = {
 boss:{title:'高冷霸总型',tag:'独立有主见，温柔有分寸',quote:'它的爱不喧哗，但一直在。',tip:'给它可自主选择的空间，等它愿意时再靠近。'},
 shadow:{title:'贴贴跟班型',tag:'你走到哪里，爱就跟到哪里',quote:'它的日程表里，第一项永远是你。',tip:'安排稳定的陪伴时间，也用短时独处练习建立安全感。'},
 social:{title:'阳光社交型',tag:'自带亲和力，见面就是朋友',quote:'它负责交朋友，你负责记住名字。',tip:'给它温和的社交机会，观察身体语言，不强迫互动。'},
 foodie:{title:'干饭小天才型',tag:'一听零食响，立刻就登场',quote:'爱你是真的，爱吃也是真的。',tip:'把奖励计入每日食量，用互动和玩耍搭配食物奖励。'},
 explorer:{title:'好奇探险家型',tag:'生活处处有新发现',quote:'它眼里的家，是一座待探索的小宇宙。',tip:'提供安全的嗅闻、益智和玩耍机会，收好易误食的小物件。'},
 gentle:{title:'慢热小暖炉型',tag:'慢慢熟悉，认真喜欢',quote:'熟悉之后，才能发现它的柔软。',tip:'保持熟悉的节奏，给它选择和适应的时间。'}
}
function questions(species) { return QUESTIONS.map(q=>({text:q.text,options:q.options || q[species === 'cat' ? 'cat':'dog']})) }
function personality(answers, species) {
  if (!Array.isArray(answers) || answers.length !== QUESTIONS.length || answers.some(v=>!Number.isInteger(v)||v<0||v>3)) throw new Error('请完成全部 10 道题')
  const sums={}, counts={}
  QUESTIONS.forEach((q,i)=>{ sums[q.dim]=(sums[q.dim]||0)+q.scores[answers[i]];counts[q.dim]=(counts[q.dim]||0)+1 })
  const scores={};Object.keys(sums).forEach(key=>{scores[key]=Math.round(sums[key]/(counts[key]*3)*100)})
  const ordered=['food','explore','cling','social'].sort((a,b)=>scores[b]-scores[a])
  const best=ordered[0]
  let key=scores.cling<=33 && scores.social<=33 ? 'boss' : scores[best]>=67 ? ({food:'foodie',explore:'explorer',cling:'shadow',social:'social'})[best] : 'gentle'
  // If attachment is strong, make that relationship the primary description.
  if(scores.cling>=89) key='shadow'
  const metrics=[{label:'高冷指数',value:100-scores.cling},{label:'粘人指数',value:scores.cling},{label:'吃货指数',value:scores.food},{label:'探索指数',value:scores.explore}]
  return {key,...PROFILES[key],metrics,scores,species}
}
module.exports={questions,personality}
