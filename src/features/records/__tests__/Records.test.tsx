import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RecordsPage } from '../RecordsPage'
import { RecordDetailPage } from '../RecordDetailPage'
import { ToastProvider } from '../../../components/ui/Toast'
import { db, resetDatabase } from '../../../db/schema'
import {
  completeSession,
  getSessionBundle,
  startSessionFromTemplate,
  updateSet,
} from '../../../db/repo/sessions'
import { saveTemplateBundle } from '../../../db/repo/templates'
import { todayKey } from '../../../lib/date'

async function makeTemplate(name = '推') {
  return saveTemplateBundle(null, {
    name,
    note: '',
    items: [
      { exerciseId: 'ex-bench-press', targetSets: 2, targetReps: 8, targetWeight: null },
    ],
  })
}

async function makeCompletedSession(dateKey = todayKey()) {
  const templateId = await makeTemplate()
  const sessionId = await startSessionFromTemplate(templateId, dateKey)
  const bundle = (await getSessionBundle(sessionId))!
  await updateSet(bundle.sets[0].id, { weightKg: 60, reps: 8, completed: true })
  await updateSet(bundle.sets[1].id, { weightKg: 60, reps: 8, completed: true })
  await completeSession(sessionId)
  return sessionId
}

function renderRecords() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/records']}>
        <Routes>
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/records/:id" element={<RecordDetailPage />} />
          <Route path="/session/:id" element={<div>训练页内容</div>} />
          <Route path="/" element={<div>今日页内容</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

function renderDetail(sessionId: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/records/${sessionId}`]}>
        <Routes>
          <Route path="/records" element={<div>记录列表页</div>} />
          <Route path="/records/:id" element={<RecordDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(async () => {
  await resetDatabase()
})

describe('记录列表', () => {
  it('按月份显示记录，搜索动作名可筛选与清空', async () => {
    await makeCompletedSession()
    const user = userEvent.setup()
    renderRecords()

    expect(await screen.findByText('推')).toBeInTheDocument()
    const search = screen.getByLabelText('按动作搜索')
    await user.type(search, '深蹲')
    expect(await screen.findByText('没有匹配的训练')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清空搜索' }))
    expect(await screen.findByText('推')).toBeInTheDocument()
  })

  it('补记训练按所选模板创建草稿并进入训练页', async () => {
    await makeTemplate()
    const user = userEvent.setup()
    renderRecords()

    await user.click(await screen.findByRole('button', { name: /补记/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /推/ }))

    expect(await screen.findByText('训练页内容')).toBeInTheDocument()
    const sessions = await db.sessions.toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].status).toBe('draft')
    expect(sessions[0].date).toBe(todayKey())
  })
})

describe('记录详情', () => {
  it('编辑重量后保存，汇总按实际组数据重算', async () => {
    const sessionId = await makeCompletedSession()
    const user = userEvent.setup()
    renderDetail(sessionId)

    expect(await screen.findByText('完成组数')).toBeInTheDocument()
    expect(screen.getByText('960')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '编辑' }))
    const weight = await screen.findByLabelText('平板杠铃卧推 第 1 组重量')
    await user.clear(weight)
    await user.type(weight, '100')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(async () => {
      const session = await db.sessions.get(sessionId)
      expect(session?.totalVolume).toBe(1280)
      expect(session?.totalSets).toBe(2)
    })
    expect(await screen.findByText('1280')).toBeInTheDocument()
  })

  it('删除一组后组号重排且汇总更新', async () => {
    const sessionId = await makeCompletedSession()
    const user = userEvent.setup()
    renderDetail(sessionId)

    await user.click(await screen.findByRole('button', { name: '编辑' }))
    await user.click(screen.getByLabelText('删除第 2 组'))
    await user.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(async () => {
      const bundle = (await getSessionBundle(sessionId))!
      const block = bundle.exercises[0]
      const sets = bundle.sets.filter((set) => set.sessionExerciseId === block.id)
      expect(sets).toHaveLength(1)
      expect(sets[0].setIndex).toBe(1)
      const session = await db.sessions.get(sessionId)
      expect(session?.totalVolume).toBe(480)
    })
  })

  it('删除记录会同时删除动作与组', async () => {
    const sessionId = await makeCompletedSession()
    const user = userEvent.setup()
    renderDetail(sessionId)

    await user.click(await screen.findByRole('button', { name: '删除记录' }))
    await user.click(await screen.findByRole('button', { name: '删除' }))

    expect(await screen.findByText('记录列表页')).toBeInTheDocument()
    expect(await db.sessions.get(sessionId)).toBeUndefined()
    expect(await db.sessionExercises.where('sessionId').equals(sessionId).count()).toBe(0)
    expect(await db.setEntries.count()).toBe(0)
  })
})
