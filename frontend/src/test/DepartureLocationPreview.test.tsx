import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'

import { DepartureLocationPreview } from '../components/DepartureLocationPreview'
import {
  clipRouteToBounds,
  MysteryNavigation,
  selectMetricViewport,
  shouldShowDestination,
} from '../components/MysteryNavigation'
import { loadKakaoMaps, type KakaoLocation } from '../lib/kakao'

vi.mock('../lib/kakao', () => ({
  loadKakaoMaps: vi.fn(),
}))

describe('DepartureLocationPreview map selection', () => {
  const handlers: Record<string, () => void> = {}
  let selectedCenter = { getLat: () => 37.5665, getLng: () => 126.978 }

  beforeEach(() => {
    selectedCenter = { getLat: () => 37.5665, getLng: () => 126.978 }
    Object.keys(handlers).forEach((key) => delete handlers[key])

    class LatLng {
      constructor(
        private latitude: number,
        private longitude: number,
      ) {}
      getLat() {
        return this.latitude
      }
      getLng() {
        return this.longitude
      }
    }

    class MapMock {
      relayout() {}
      setCenter() {}
      getCenter() {
        return selectedCenter
      }
    }

    class Geocoder {
      coord2Address(_longitude: number, _latitude: number, callback: (items: unknown[]) => void) {
        callback([
          {
            road_address: { address_name: '서울 종로구 새문안로 55' },
            address: { address_name: '서울 종로구 신문로2가' },
          },
        ])
      }
    }

    vi.mocked(loadKakaoMaps).mockResolvedValue({
      LatLng,
      Map: MapMock,
      Marker: class {},
      event: {
        addListener: (_target: unknown, type: string, handler: () => void) => {
          handlers[type] = handler
        },
        removeListener: vi.fn(),
      },
      services: { Geocoder },
    } as never)
  })

  afterEach(() => cleanup())

  it('지도 중심을 옮기면 새 주소와 좌표를 다시 확정한다', async () => {
    function Harness() {
      const [location, setLocation] = useState<KakaoLocation>({
        label: '서울시청',
        address: '서울 중구 세종대로 110',
        latitude: 37.5665,
        longitude: 126.978,
      })
      const [confirmed, setConfirmed] = useState(true)

      return (
        <DepartureLocationPreview
          location={location}
          confirmed={confirmed}
          onMoveStart={() => setConfirmed(false)}
          onLocationChange={setLocation}
          onConfirm={() => setConfirmed(true)}
        />
      )
    }

    const user = userEvent.setup()
    render(<Harness />)
    expect(await screen.findByText('지도를 움직여 위치를 조정하세요')).toBeInTheDocument()

    act(() => handlers.dragstart())
    expect(screen.getByText('위치를 확인하고 있어요…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /이곳이 맞아요/ })).toBeDisabled()

    selectedCenter = { getLat: () => 37.5709, getLng: () => 126.9727 }
    act(() => handlers.dragend())

    expect(await screen.findAllByText('서울 종로구 새문안로 55')).toHaveLength(2)
    expect(screen.getByText('37.57090, 126.97270')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /이곳이 맞아요/ }))
    expect(screen.getByText('출발 위치로 확정했어요')).toBeInTheDocument()
  })
})

describe('MysteryNavigation map geometry', () => {
  afterEach(() => cleanup())

  class LatLng {
    constructor(
      private latitude: number,
      private longitude: number,
    ) {}
    getLat() {
      return this.latitude
    }
    getLng() {
      return this.longitude
    }
  }

  it('clips a route segment that crosses the viewport with both endpoints outside', () => {
    let containCalls = 0
    const result = clipRouteToBounds(
      [
        { latitude: 5, longitude: -5 },
        { latitude: 5, longitude: 15 },
      ],
      {
        contain: () => {
          containCalls += 1
          return false
        },
        getSouthWest: () => new LatLng(0, 0),
        getNorthEast: () => new LatLng(10, 10),
      },
      { LatLng },
    )

    expect(containCalls).toBe(2)
    expect(result).toEqual([
      { latitude: 5, longitude: 0 },
      { latitude: 5, longitude: 10 },
    ])
  })

  it('keeps the destination marker stable between the show and hide thresholds', () => {
    expect(shouldShowDestination(false, 101, true)).toBe(false)
    expect(shouldShowDestination(false, 100, true)).toBe(true)
    expect(shouldShowDestination(true, 149, true)).toBe(true)
    expect(shouldShowDestination(true, 150, true)).toBe(false)
  })

  it('selects the most detailed 300m viewport that fits a narrow mobile screen', () => {
    const candidates = [
      { level: 1, width: 620, height: 610 },
      { level: 2, width: 310, height: 305 },
      { level: 3, width: 155, height: 153 },
    ]

    expect(selectMetricViewport(candidates, 360, 280)).toEqual(candidates[2])
    expect(selectMetricViewport(candidates, 390, 330)).toEqual(candidates[1])
  })

  it('submits the development admin key to reveal the destination', async () => {
    const user = userEvent.setup()
    const onReveal = vi.fn()
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 'revealed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn(() => 1),
        clearWatch: vi.fn(),
      },
    })
    vi.mocked(loadKakaoMaps).mockReturnValue(null)

    render(
      <MysteryNavigation
        code="ROOM123"
        token="participant-token"
        hideUntilArrival
        onReveal={onReveal}
      />,
    )
    expect(screen.queryByText('위치 없이 수동 공개하기')).not.toBeInTheDocument()
    await user.click(screen.getByText('테스트용 목적지 확인'))
    await user.type(screen.getByLabelText('관리자 키'), '1210')
    await user.click(screen.getByRole('button', { name: '목적지 보기' }))

    await waitFor(() => expect(onReveal).toHaveBeenCalledOnce())
    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(options?.body))).toEqual({ admin_key: '1210' })
  })
})
