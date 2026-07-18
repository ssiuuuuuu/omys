import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'

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
    expect(screen.getByRole('link', { name: /친구들과 시작하기/ })).toHaveAttribute(
      'href',
      '/create?mode=friends',
    )
    expect(screen.getByRole('link', { name: /OMYS가 골라주기/ })).toHaveAttribute(
      'href',
      '/create?mode=omys',
    )
    expect(screen.getByRole('link', { name: /친구들과 시작하기/ })).toHaveClass('button--primary')
    expect(screen.getByRole('link', { name: /OMYS가 골라주기/ })).toHaveClass('button--primary')
    expect(screen.getByRole('link', { name: '활동 뽑기' })).toHaveAttribute('href', '/activities')
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
