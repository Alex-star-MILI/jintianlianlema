import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SettingsPage } from '../SettingsPage'
import { ToastProvider } from '../../../components/ui/Toast'
import { db, resetDatabase } from '../../../db/schema'
import { exportBackup } from '../../../db/backup'
import { updateGoals } from '../../../db/repo/health'
import { saveTemplateBundle } from '../../../db/repo/templates'
import {
  completeSession,
  getSessionBundle,
  startSessionFromTemplate,
  updateSet,
} from '../../../db/repo/sessions'
import { todayKey } from '../../../lib/date'

const createObjectURL = vi.fn(() => 'blob:mock')

beforeEach(async () => {
  await resetDatabase()
  createObjectURL.mockClear()
  Object.defineProperty(URL, 'createObjectURL', { writable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

function renderSettings() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/exercises" element={<div>动作库页内容</div>} />
          <Route path="/welcome" element={<div>引导页内容</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

async function makeSession() {
  const templateId = await saveTemplateBundle(null, {
    name: '推',
    note: '',
    items: [
      { exerciseId: 'ex-bench-press', targetSets: 2, targetReps: 8, targetWeight: null },
    ],
  })
  const sessionId = await startSessionFromTemplate(templateId, todayKey())
  const bundle = (await getSessionBundle(sessionId))!
  await updateSet(bundle.sets[0].id, { weightKg: 60, reps: 8, completed: true })
  await completeSession(sessionId)
  return sessionId
}

describe('设置页', () => {
  it('切换重量单位后持久化，并按新单位显示输入值', async () => {
    await updateGoals({ weightTargetKg: 70 })
    const user = userEvent.setup()
    renderSettings()

    await screen.findByText('重量显示单位')
    await user.click(screen.getByRole('button', { name: 'lb' }))

    await waitFor(async () => {
      expect((await db.settings.get('settings'))?.unit).toBe('lb')
    })

    const target = screen.getByLabelText('目标体重') as HTMLInputElement
    await waitFor(() => expect(target.value).toBe('154.3'))

    // 切回 kg 后恢复原始数值
    await user.click(screen.getByRole('button', { name: 'kg' }))
    await waitFor(async () => {
      expect((await db.settings.get('settings'))?.unit).toBe('kg')
    })
    await waitFor(() => expect(target.value).toBe('70'))
  })

  it('力量目标可新增、编辑和删除，数据库内始终按 kg 保存', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: '＋ 添加动作目标' }))
    await user.click(await screen.findByRole('button', { name: '平板杠铃卧推' }))

    const input = await screen.findByLabelText('动作目标重量')
    await user.type(input, '80')
    await user.click(screen.getByRole('button', { name: '保存目标' }))

    await waitFor(async () => {
      const goals = await db.strengthGoals.toArray()
      expect(goals).toHaveLength(1)
      expect(goals[0].exerciseId).toBe('ex-bench-press')
      expect(goals[0].targetWeightKg).toBe(80)
    })

    await user.click(screen.getByRole('button', { name: /^平板杠铃卧推 .*目标/ }))
    const editInput = await screen.findByLabelText('动作目标重量')
    await user.clear(editInput)
    await user.type(editInput, '90')
    await user.click(screen.getByRole('button', { name: '保存目标' }))

    await waitFor(async () => {
      const goals = await db.strengthGoals.toArray()
      expect(goals[0].targetWeightKg).toBe(90)
    })

    await user.click(screen.getByRole('button', { name: '删除目标：平板杠铃卧推' }))
    await user.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(async () => {
      expect(await db.strengthGoals.count()).toBe(0)
    })
  })

  it('导出备份会生成文件并记录备份时间', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: '导出备份' }))

    await waitFor(async () => {
      expect((await db.settings.get('settings'))?.lastBackupAt).toBeTruthy()
    })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('导入备份先展示摘要，确认后全量恢复数据', async () => {
    await makeSession()
    const backup = await exportBackup()
    await resetDatabase()

    renderSettings()
    await screen.findByText('当前数据量')

    const file = new File([JSON.stringify(backup)], 'backup.json', {
      type: 'application/json',
    })
    fireEvent.change(screen.getByLabelText('选择备份文件'), {
      target: { files: [file] },
    })

    expect(await screen.findByText('确认导入备份')).toBeInTheDocument()
    expect(await screen.findByText('训练记录：1 条')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '覆盖并导入' }))

    await waitFor(async () => {
      expect(await db.sessions.count()).toBe(1)
    })
    expect(await db.templates.count()).toBe(1)
  })

  it('导入非法备份不会改动现有数据', async () => {
    await makeSession()
    renderSettings()
    await screen.findByText('当前数据量')

    const bad = new File([JSON.stringify({ app: 'another-app' })], 'bad.json', {
      type: 'application/json',
    })
    fireEvent.change(screen.getByLabelText('选择备份文件'), {
      target: { files: [bad] },
    })

    expect(await screen.findByText('这不是「今天练了吗」的备份文件')).toBeInTheDocument()
    expect(screen.queryByText('确认导入备份')).not.toBeInTheDocument()
    expect(await db.sessions.count()).toBe(1)
  })

  it('清空所有数据后回到首次引导', async () => {
    await makeSession()
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: '清空所有数据' }))
    await user.click(screen.getByRole('button', { name: '清空' }))

    expect(await screen.findByText('引导页内容')).toBeInTheDocument()
    expect(await db.sessions.count()).toBe(0)
    expect((await db.settings.get('settings'))?.onboardingDone).toBe(false)
  })
})
