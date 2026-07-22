import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

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
    const createButton = screen.getByRole('button', { name: '방 생성' })
    expect(createButton).toHaveClass('mobile-cta--primary')
    expect(createButton.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /활동 뽑기/ })).toHaveClass('mobile-cta--activity')
    expect(screen.getByRole('button', { name: /방 코드로 입장하기/ })).toHaveClass(
      'landing-join-trigger',
    )
    expect(screen.getByRole('button', { name: '사용법 열기' })).toHaveClass('mobile-help-trigger')
    expect(screen.getByText('오늘의 장소는 도착할 때까지 비밀이에요.')).toBeInTheDocument()
    expect(screen.queryByText('친구들의 비밀 후보')).not.toBeInTheDocument()
    expect(screen.queryByText('새로고침해도 잠금')).not.toBeInTheDocument()
    expect(screen.queryByText('도착 순간 공개')).not.toBeInTheDocument()
  })

  it('opens the restored usage guide from the help button', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '사용법 열기' }))

    expect(screen.getByRole('dialog', { name: 'OMYS 사용법' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '친구들과 시작하기' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'OMYS가 골라주기' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '할 거 없을 때' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '사용법 닫기' }))
    expect(screen.queryByRole('dialog', { name: 'OMYS 사용법' })).not.toBeInTheDocument()
  })

  it('starts a fresh activity session when re-entering from home', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      'omys:activity-session',
      JSON.stringify({ id: 'previous-session', token: 'previous-token' }),
    )
    localStorage.setItem('omys:participant:ABC123', 'room-token')

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /활동 뽑기/ }))

    expect(localStorage.getItem('omys:activity-session')).toBeNull()
    expect(localStorage.getItem('omys:participant:ABC123')).toBe('room-token')
    expect(await screen.findByText('지금 어떤 느낌이 필요한가요?')).toBeInTheDocument()
  })

  it('opens the room-code modal and accepts a six-character alphanumeric code', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /방 코드로 입장하기/ }))
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
