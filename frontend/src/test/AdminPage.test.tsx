import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

function stats(range = '6h') {
  return {
    visitors: 9,
    pageviews: 13,
    activity_visitors: 7,
    activity_pageviews: 11,
    rooms_created: 5,
    rooms_with_2_plus: 3,
    draw_completed: 2,
    revealed: 1,
    shares: 1,
    conversion: { room_to_draw_percent: 40, draw_to_reveal_percent: 50 },
    period: {
      range,
      label: range === '3d' ? '최근 3일' : `최근 ${range.replace('h', '시간')}`,
      timezone: 'Asia/Seoul',
      bucket_hours: range === '3d' ? 6 : 1,
      start: '2026-07-20T08:00:00+09:00',
      end: '2026-07-20T14:00:00+09:00',
      totals: {
        visitors: 4,
        pageviews: 6,
        activity_visitors: 3,
        activity_pageviews: 5,
        rooms_created: 2,
        rooms_with_2_plus: 1,
        draw_completed: 1,
        revealed: 1,
        shares: 0,
        conversion: { room_to_draw_percent: 50, draw_to_reveal_percent: 100 },
      },
      series: [
        {
          start: '2026-07-20T13:00:00+09:00',
          end: '2026-07-20T14:00:00+09:00',
          label: '13시',
          visitors: 4,
          pageviews: 6,
          activity_visitors: 3,
          activity_pageviews: 5,
          rooms_created: 2,
          rooms_with_2_plus: 1,
          draw_completed: 1,
          revealed: 1,
          shares: 0,
        },
      ],
      traffic_sources: [
        {
          source: 'instagram',
          campaign: 'launch',
          content: 'profile',
          visitors: 3,
          pageviews: 4,
          create_starts: 2,
          activity_starts: 1,
          conversion_percent: 66.7,
        },
      ],
    },
  }
}

describe('admin analytics dashboard', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        const range = new URL(url, 'http://localhost').searchParams.get('range') ?? '6h'
        return Promise.resolve(
          new Response(JSON.stringify(stats(range)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('unlocks with the admin key and changes the reporting range', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('관리자 키'), 'secret-key')
    await user.click(screen.getByRole('button', { name: '통계 열기' }))

    expect(await screen.findByRole('heading', { name: '운영 대시보드' })).toBeInTheDocument()
    expect(screen.getByLabelText('최근 6시간 요약')).toBeInTheDocument()
    expect(screen.getByText('전체 누적')).toBeInTheDocument()
    expect(screen.getByText('instagram')).toBeInTheDocument()
    expect(screen.getByText('66.7%')).toBeInTheDocument()

    const firstRequest = vi.mocked(fetch).mock.calls[0]
    expect(String(firstRequest[0])).toContain('/api/admin/stats?range=6h')
    expect(new Headers(firstRequest[1]?.headers).get('X-Admin-Key')).toBe('secret-key')

    await user.click(screen.getByRole('button', { name: '3일' }))
    await waitFor(() => expect(screen.getByLabelText('최근 3일 요약')).toBeInTheDocument())
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain('range=3d')
  })
})
