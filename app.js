const { ensureSeedData } = require('./utils/store')
const cloud = require('./utils/cloud')
const cloudData = require('./utils/cloud-data')
const analytics = require('./utils/analytics')

App({
  onLaunch() {
    cloud.init()
    ensureSeedData()
    cloudData.seedAndSyncSixMonthDemo()
    cloudData.syncBreedKnowledge()
    if (wx.onNetworkStatusChange) wx.onNetworkStatusChange(status => { if (status.isConnected) { cloudData.retryPending(); analytics.flush() } })
  },
  onShow(options) {
    analytics.resume(options)
    cloudData.syncOnResume().then(result => {
      if (!result || result.ok === false) return
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const page = pages[pages.length - 1]
      if (page && typeof page.onShow === 'function') page.onShow()
    })
  },
  onHide() { analytics.flush(); analytics.pause() },
  globalData: {
    theme: '#FF7D5A'
  }
})
