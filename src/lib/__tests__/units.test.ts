import { describe, expect, it } from 'vitest'
import { stepForUnit, toDisplayWeight, toKg, unitLabel } from '../units'

describe('重量单位换算', () => {
  it('kg 显示保留一位小数', () => {
    expect(toDisplayWeight(60, 'kg')).toBe(60)
    expect(toDisplayWeight(62.25, 'kg')).toBe(62.3)
    expect(toDisplayWeight(0, 'kg')).toBe(0)
  })

  it('lb 按 1kg = 2.2046lb 换算并保留一位小数', () => {
    expect(toDisplayWeight(100, 'lb')).toBe(220.5)
    expect(toKg(220.5, 'lb')).toBe(100.02)
    expect(toKg(45, 'lb')).toBe(20.41)
  })

  it('kg 与 lb 往返换算误差小于 0.02kg', () => {
    for (const kg of [0, 1.5, 20, 47.5, 102.25, 500]) {
      const roundTrip = toKg(toDisplayWeight(kg, 'lb'), 'lb')
      expect(Math.abs(roundTrip - kg)).toBeLessThan(0.02)
    }
  })

  it('kg 输入原样保存，步进与标签正确', () => {
    expect(toKg(82.5, 'kg')).toBe(82.5)
    expect(unitLabel('kg')).toBe('kg')
    expect(unitLabel('lb')).toBe('lb')
    expect(stepForUnit('kg')).toBe(2.5)
    expect(stepForUnit('lb')).toBe(5)
  })
})
