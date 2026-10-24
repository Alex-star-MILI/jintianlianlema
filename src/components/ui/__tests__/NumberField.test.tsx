import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberField } from '../NumberField'

describe('NumberField', () => {
  it('显示外部传入的数值', () => {
    render(<NumberField value={60} onChange={() => {}} ariaLabel="重量" />)
    expect(screen.getByDisplayValue('60')).toBeInTheDocument()
  })

  it('输入合法数字后回调新值', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField value={null} onChange={onChange} ariaLabel="重量" max={500} />)
    const input = screen.getByLabelText('重量')
    await user.type(input, '75')
    expect(onChange).toHaveBeenLastCalledWith(75)
  })

  it('超出最大值时不回调', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField value={null} onChange={onChange} ariaLabel="次数" max={5} />)
    await user.type(screen.getByLabelText('次数'), '9')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('次数')).toHaveAttribute('aria-invalid', 'true')
  })

  it('忽略非数字字符', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField value={null} onChange={onChange} ariaLabel="重量" />)
    const input = screen.getByLabelText('重量')
    await user.type(input, 'a')
    expect((input as HTMLInputElement).value).toBe('')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('清空时回调 null', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField value={60} onChange={onChange} ariaLabel="重量" />)
    await user.clear(screen.getByLabelText('重量'))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
