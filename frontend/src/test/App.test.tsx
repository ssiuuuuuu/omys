import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

afterEach(cleanup)

vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.resolve(new Response(JSON.stringify({ accepted: true }), { status: 202 }))),
)

describe('OMYS mobile flow', () => {
  it('shows both mystery modes on the landing page', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /목적지는 비밀/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '방 생성' })).toHaveClass('mobile-cta--primary')
    expect(screen.getByRole('button', { name: '방 입장' })).toHaveClass('mobile-cta--secondary')
    expect(screen.getByRole('button', { name: /활동 뽑기/ })).toHaveClass('mobile-cta--activity')
    expect(screen.getByText('오늘의 장소는 도착할 때까지 비밀이에요.')).toBeInTheDocument()
    expect(screen.queryByText('친구들의 비밀 후보')).not.toBeInTheDocument()
    expect(screen.queryByText('새로고침해도 잠금')).not.toBeInTheDocument()
    expect(screen.queryByText('도착 순간 공개')).not.toBeInTheDocument()
  })

  it('opens the room-code modal and accepts a six-character alphanumeric code', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '방 입장' }))
    expect(screen.getByRole('dialog', { name: '방 코드로 입장하기' })).toBeInTheDocument()
    const codeInput = screen.getByLabelText('방 코드')
    await user.type(codeInput, 'ab-12cd3')

    expect(codeInput).toHaveValue('AB12CD')
    const joinButton = screen.getByRole('button', { name: '입장하기' })
    expect(joinButton).toBeEnabled()
    await user.click(joinButton)

    expect(screen.getByText('초대 코드 · AB12CD')).toBeInTheDocument()
  })

  it('renders the invite nickname flow without sign-up', () => {
    render(
      <MemoryRouter initialEntries={['/join/ABC123']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByText(/비밀 초대장이 도착했어요/)).toBeInTheDocument()
    expect(screen.getByLabelText('내 닉네임')).toBeRequired()
    expect(screen.getByText(/회원가입은 필요 없습니다/)).toBeInTheDocument()
  })
})
