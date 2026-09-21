// One-shot destinations for tab navigation (switchTab cannot carry query data).
const ROUTES = {
  today: '/pages/profile/profile', records: '/pages/records/records',
  care: '/pages/care/care', account: '/pages/account/account'
}
const targets = {}
function openTab(name, target) {
  if (!ROUTES[name]) return
  if (target) targets[name] = target
  else delete targets[name]
  wx.switchTab({ url: ROUTES[name], fail() {
    delete targets[name]
    wx.showToast({ title: '页面暂时无法打开，请重试', icon: 'none' })
  } })
}
function takeTarget(name) {
  const target = targets[name]
  delete targets[name]
  return target
}
module.exports = { openTab, takeTarget }
