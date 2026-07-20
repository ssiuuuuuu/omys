import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Shell } from '../components/UI'

describe('Shell navigation', () => {
  afterEach(cleanup)

  it('상단의 STEP 1 화살표와 홈 아이콘을 각각 실행한다', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    const onHome = vi.fn()
    render(
      <MemoryRouter>
        <Shell back backLabel="STEP 1로 돌아가기" onBack={onBack} home onHome={onHome}>
          조건 설정
        </Shell>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'STEP 1로 돌아가기' }))
    await user.click(screen.getByRole('button', { name: '홈으로' }))

    expect(onBack).toHaveBeenCalledOnce()
    expect(onHome).toHaveBeenCalledOnce()
  })
})
