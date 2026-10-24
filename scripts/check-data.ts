import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { db, resetDatabase } from '../src/db/schema'
import { seedDemoData } from './seed-dev'
import { listCompletedSessions } from '../src/db/repo/sessions'
import {
  categoryDistribution,
  countSetsByDate,
  heatmapWeeks,
  resolveRange,
  strengthSeries,
  volumeSeries,
} from '../src/lib/stats'
import { todayKey } from '../src/lib/date'

function log(message: string) {
  console.log(message)
}

async function main() {
  log('开始数据完整性检查（500 次训练）…')
  await resetDatabase()
  const seeded = await seedDemoData({ sessions: 500 })
  log(
    `已生成：${seeded.sessions} 次训练 / ${seeded.blocks} 个动作块 / ${seeded.sets} 组 / ${seeded.weights} 条体重 / ${seeded.calories} 天热量`,
  )

  const allSessions = await db.sessions.toArray()
  const blocks = await db.sessionExercises.toArray()
  const sets = await db.setEntries.toArray()

  assert.equal(allSessions.length, seeded.sessions, '训练条数与生成结果不一致')

  const sessionIds = new Set(allSessions.map((session) => session.id))
  const blockIds = new Set(blocks.map((block) => block.id))
  const blockMap = new Map(blocks.map((block) => [block.id, block]))

  const orphanBlocks = blocks.filter((block) => !sessionIds.has(block.sessionId))
  const orphanSets = sets.filter((set) => !blockIds.has(set.sessionExerciseId))
  assert.equal(orphanBlocks.length, 0, `存在 ${orphanBlocks.length} 个孤立动作块`)
  assert.equal(orphanSets.length, 0, `存在 ${orphanSets.length} 个孤立组`)

  const totals = new Map<string, { volume: number; completed: number }>()
  for (const set of sets) {
    const block = blockMap.get(set.sessionExerciseId)
    if (!block) continue
    const entry = totals.get(block.sessionId) ?? { volume: 0, completed: 0 }
    if (set.completed) {
      entry.volume += set.weightKg * set.reps
      entry.completed += 1
    }
    totals.set(block.sessionId, entry)
  }

  const mismatched = allSessions.filter((session) => {
    if (session.status !== 'completed') return false
    const sum = totals.get(session.id) ?? { volume: 0, completed: 0 }
    return session.totalVolume !== Math.round(sum.volume) || session.totalSets !== sum.completed
  })
  assert.equal(
    mismatched.length,
    0,
    `存在 ${mismatched.length} 条训练的汇总字段与组数据不一致`,
  )
  log('✅ 无孤立组、无孤立动作块、汇总字段与组数据一致')

  const loadStart = performance.now()
  const completed = await listCompletedSessions()
  const loadCost = performance.now() - loadStart
  assert.equal(completed.length, seeded.sessions, '已完成训练条数不正确')

  const range = resolveRange('all', todayKey())
  const calcStart = performance.now()
  const volumes = volumeSeries(completed, range, 'volume', 'week')
  const strength = strengthSeries(completed, blocks, sets, 'ex-bench-press', range)
  const distribution = categoryDistribution(completed, blocks, sets, todayKey(), 30)
  const counts = countSetsByDate(completed, blocks, sets)
  const heatmap = heatmapWeeks(counts, todayKey())
  const calcCost = performance.now() - calcStart

  assert.ok(volumes.length > 0, '容量序列为空')
  assert.ok(strength.length > 0, '力量序列为空')
  assert.ok(distribution.totalSets > 0, '部位分布为空')
  assert.ok(heatmap.length > 0, '热力图数据为空')

  log(
    `✅ 统计计算：容量 ${volumes.length} 点 / 力量 ${strength.length} 点 / 部位 ${distribution.slices.length} 类 / 热力图 ${heatmap.length} 周`,
  )
  log(`⏱ 读取 500 条训练耗时 ${loadCost.toFixed(1)}ms，统计计算耗时 ${calcCost.toFixed(1)}ms`)

  assert.ok(loadCost < 1000, `读取耗时 ${loadCost.toFixed(1)}ms 超过 1s`)
  assert.ok(calcCost < 1000, `统计计算耗时 ${calcCost.toFixed(1)}ms 超过 1s`)

  log('✅ 性能检查通过（500 条记录，读取与统计均低于 1 秒）')
}

main().catch((error) => {
  console.error('❌ 数据检查失败：', error instanceof Error ? error.message : error)
  process.exit(1)
})
