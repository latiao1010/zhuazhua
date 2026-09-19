const { ensureSeedData } = require('./utils/store')
const cloud = require('./utils/cloud')
const cloudData = require('./utils/cloud-data')

App({
  onLaunch() {
    cloud.init()
    ensureSeedData()
    cloudData.seedAndSyncSixMonthDemo()
    cloudData.syncBreedKnowledge()
    if (wx.onNetworkStatusChange) wx.onNetworkStatusChange(status => { if (status.isConnected) cloudData.retryPending() })
  },
  onShow() {
    cloudData.syncOnResume().then(result => {
      if (!result || result.ok === false) return
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const page = pages[pages.length - 1]
      if (page && typeof page.onShow === 'function') page.onShow()
    })
  },
  globalData: {
    theme: '#FF7D5A'
  }
})
