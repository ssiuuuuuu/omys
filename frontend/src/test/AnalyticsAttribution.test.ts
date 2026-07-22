import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { track } from '../lib/api'

describe('traffic attribution', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('omys:anonymous-session', 'test-session')
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ accepted: true }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    )
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
    vi.unstubAllGlobals()
  })

  it('captures UTM values and keeps them for later page events in the same tab', async () => {
    window.history.replaceState(
      {},
      '',
      '/?utm_source=instagram&utm_medium=social&utm_campaign=launch&utm_content=profile',
    )
    track('landing_view')

    window.history.replaceState({}, '', '/create')
    track('create_started')

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const payloads = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String(call[1]?.body)))
    expect(payloads[0].metadata).toMatchObject({
      utm_source: 'instagram',
      utm_medium: 'social',
      utm_campaign: 'launch',
      utm_content: 'profile',
      landing_path: '/',
    })
    expect(payloads[1].metadata.utm_source).toBe('instagram')
    expect(payloads[1].metadata.utm_content).toBe('profile')
  })
})
