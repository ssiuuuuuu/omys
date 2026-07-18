import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PlaceSearch } from '../components/PlaceSearch'
import { searchKakaoPlaces } from '../lib/kakao'

vi.mock('../lib/kakao', () => ({ searchKakaoPlaces: vi.fn().mockResolvedValue(null) }))

const place = {
  external_place_id: 'mock-cafe',
  name: '서울숲 작은 로스터리',
  category: '게임·실내 놀거리',
  address: '서울 성동구 서울숲길',
  latitude: 37.5459,
  longitude: 127.0431,
  open_now: true,
  distance_meters: 820,
}

describe('PlaceSearch', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        const body = url.includes('/candidates') ? { candidate: place } : { places: [place] }

        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: url.includes('/candidates') ? 201 : 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }),
    )
  })

  it('종목을 선택한 뒤 가까운 장소를 표시하고 비밀 후보로 담는다', async () => {
    const user = userEvent.setup()
    const onSubmitted = vi.fn()

    render(
      <PlaceSearch
        code="ROOM123"
        token="participant-token"
        submitted={[]}
        departureLocation="서울시청"
        departureLatitude={37.5665}
        departureLongitude={126.978}
        onSubmitted={onSubmitted}
      />,
    )

    expect(screen.queryByText(place.name)).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '게임·실내 놀거리' }))
    await user.click(screen.getByRole('button', { name: '보드게임카페' }))
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByText(place.name)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '주변 장소 확인' }))

    expect(await screen.findByText(place.name)).toBeInTheDocument()
    expect(screen.getByText(/약 820m/)).toBeInTheDocument()
    expect(screen.getByText('서울시청에서 가까운 순')).toBeInTheDocument()
    expect(searchKakaoPlaces).toHaveBeenCalledWith('보드게임카페', 37.5665, 126.978)

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('q=%EB%B3%B4%EB%93%9C%EA%B2%8C%EC%9E%84%EC%B9%B4%ED%8E%98'),
      expect.any(Object),
    )

    await user.click(screen.getByRole('button', { name: '담기' }))

    expect(onSubmitted).toHaveBeenCalledOnce()
  })

  it('직접 입력한 종목으로 주변 장소를 검색한다', async () => {
    const user = userEvent.setup()

    render(
      <PlaceSearch
        code="ROOM123"
        token="participant-token"
        submitted={[]}
        departureLocation="서울시청"
        departureLatitude={37.5665}
        departureLongitude={126.978}
        onSubmitted={vi.fn()}
      />,
    )

    await user.type(screen.getByRole('textbox', { name: '하고 싶은 종목 직접 입력' }), '찜질방')
    expect(fetch).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '주변 장소 확인' }))

    expect(await screen.findByText(place.name)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('q=%EC%B0%9C%EC%A7%88%EB%B0%A9'),
      expect.any(Object),
    )
  })
})
