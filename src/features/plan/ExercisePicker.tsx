import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CATEGORIES, type ExerciseCategory } from '../../db/types'
import { createExercise, listExercises } from '../../db/repo/exercises'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { SearchIcon } from '../../components/icons'
import { useToast } from '../../components/ui/Toast'
import { cx } from '../../lib/cx'

const TABS: Array<'全部' | ExerciseCategory> = ['全部', ...CATEGORIES]

export function ExercisePicker({
  open,
  onClose,
  onPick,
  title = '选择动作',
}: {
  open: boolean
  onClose: () => void
  onPick: (exerciseId: string) => void
  title?: string
}) {
  const toast = useToast()
  const [tab, setTab] = useState<'全部' | ExerciseCategory>('全部')
  const [keyword, setKeyword] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<ExerciseCategory>('胸')
  const exercises = useLiveQuery(() => listExercises(false), [])

  useEffect(() => {
    if (open) {
      setTab('全部')
      setKeyword('')
      setCreating(false)
      setNewName('')
      setNewCategory('胸')
    }
  }, [open])

  const filtered = useMemo(() => {
    const list = exercises ?? []
    const query = keyword.trim()
    return list.filter((e) => {
      if (tab !== '全部' && e.category !== tab) return false
      if (query && !e.name.includes(query)) return false
      return true
    })
  }, [exercises, tab, keyword])

  async function handleCreate() {
    try {
      const id = await createExercise(newName, newCategory)
      toast('已添加动作')
      setNewName('')
      setCreating(false)
      onPick(id)
    } catch (error) {
      toast(error instanceof Error ? error.message : '添加失败')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink3"
          />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索动作名称"
            aria-label="搜索动作"
            className="h-11 w-full rounded-field bg-soft pl-10 pr-3 text-[14px] text-ink outline-none focus:bg-white focus:ring-1 focus:ring-brand"
          />
        </div>

        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={cx(
                'h-8 shrink-0 rounded-full px-3 text-[13px] transition-colors',
                tab === item ? 'bg-brandsoft font-medium text-brand' : 'bg-soft text-ink2',
              )}
            >
              {item}
            </button>
          ))}
        </div>

        {creating ? (
          <div className="rounded-field bg-soft p-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="动作名称"
              aria-label="新动作名称"
              className="h-11 w-full rounded-field bg-white px-3 text-[14px] text-ink outline-none focus:ring-1 focus:ring-brand"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setNewCategory(category)}
                  className={cx(
                    'h-7 rounded-full px-2.5 text-[12px]',
                    newCategory === category
                      ? 'bg-brand text-white'
                      : 'bg-white text-ink2',
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>
                取消
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
                创建并添加
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" fullWidth onClick={() => setCreating(true)}>
            ＋ 新建自定义动作
          </Button>
        )}

        <div className="divide-y divide-line">
          {filtered.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onPick(exercise.id)}
              aria-label={exercise.name}
              className="flex w-full items-center justify-between py-3 text-left active:bg-soft"
            >
              <span className="text-[14px] text-ink">{exercise.name}</span>
              <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] text-ink3">
                {exercise.category}
              </span>
            </button>
          ))}
          {exercises && filtered.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink3">没有匹配的动作</p>
          ) : null}
          {!exercises ? <p className="py-8 text-center text-[13px] text-ink3">加载中…</p> : null}
        </div>
      </div>
    </Sheet>
  )
}
