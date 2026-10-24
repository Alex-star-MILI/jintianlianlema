import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SessionPage } from '../SessionPage'
import { SummaryPage } from '../SummaryPage'
import { ToastProvider } from '../../../components/ui/Toast'
import { db, resetDatabase } from '../../../db/schema'
import {
  completeSession,
  getSessionBundle,
  startSessionFromTemplate,
  updateSet,
} from '../../../db/repo/sessions'
import { saveTemplateBundle } from '../../../db/repo/templates'

async function makeTemplate(name = '推') {
  return saveTemplateBundle(null, {
    name,
    note: '',
    items: [
      { exerciseId: 'ex-bench-press', targetSets: 2, targetReps: 8, targetWeight: null },
    ],
  })
}

function renderSession(sessionId: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/session/${sessionId}`]}>
        <Routes>
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/session/:id/summary" element={<div>总结页内容</div>} />
          <Route path="/" element={<div>今日页内容</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(async () => {
  await resetDatabase()
})

describe('训练进行中', () => {
  it('勾选完成立即写库，加组后序号连续，结束训练保留未完成组', async () => {
    const templateId = await makeTemplate()
    const sessionId = await startSessionFromTemplate(templateId, '2026-10-24')
    const user = userEvent.setup()
    renderSession(sessionId)

    expect(await screen.findByText('平板杠铃卧推')).toBeInTheDocument()

    await user.click(screen.getByLabelText('平板杠铃卧推 第 1 组完成状态'))
    await waitFor(async () => {
      const bundle = await getSessionBundle(sessionId)
      const first = bundle!.sets.find((set) => set.setIndex === 1)
      expect(first?.completed).toBe(true)
    })

    const addButtons = screen.getAllByRole('button', { name: /加一组/ })
    await user.click(addButtons[0])
    await waitFor(async () => {
      const bundle = await getSessionBundle(sessionId)
      const block = bundle!.exercises[0]
      const sets = bundle!.sets
        .filter((set) => set.sessionExerciseId === block.id)
        .sort((a, b) => a.setIndex - b.setIndex)
      expect(sets.map((set) => set.setIndex)).toEqual([1, 2, 3])
    })

    await user.click(screen.getAllByRole('button', { name: '结束训练' })[0])
    expect(await screen.findByText('还有未完成的组')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '结束并保留未完成组' }))

    expect(await screen.findByText('总结页内容')).toBeInTheDocument()
    const session = await db.sessions.get(sessionId)
    expect(session?.status).toBe('completed')
    expect(session?.totalSets).toBe(1)
  })

  it('输入重量和次数后实时保存', async () => {
    const templateId = await makeTemplate()
    const sessionId = await startSessionFromTemplate(templateId, '2026-10-24')
    const user = userEvent.setup()
    renderSession(sessionId)

    const weightInput = await screen.findByLabelText('平板杠铃卧推 第 1 组重量')
    await user.type(weightInput, '60')
    const repsInput = screen.getByLabelText('平板杠铃卧推 第 1 组次数')
    await user.clear(repsInput)
    await user.type(repsInput, '9')

    await waitFor(async () => {
      const bundle = await getSessionBundle(sessionId)
      const first = bundle!.sets.find((set) => set.setIndex === 1)
      expect(first?.weightKg).toBe(60)
      expect(first?.reps).toBe(9)
    })
  })
})

describe('训练总结', () => {
  it('展示总容量并与上次同模板对比', async () => {
    const templateId = await makeTemplate()
    const firstId = await startSessionFromTemplate(templateId, '2026-10-20')
    const firstBundle = (await getSessionBundle(firstId))!
    await updateSet(firstBundle.sets[0].id, { weightKg: 60, reps: 8, completed: true })
    await completeSession(firstId)

    const secondId = await startSessionFromTemplate(templateId, '2026-10-22')
    const secondBundle = (await getSessionBundle(secondId))!
    await updateSet(secondBundle.sets[0].id, { weightKg: 60, reps: 10, completed: true })
    await updateSet(secondBundle.sets[1].id, { weightKg: 60, reps: 10, completed: true })
    await completeSession(secondId)

    render(
      <MemoryRouter initialEntries={[`/session/${secondId}/summary`]}>
        <Routes>
          <Route path="/session/:id/summary" element={<SummaryPage />} />
          <Route path="/" element={<div>今日页内容</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('训练总结 · 10月22日 周四')).toBeInTheDocument()
    expect(screen.getByText('1200')).toBeInTheDocument()
    expect(screen.getByText('↑ 150%')).toBeInTheDocument()
    expect(screen.getByText('完成')).toBeInTheDocument()
  })
})
