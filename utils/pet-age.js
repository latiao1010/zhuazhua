// AAHA / Zoetis comparative age chart, 2019. See docs/pet-fun-tools.md.
// Interpolation is an estimate, not a biological-age measurement.
const DAY = 86400000
const SIZE_OPTIONS = ['小型（成年 ≤9kg）', '中型（成年 >9–23kg）', '大型（成年 >23–41kg）', '巨型（成年 >41kg）']
const DOG_AGES = [
  [0,15,24,28,32,36,40,44,48,52,56,60,64,68,72,76,80,84,88,92,96],
  [0,15,24,28,33,37,42,47,51,56,60,65,69,74,78,83,87,92,96,101,105],
  [0,15,24,30,35,40,45,50,55,61,66,72,77,82,88,93,99,104,109,115,120],
  [0,15,24,32,37,42,49,56,64,71,78,86,93,101,108,115,123]
]
function dateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3])
  const time = Date.UTC(y, m - 1, d)
  const date = new Date(time)
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? { y,m,d,time } : null
}
function anniversary(birth, months) {
  const month = birth.m - 1 + months
  const y = birth.y + Math.floor(month / 12), m = month % 12
  return Date.UTC(y,m,Math.min(birth.d,new Date(Date.UTC(y,m+1,0)).getUTCDate()))
}
function stage(species, years, size) {
  if (species === 'cat') return years < 1 ? '幼年期' : years < 7 ? '青年成年期' : years < 11 ? '成熟成年期' : '老年期'
  const maturity = [1,1,1.5,2][size]
  const senior = [11.25,9.75,8.25,7.5][size]
  return years < maturity ? '幼年成长期' : years < 3 ? '青年期' : years < senior ? '成年期' : '老年期'
}
function calculateAge(input, today) {
  const birth = dateParts(input.birthday), now = dateParts(today)
  if (!now || !birth || birth.time > now.time) throw new Error('请选择有效的出生日期，不能晚于今天')
  if (!['cat','dog'].includes(input.species)) throw new Error('请选择猫咪或狗狗')
  const size = Number(input.size)
  if (!Number.isInteger(size) || size < 0 || size > 3) throw new Error('请选择成年后的体型')
  let months = (now.y - birth.y) * 12 + now.m - birth.m
  if (anniversary(birth, months) > now.time) months--
  if (months > 1200) throw new Error('出生日期过早，请重新选择')
  const exactYears = months / 12 + (now.time - anniversary(birth,months)) / (anniversary(birth,months+1)-anniversary(birth,months)) / 12
  let humanAge = null
  if (input.species === 'cat' && exactYears <= 21) {
    humanAge = exactYears <= .5 ? exactYears * 20 : exactYears <= 1 ? 10 + (exactYears - .5) * 10 : exactYears <= 2 ? 15 + (exactYears - 1) * 9 : 24 + (exactYears - 2) * 4
  } else if (input.species === 'dog') {
    const ages = DOG_AGES[size], year = Math.floor(exactYears)
    if (exactYears <= ages.length - 1) humanAge = year === ages.length - 1 ? ages[year] : ages[year] + (ages[year+1]-ages[year])*(exactYears-year)
  }
  const lifeDays = Math.round((now.time-birth.time)/DAY)
  let days = lifeDays, hasCompanion = false
  if (input.togetherSince) {
    const together = dateParts(input.togetherSince)
    if (!together || together.time < birth.time || together.time > now.time) throw new Error('相伴日期应在出生日期与今天之间')
    days = Math.round((now.time-together.time)/DAY); hasCompanion = true
  }
  let birthdayTime = anniversary(birth,(now.y-birth.y)*12)
  if (birthdayTime < now.time) birthdayTime = anniversary(birth,(now.y-birth.y+1)*12)
  return { v:1,t:'age',n:String(input.name||'我家毛孩子').trim().slice(0,12)||'我家毛孩子',s:input.species,
    a:months,h:humanAge === null ? null : Math.round(humanAge),d:days,b:Math.round((birthdayTime-now.time)/DAY),
    g:stage(input.species,exactYears,size),e:today,x:hasCompanion }
}
module.exports = { calculateAge, dateParts, SIZE_OPTIONS }
