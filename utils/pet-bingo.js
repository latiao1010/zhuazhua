// Keep this version's order stable: shared cards store selected cell indices.
const ITEMS = ['喜欢纸箱','讨厌关门','半夜跑酷','偷看上厕所','踩键盘','假装没听见','抢枕头','挑食','吃完还讨饭']
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
function bingo(selected) {
 if (!Array.isArray(selected) || selected.length > 9 || selected.some(v=>!Number.isInteger(v)||v<0||v>8) || new Set(selected).size!==selected.length) throw new Error('九宫格信息无效，请重新选择')
 const lines=LINES.filter(line=>line.every(i=>selected.includes(i)))
 const winning=[...new Set([].concat(...lines))]
 return {cells:ITEMS.map((label,i)=>({id:i,label,selected:selected.includes(i),winning:winning.includes(i)})),count:selected.length,lines:lines.length,quote:selected.length?'原来这些小习惯，你家也有！':'一项也没中，也是独一份的可爱。'}
}
module.exports={bingo}
