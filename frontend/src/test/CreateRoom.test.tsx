import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import CreateRoom from '../pages/CreateRoom'
import { searchKakaoLocation } from '../lib/kakao'

vi.mock('../lib/kakao', () => ({
  loadKakaoMaps: vi.fn().mockReturnValue(null),
  describeKakaoCoordinates: vi.fn(),
  searchKakaoLocation: vi.fn(),
}))

describe('CreateRoom departure location', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    vi.mocked(searchKakaoLocation).mockResolvedValue({
      label: '성수역',
      address: '서울 성동구 아차산로 100',
      latitude: 37.54458,
      longitude: 127.05596,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ invite_code: 'ROOM123', participant_token: 'participant-token' }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    )
  })

  function renderPage(mode = 'friends') {
    render(
      <MemoryRouter initialEntries={[`/create?mode=${mode}`]}>
        <Routes>
          <Route path="/create" element={<CreateRoom />} />
          <Route path="/room/:code" element={<div>방 생성 완료</div>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('출발 위치 입력을 누르면 기본 위치를 지도 확인 카드로 보여준다', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByLabelText('출발 위치'))

    expect(screen.getByRole('region', { name: '출발 위치 확인' })).toBeInTheDocument()
    expect(screen.getByText('서울 중구 세종대로 110')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /이곳이 맞아요/ })).toBeInTheDocument()
  })

  it('확정한 위치 좌표로 방을 만들고 주변 검색 기준을 저장한다', async () => {
    const user = userEvent.setup()
    renderPage()

    const locationInput = screen.getByLabelText('출발 위치')
    await user.clear(locationInput)
    await user.type(locationInput, '성수역')
    await user.click(screen.getByRole('button', { name: /입력한 위치 찾기/ }))

    expect(await screen.findByText('서울 성동구 아차산로 100')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /이곳이 맞아요/ }))
    expect(screen.getByText('출발 위치로 확정했어요')).toBeInTheDocument()

    await user.type(screen.getByLabelText('내 닉네임'), '테스터')
    await user.click(screen.getByRole('button', { name: /초대 방 만들기/ }))

    expect(await screen.findByText('방 생성 완료')).toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const [, options] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(options?.body))
    expect(body.departure).toEqual({
      label: '성수역',
      latitude: 37.54458,
      longitude: 127.05596,
    })
  })

  it('OMYS 모드에서 도착 전 숨김 여부를 STEP 1에서 저장한다', async () => {
    const user = userEvent.setup()
    renderPage('omys')

    await user.click(screen.getByLabelText('출발 위치'))
    await user.click(screen.getByRole('button', { name: /이곳이 맞아요/ }))
    await user.type(screen.getByLabelText('내 닉네임'), '탐험가')

    const hideOption = screen.getByRole('checkbox', { name: /도착할 때까지 장소 숨기기/ })
    expect(hideOption).toBeChecked()
    await user.click(hideOption)
    await user.click(screen.getByRole('button', { name: '조건 선택하러 가기' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const [, options] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(options?.body))
    expect(body.hide_until_arrival).toBe(false)
  })
})
