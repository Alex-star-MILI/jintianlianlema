import type { Unit } from '../db/types'

const LB_PER_KG = 2.2046226218

export function toDisplayWeight(kg: number, unit: Unit): number {
  if (unit === 'lb') return Math.round(kg * LB_PER_KG * 10) / 10
  return Math.round(kg * 10) / 10
}

export function toKg(displayValue: number, unit: Unit): number {
  if (unit === 'lb') return Math.round((displayValue / LB_PER_KG) * 100) / 100
  return displayValue
}

export function unitLabel(unit: Unit): string {
  return unit
}

export function stepForUnit(unit: Unit): number {
  return unit === 'lb' ? 5 : 2.5
}
