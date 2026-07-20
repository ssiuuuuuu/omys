import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Conditions } from '../components/Conditions'
import { resetLocalSession } from '../lib/api'

describe('Conditions', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    )
  })

  it('MVP 이동 수단을 도보로 제한하고 불필요한 조건을 표시하지 않는다', () => {
    render(<Conditions code="ROOM123" token="participant-token" onSelected={vi.fn()} />)

    expect(screen.getByRole('button', { name: '도보' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /대중교통/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /자동차/ })).toBeDisabled()
    expect(screen.getByText('대중교통과 자동차는 아직 구현되지 않았어요.')).toBeInTheDocument()
    expect(screen.queryByText('1인 예산')).not.toBeInTheDocument()
    expect(screen.queryByText('참가 인원')).not.toBeInTheDocument()
    expect(screen.queryByText('피하고 싶은 활동')).not.toBeInTheDocument()
  })

  it('추천 요청을 항상 도보 조건으로 전송한다', async () => {
    const user = userEvent.setup()
    const onSelected = vi.fn()
    render(<Conditions code="ROOM123" token="participant-token" onSelected={onSelected} />)

    await user.click(screen.getByRole('button', { name: /비밀 스팟 뽑기/ }))

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const [, options] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(options?.body))
    expect(body.transport_mode).toBe('walk')
    expect(body).not.toHaveProperty('budget_per_person')
    expect(body).not.toHaveProperty('party_size')
    expect(body).not.toHaveProperty('excluded_activities')
    expect(body).not.toHaveProperty('total_available_minutes')
    expect(onSelected).toHaveBeenCalledOnce()
  })

  it('후보가 없으면 조건을 완화하라는 안내를 표시한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              detail:
                '조건에 맞는 비밀 스팟을 찾지 못했습니다. 최대 이동 시간을 늘리거나 카테고리·공간 선호 같은 조건을 조금 완화해 주세요.',
            }),
            {
              status: 422,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        ),
      ),
    )
    const user = userEvent.setup()
    render(<Conditions code="ROOM123" token="participant-token" onSelected={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /비밀 스팟 뽑기/ }))

    expect(await screen.findByText(/조건을 조금 완화해 주세요/)).toBeInTheDocument()
  })

  it('홈 이동 시 OMYS 저장값은 모두 지우고 다른 사이트 저장값은 유지한다', () => {
    localStorage.setItem('omys:participant:ROOM123', 'participant-token')
    localStorage.setItem('omys:anonymous-session', 'anonymous-session')
    localStorage.setItem('unrelated-setting', 'keep')

    resetLocalSession()

    expect(localStorage.getItem('omys:participant:ROOM123')).toBeNull()
    expect(localStorage.getItem('omys:anonymous-session')).toBeNull()
    expect(localStorage.getItem('unrelated-setting')).toBe('keep')
  })
})
