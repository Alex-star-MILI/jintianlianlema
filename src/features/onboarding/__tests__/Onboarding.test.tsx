import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { OnboardingPage } from '../OnboardingPage'
import { ToastProvider } from '../../../components/ui/Toast'
import { db, resetDatabase } from '../../../db/schema'
import { getAssignmentMap } from '../../../db/repo/plan'

function renderOnboarding() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/welcome']}>
        <Routes>
          <Route path="/welcome" element={<OnboardingPage />} />
          <Route path="/" element={<div>今日页内容</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(async () => {
  await resetDatabase()
})

describe('首次引导', () => {
  it('三步完成后保存目标、预设模板与周映射', async () => {
    const user = userEvent.setup()
    renderOnboarding()

    expect(await screen.findByText('每周练几次？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByText('从哪套开始？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByText('安排到周几？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '完成设置' }))

    expect(await screen.findByText('今日页内容')).toBeInTheDocument()

    const settings = await db.settings.get('settings')
    expect(settings?.onboardingDone).toBe(true)
    const goals = await db.goals.get('goals')
    expect(goals?.weeklySessionTarget).toBe(4)

    const templates = await db.templates.orderBy('sortOrder').toArray()
    expect(templates.map((template) => template.name)).toEqual([
      '推 · 胸肩三头',
      '拉 · 背二头',
      '腿 · 下肢核心',
    ])

    const map = await getAssignmentMap()
    expect(map[1]).toBe(templates[0].id)
    expect(map[3]).toBe(templates[1].id)
    expect(map[5]).toBe(templates[2].id)
    expect([map[2], map[4], map[6], map[7]].every((value) => value === null)).toBe(true)
  })

  it('跳过引导后不创建模板，但标记为已完成', async () => {
    const user = userEvent.setup()
    renderOnboarding()

    await screen.findByText('每周练几次？')
    await user.click(screen.getByRole('button', { name: '跳过' }))

    expect(await screen.findByText('今日页内容')).toBeInTheDocument()
    expect((await db.settings.get('settings'))?.onboardingDone).toBe(true)
    expect(await db.templates.count()).toBe(0)
  })
})
