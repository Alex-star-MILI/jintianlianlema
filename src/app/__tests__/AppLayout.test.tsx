import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../AppLayout'
import { resetDatabase } from '../../db/schema'
import { updateSettings } from '../../db/repo/health'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/welcome" element={<div>欢迎页内容</div>} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>今日内容</div>} />
          <Route path="/plan" element={<div>计划内容</div>} />
          <Route path="/records" element={<div>记录内容</div>} />
          <Route path="/stats" element={<div>统计内容</div>} />
          <Route path="/settings" element={<div>设置内容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await resetDatabase()
  await updateSettings({ onboardingDone: true })
})

describe('AppLayout', () => {
  it('渲染五个主导航入口并显示子路由内容', async () => {
    renderAt('/plan')
    expect(await screen.findByText('计划内容')).toBeInTheDocument()
    for (const label of ['今日', '计划', '记录', '统计', '设置']) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0)
    }
  })

  it('当前路由的导航项标记为当前页', async () => {
    renderAt('/stats')
    await screen.findByText('统计内容')
    const links = screen.getAllByRole('link', { name: '统计' })
    expect(links.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('未完成首次引导时跳转到欢迎页', async () => {
    await updateSettings({ onboardingDone: false })
    renderAt('/')
    expect(await screen.findByText('欢迎页内容')).toBeInTheDocument()
  })
})
