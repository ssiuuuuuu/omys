import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'

const activity = {
  id: 'dopamine_01',
  mood: 'dopamine',
  title: '10분 금지어 게임',
  description: '금지어 하나를 정하고 먼저 말한 사람이 패배합니다.',
  duration_seconds: 600,
  is_active: true,
}

function session(status = 'choosing', startedAt: string | null = null) {
  return {
    id: 'activity-session-1',
    anonymous_session_id: 'anonymous-activity-user',
    session_token: null,
    selected_mood: status === 'choosing' ? null : 'dopamine',
    current_activity_id: status === 'choosing' ? null : activity.id,
    previously_drawn_activity_ids: [],
    status,
    started_at: startedAt,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
    result: status === 'completed' ? 'success' : null,
    party_size: null,
    activity: status === 'choosing' ? null : activity,
  }
}

describe('mystery activities', () => {
  beforeEach(() => {
    localStorage.clear()
    let current = session()
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/draw')) current = session('drawn')
        else if (url.endsWith('/start')) current = session('started', new Date().toISOString())
        else if (url.endsWith('/complete')) current = session('completed')
        const creating = options?.method === 'POST' && url.endsWith('/activity-sessions')
        const status = creating ? 201 : 200
        const responseBody = creating ? { ...current, session_token: 'activity-secret' } : current
        return Promise.resolve(
          new Response(JSON.stringify(responseBody), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('selects a mood, draws, starts and completes an activity', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/activities']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByText('지금 어떤 느낌이 필요한가요?')).toBeInTheDocument()
    const pageViewRequest = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).endsWith('/api/analytics'))
    expect(JSON.parse(String(pageViewRequest?.[1]?.body)).event_name).toBe('activity_page_view')
    expect(screen.getByRole('button', { name: /가볍게/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /웃기게/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /도파민/ }))

    expect(await screen.findByText(activity.title)).toBeInTheDocument()
    const drawRequest = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).endsWith('/draw'))
    expect(new Headers(drawRequest?.[1]?.headers).get('X-Session-Token')).toBe('activity-secret')
    await user.click(screen.getByRole('button', { name: '활동 시작' }))
    expect(await screen.findByText('남은 시간')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '성공했어요' }))
    expect(await screen.findByText('성공! 🎉')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /공유/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /링크 복사/ })).toBeInTheDocument()
  })

  it('restores an active timer and counts down after refresh', async () => {
    const now = new Date('2026-07-18T12:00:00Z')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(now)
    localStorage.setItem(
      'omys:activity-session',
      JSON.stringify({ id: 'activity-session-1', token: 'activity-secret' }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(session('started', now.toISOString())), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    )

    render(
      <MemoryRouter initialEntries={['/activities?session=activity-session-1']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByText('10:00')).toBeInTheDocument()
    const restoreRequest = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/activity-sessions/activity-session-1'))
    expect(new Headers(restoreRequest?.[1]?.headers).get('X-Session-Token')).toBe('activity-secret')
    await act(async () => vi.advanceTimersByTime(1000))
    expect(screen.getByText('09:59')).toBeInTheDocument()
  })
})
