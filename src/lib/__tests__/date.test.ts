import { describe, expect, it } from 'vitest'
import {
  addDaysKey,
  eachDayInclusive,
  formatDateLabel,
  monthLabel,
  parseDateKey,
  startOfMonthKey,
  endOfMonthKey,
  toDateKey,
  weekEndKey,
  weekStartKey,
  weekdayOf,
} from '../date'

describe('日期工具', () => {
  it('限制在本地日期字符串，不受时区影响', () => {
    expect(toDateKey(new Date(2026, 9, 24, 23, 30))).toBe('2026-10-24')
    expect(parseDateKey('2026-10-24').getDate()).toBe(24)
  })

  it('计算星期：2026-10-24 是周六', () => {
    expect(weekdayOf('2026-10-24')).toBe(6)
    expect(formatDateLabel('2026-10-24')).toBe('10月24日 周六')
  })

  it('以周一作为一周起点', () => {
    expect(weekStartKey('2026-10-24')).toBe('2026-10-19')
    expect(weekEndKey('2026-10-24')).toBe('2026-10-25')
    expect(weekStartKey('2026-10-19')).toBe('2026-10-19')
    expect(weekStartKey('2026-10-25')).toBe('2026-10-19')
  })

  it('支持加天数与日期区间', () => {
    expect(addDaysKey('2026-10-31', 1)).toBe('2026-11-01')
    expect(eachDayInclusive('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
  })

  it('计算月份首尾', () => {
    expect(startOfMonthKey('2026-10-24')).toBe('2026-10-01')
    expect(endOfMonthKey('2026-10-24')).toBe('2026-10-31')
    expect(endOfMonthKey('2026-02-10')).toBe('2026-02-28')
    expect(monthLabel('2026-10')).toBe('2026年10月')
  })
})
