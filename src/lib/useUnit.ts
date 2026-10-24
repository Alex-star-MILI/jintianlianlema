import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import type { Unit } from '../db/types'

/** 读取全局单位设置（内部数据统一按 kg 存储） */
export function useUnit(): Unit {
  const settings = useLiveQuery(() => db.settings.get('settings'), [])
  return settings?.unit ?? 'kg'
}
