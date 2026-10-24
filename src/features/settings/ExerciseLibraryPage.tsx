import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CATEGORIES, type Exercise, type ExerciseCategory } from '../../db/types'
import { createExercise, listExercises, updateExercise } from '../../db/repo/exercises'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../components/ui/Toast'
import { DumbbellIcon, PlusIcon, SearchIcon } from '../../components/icons'
import { cx } from '../../lib/cx'

const TABS: Array<'全部' | ExerciseCategory> = ['全部', ...CATEGORIES]

interface EditorState {
  mode: 'create' | 'rename'
  exercise?: Exercise
  name: string
  category: ExerciseCategory
}

export function ExerciseLibraryPage() {
  const toast = useToast()
  const exercises = useLiveQuery(() => listExercises(true), [])
  const [tab, setTab] = useState<'全部' | ExerciseCategory>('全部')
  const [keyword, setKeyword] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const query = keyword.trim()
    return (exercises ?? []).filter((exercise) => {
      if (tab !== '全部' && exercise.category !== tab) return false
      if (query && !exercise.name.includes(query)) return false
      return true
    })
  }, [exercises, tab, keyword])

  function openCreate() {
    setEditor({ mode: 'create', name: '', category: tab === '全部' ? '胸' : tab })
  }

  function openRename(exercise: Exercise) {
    setEditor({ mode: 'rename', exercise, name: exercise.name, category: exercise.category })
  }

  async function handleSaveEditor() {
    if (!editor || busy) return
    setBusy(true)
    try {
      if (editor.mode === 'create') {
        await createExercise(editor.name, editor.category)
        toast('已新增动作')
      } else if (editor.exercise) {
        await updateExercise(editor.exercise.id, {
          name: editor.name,
          category: editor.category,
        })
        toast('已更新动作')
      }
      setEditor(null)
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function toggleHidden(exercise: Exercise) {
    try {
      await updateExercise(exercise.id, { hidden: !exercise.hidden })
      toast(exercise.hidden ? '已恢复显示' : '已隐藏，选择动作时不再出现')
    } catch {
      toast('操作失败，请重试')
    }
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="动作库"
        subtitle="内置动作不可删除，可隐藏"
        right={
          <Button size="sm" onClick={openCreate}>
            <PlusIcon size={16} /> 新增
          </Button>
        }
      />

      <div className="relative">
        <SearchIcon
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink3"
        />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索动作"
          aria-label="搜索动作"
          className="h-11 w-full rounded-field bg-soft pl-10 pr-3 text-[14px] text-ink outline-none focus:bg-white focus:ring-1 focus:ring-brand"
        />
      </div>

      <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
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

      <div className="mt-3 rounded-card bg-white shadow-card">
        {!exercises ? (
          <p className="py-12 text-center text-[13px] text-ink3">加载中…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<DumbbellIcon size={22} />}
            title="没有匹配的动作"
            description="换个分类或关键词，也可以新增一个自定义动作。"
            action={<Button onClick={openCreate}>新增动作</Button>}
          />
        ) : (
          <div className="divide-y divide-line px-4">
            {filtered.map((exercise) => (
              <div
                key={exercise.id}
                className={cx(
                  'flex items-center justify-between gap-3 py-3',
                  exercise.hidden && 'opacity-50',
                )}
              >
                {exercise.isBuiltin ? (
                  <div className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[14px] text-ink">{exercise.name}</span>
                      <span className="rounded-full bg-soft px-1.5 py-0.5 text-[10px] text-ink3">
                        {exercise.category}
                      </span>
                      <span className="rounded-full bg-brandsoft px-1.5 py-0.5 text-[10px] text-brand">
                        内置
                      </span>
                      {exercise.hidden ? (
                        <span className="rounded-full bg-[#FFF4E5] px-1.5 py-0.5 text-[10px] text-[#B45309]">
                          已隐藏
                        </span>
                      ) : null}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openRename(exercise)}
                    className="min-w-0 flex-1 text-left active:opacity-70"
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[14px] text-ink">{exercise.name}</span>
                      <span className="rounded-full bg-soft px-1.5 py-0.5 text-[10px] text-ink3">
                        {exercise.category}
                      </span>
                      {exercise.hidden ? (
                        <span className="rounded-full bg-[#FFF4E5] px-1.5 py-0.5 text-[10px] text-[#B45309]">
                          已隐藏
                        </span>
                      ) : null}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleHidden(exercise)}
                  className="shrink-0 rounded-btn px-2 py-1 text-[12px] text-ink2 active:bg-soft"
                >
                  {exercise.hidden ? '恢复' : '隐藏'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 px-1 text-[11px] leading-5 text-ink3">
        重命名自定义动作后，模板中的显示名称会同步更新；历史训练记录仍保留当时的名称。
      </p>

      <Sheet
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'rename' ? '编辑动作' : '新增动作'}
        footer={
          <Button
            fullWidth
            onClick={handleSaveEditor}
            disabled={busy || !editor?.name.trim()}
          >
            {busy ? '保存中…' : '保存'}
          </Button>
        }
      >
        {editor ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[12px] text-ink3" htmlFor="exercise-name">
                动作名称
              </label>
              <input
                id="exercise-name"
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                placeholder="例如：器械推胸"
                className="h-11 w-full rounded-field bg-soft px-3 text-[14px] text-ink outline-none focus:bg-white focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <p className="mb-1 text-[12px] text-ink3">部位分类</p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setEditor({ ...editor, category })}
                    className={cx(
                      'h-9 rounded-full px-3 text-[13px]',
                      editor.category === category
                        ? 'bg-brand text-white'
                        : 'bg-soft text-ink2',
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
