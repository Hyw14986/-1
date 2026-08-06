// components/star/star.js
// 星级评分组件：支持纯展示（disabled）与交互打分两种模式
Component({
  properties: {
    // 当前分值（1-5 的整数，或小数用于展示）
    value: {
      type: Number,
      value: 0
    },
    // 字号（rpx）
    size: {
      type: Number,
      value: 30
    },
    // 是否为纯展示模式
    disabled: {
      type: Boolean,
      value: true
    }
  },
  data: {
    // 交互模式下用户临时选中的分值
    tempValue: 0
  },
  observers: {
    value(val) {
      this.setData({ tempValue: Math.round(val) })
    }
  },
  methods: {
    // 点击星星打分（仅在非 disabled 时生效）
    onTapStar(e) {
      if (this.data.disabled) return
      const index = e.currentTarget.dataset.index
      this.setData({ tempValue: index })
      this.triggerEvent('change', { value: index })
    }
  }
})
