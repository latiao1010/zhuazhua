// 保留旧路径兼容已保存的入口；管理页面按需加载。
Page({
  data: { failed: false },
  onLoad() { this.open() },
  open() {
    this.setData({ failed: false })
    wx.redirectTo({ url: '/packages/operations/analytics', fail: () => this.setData({ failed: true }) })
  }
})
