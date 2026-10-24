import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TemplateEditorPage } from '../TemplateEditorPage'
import { ToastProvider } from '../../../components/ui/Toast'
import { db, resetDatabase } from '../../../db/schema'

function renderEditor() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/plan/templates/new']}>
        <Routes>
          <Route path="/plan/templates/:id" element={<TemplateEditorPage />} />
          <Route path="/plan" element={<div>计划列表页</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(async () => {
  await resetDatabase()
})

describe('模板编辑页', () => {
  it('没有动作时不允许保存，也不会写入数据库', async () => {
    renderEditor()
    const saveButton = await screen.findByRole('button', { name: '保存' })
    expect(saveButton).toBeDisabled()
    expect(await screen.findByText('还没有动作')).toBeInTheDocument()
    expect(await db.templates.count()).toBe(0)
  })

  it('添加动作、调整顺序并保存后，数据库顺序与界面一致', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(await screen.findByRole('button', { name: '添加动作' }))
    await user.click(await screen.findByRole('button', { name: '深蹲' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /添加动作/ }))
    await user.click(await screen.findByRole('button', { name: '平板杠铃卧推' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByLabelText('上移：平板杠铃卧推'))
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('计划列表页')).toBeInTheDocument()

    const templates = await db.templates.toArray()
    expect(templates).toHaveLength(1)
    const items = await db.templateExercises
      .where('templateId')
      .equals(templates[0].id)
      .toArray()
    items.sort((a, b) => a.sortOrder - b.sortOrder)
    expect(items.map((item) => item.exerciseId)).toEqual(['ex-bench-press', 'ex-squat'])
    expect(items.map((item) => item.targetSets)).toEqual([3, 3])
  })
})
