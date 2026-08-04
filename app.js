const { ensureSeedData } = require('./utils/store')
const cloud = require('./utils/cloud')

App({
  onLaunch() {
    cloud.init()
    ensureSeedData()
  },
  globalData: {
    theme: '#FF7D5A'
  }
})
