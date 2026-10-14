// Shared cards store indices. Version 1 always uses the original board.
const LEGACY_ITEMS = ['喜欢纸箱','讨厌关门','半夜跑酷','偷看上厕所','踩键盘','假装没听见','抢枕头','挑食','吃完还讨饭']
const DOG_ITEMS = ['出门就兴奋','一路闻不停','叼玩具求玩','回家摇尾巴','总爱跟着你','翻肚求摸摸','假装没听见','听到零食就来','吃完还讨饭']
const BINGO_VERSION = 2
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
function boardKey(species,version){
 if(!['cat','dog'].includes(species)||![1,BINGO_VERSION].includes(version))throw new Error('九宫格版本无效，请重新制作')
 return version===BINGO_VERSION&&species==='dog'?'dog-v2':'original'
}
function canCompareBingo(first,second){return boardKey(first.s,first.v)===boardKey(second.s,second.v)}
function bingo(selected,species='cat',version=1) {
 const items=boardKey(species,version)==='dog-v2'?DOG_ITEMS:LEGACY_ITEMS
 if (!Array.isArray(selected) || selected.length > 9 || selected.some(v=>!Number.isInteger(v)||v<0||v>8) || new Set(selected).size!==selected.length) throw new Error('九宫格信息无效，请重新选择')
 const lines=LINES.filter(line=>line.every(i=>selected.includes(i)))
 const winning=[...new Set([].concat(...lines))]
 return {cells:items.map((label,i)=>({id:i,label,selected:selected.includes(i),winning:winning.includes(i)})),count:selected.length,lines:lines.length,quote:selected.length?'原来这些小习惯，你家也有！':'一项也没中，也是独一份的可爱。'}
}
module.exports={bingo,BINGO_VERSION,canCompareBingo}
