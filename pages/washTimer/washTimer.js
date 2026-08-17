// pages/washTimer/washTimer.js
// 纯本地健康工具：20 秒科学洗手计时器
// 不联网、不写数据库、无 UGC，符合个人主体小程序审核要求
Page({
  data: {
    total: 20,
    remaining: 20,
    progress: 0,
    running: false,
    finished: false,
    stageIndex: 0,
    stages: [
      '打湿双手',
      '涂抹洗手液',
      '搓洗 20 秒',
      '冲洗干净',
      '擦干双手'
    ],
    tips: [
      '用流动清水打湿双手，再关水涂抹洗手液。',
      '掌心相对，手指并拢相互揉搓。',
      '手心对手背沿指缝揉搓，双手交换。',
      '掌心相对，双手交叉沿指缝揉搓。',
      '弯曲手指关节，在另一掌心旋转揉搓。'
    ]
  },

  onUnload() {
    this.clearTimer()
  },

  clearTimer() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  onTimerMainTap() {
    if (this.data.running) {
      this.pauseTimer()
    } else {
      this.startTimer()
    }
  },

  startTimer() {
    if (this.data.running || this.data.finished) return
    this.setData({ running: true })
    this.clearTimer()
    this._timer = setInterval(() => {
      const next = Math.max(0, this.data.remaining - 1)
      const elapsed = this.data.total - next
      const progress = Math.round((elapsed / this.data.total) * 100)
      let stageIndex = 4
      if (elapsed <= 4) stageIndex = 1
      else if (elapsed <= 16) stageIndex = 2
      else if (elapsed <= 19) stageIndex = 3
      else stageIndex = 4
      if (next <= 0) {
        this.clearTimer()
        wx.vibrateShort({ type: 'medium', fail: () => {} })
        this.setData({
          remaining: 0,
          progress: 100,
          running: false,
          finished: true,
          stageIndex: this.data.stages.length - 1
        })
        return
      }
      this.setData({ remaining: next, progress, stageIndex })
    }, 1000)
  },

  pauseTimer() {
    if (!this.data.running) return
    this.clearTimer()
    this.setData({ running: false })
  },

  resetTimer() {
    this.clearTimer()
    this.setData({
      remaining: this.data.total,
      progress: 0,
      running: false,
      finished: false,
      stageIndex: 0
    })
  },

  stageText() {
    const list = this.data.stages
    return list[this.data.stageIndex] || list[0]
  }
})