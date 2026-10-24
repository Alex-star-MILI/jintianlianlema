import type { Exercise, ExerciseCategory } from './types'

interface SeedItem {
  id: string
  name: string
  category: ExerciseCategory
}

const ITEMS: SeedItem[] = [
  { id: 'ex-bench-press', name: '平板杠铃卧推', category: '胸' },
  { id: 'ex-incline-db-press', name: '上斜哑铃卧推', category: '胸' },
  { id: 'ex-db-press', name: '哑铃卧推', category: '胸' },
  { id: 'ex-cable-fly', name: '龙门夹胸', category: '胸' },
  { id: 'ex-dip', name: '双杠臂屈伸', category: '胸' },
  { id: 'ex-pushup', name: '俯卧撑', category: '胸' },

  { id: 'ex-deadlift', name: '硬拉', category: '背' },
  { id: 'ex-pullup', name: '引体向上', category: '背' },
  { id: 'ex-lat-pulldown', name: '高位下拉', category: '背' },
  { id: 'ex-barbell-row', name: '杠铃划船', category: '背' },
  { id: 'ex-seated-row', name: '坐姿绳索划船', category: '背' },
  { id: 'ex-one-arm-row', name: '单臂哑铃划船', category: '背' },
  { id: 'ex-pullover', name: '直臂下压', category: '背' },

  { id: 'ex-squat', name: '深蹲', category: '腿' },
  { id: 'ex-front-squat', name: '前蹲', category: '腿' },
  { id: 'ex-leg-press', name: '腿举', category: '腿' },
  { id: 'ex-rdl', name: '罗马尼亚硬拉', category: '腿' },
  { id: 'ex-bulgarian-split', name: '保加利亚分腿蹲', category: '腿' },
  { id: 'ex-leg-extension', name: '腿屈伸', category: '腿' },
  { id: 'ex-leg-curl', name: '腿弯举', category: '腿' },
  { id: 'ex-calf-raise', name: '站姿提踵', category: '腿' },

  { id: 'ex-overhead-press', name: '杠铃推举', category: '肩' },
  { id: 'ex-db-shoulder-press', name: '哑铃肩推', category: '肩' },
  { id: 'ex-lateral-raise', name: '侧平举', category: '肩' },
  { id: 'ex-rear-delt-fly', name: '反向飞鸟', category: '肩' },
  { id: 'ex-face-pull', name: '面拉', category: '肩' },
  { id: 'ex-shrug', name: '耸肩', category: '肩' },

  { id: 'ex-barbell-curl', name: '杠铃弯举', category: '手臂' },
  { id: 'ex-db-curl', name: '哑铃弯举', category: '手臂' },
  { id: 'ex-hammer-curl', name: '锤式弯举', category: '手臂' },
  { id: 'ex-triceps-pushdown', name: '绳索下压', category: '手臂' },
  { id: 'ex-close-grip-bench', name: '窄距卧推', category: '手臂' },
  { id: 'ex-skull-crusher', name: '仰卧臂屈伸', category: '手臂' },

  { id: 'ex-plank', name: '平板支撑', category: '核心' },
  { id: 'ex-crunch', name: '卷腹', category: '核心' },
  { id: 'ex-hanging-leg-raise', name: '悬垂举腿', category: '核心' },
  { id: 'ex-russian-twist', name: '俄罗斯转体', category: '核心' },

  { id: 'ex-treadmill', name: '跑步机', category: '其他' },
  { id: 'ex-rowing-machine', name: '划船机', category: '其他' },
]

export function createBuiltinExercises(now = new Date().toISOString()): Exercise[] {
  return ITEMS.map((item) => ({
    ...item,
    isBuiltin: true,
    hidden: false,
    createdAt: now,
  }))
}

/** 预设「推 / 拉 / 腿」模板，用于首次引导一键导入 */
export const PRESET_TEMPLATES = [
  {
    name: '推 · 胸肩三头',
    exercises: [
      { exerciseId: 'ex-bench-press', targetSets: 4, targetReps: 8 },
      { exerciseId: 'ex-incline-db-press', targetSets: 3, targetReps: 10 },
      { exerciseId: 'ex-db-shoulder-press', targetSets: 3, targetReps: 10 },
      { exerciseId: 'ex-lateral-raise', targetSets: 3, targetReps: 15 },
      { exerciseId: 'ex-triceps-pushdown', targetSets: 3, targetReps: 12 },
    ],
  },
  {
    name: '拉 · 背二头',
    exercises: [
      { exerciseId: 'ex-lat-pulldown', targetSets: 4, targetReps: 10 },
      { exerciseId: 'ex-barbell-row', targetSets: 4, targetReps: 8 },
      { exerciseId: 'ex-seated-row', targetSets: 3, targetReps: 12 },
      { exerciseId: 'ex-face-pull', targetSets: 3, targetReps: 15 },
      { exerciseId: 'ex-db-curl', targetSets: 3, targetReps: 12 },
    ],
  },
  {
    name: '腿 · 下肢核心',
    exercises: [
      { exerciseId: 'ex-squat', targetSets: 4, targetReps: 6 },
      { exerciseId: 'ex-rdl', targetSets: 3, targetReps: 8 },
      { exerciseId: 'ex-leg-press', targetSets: 3, targetReps: 12 },
      { exerciseId: 'ex-leg-curl', targetSets: 3, targetReps: 12 },
      { exerciseId: 'ex-calf-raise', targetSets: 4, targetReps: 15 },
    ],
  },
]
