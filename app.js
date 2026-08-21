const { ensureSeedData } = require('./utils/store')
const cloud = require('./utils/cloud')
const cloudData = require('./utils/cloud-data')

App({
  onLaunch() {
    cloud.init()
    ensureSeedData()
    cloudData.seedAndSyncSixMonthDemo()
    cloudData.syncBreedKnowledge()
  },
  globalData: {
    theme: '#FF7D5A'
  }
})
