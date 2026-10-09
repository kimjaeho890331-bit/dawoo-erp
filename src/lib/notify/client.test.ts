import { describe, it, expect, vi, afterEach } from 'vitest'
import { notify, notifyLeave, notifyTask } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('notify', () => {
  it('POST + keepalive로 보내고 기다리지 않는다', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const result = notify('/api/notify/task', { task_id: 't', event: 'done' })

    expect(result).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/notify/task', expect.objectContaining({
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({ task_id: 't', event: 'done' }),
    }))
  })

  it('네트워크 오류가 나도 던지지 않는다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(() => notify('/api/notify/leave', {})).not.toThrow()
    await new Promise(r => setTimeout(r, 0))
    expect(console.warn).toHaveBeenCalled()
  })

  it('fetch가 즉시 던져도 삼킨다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('boom') }))
    expect(() => notify('/api/notify/leave', {})).not.toThrow()
  })
})

describe('notifyLeave / notifyTask', () => {
  it('정해진 경로와 본문으로 보낸다', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    notifyLeave('L1', 'requested')
    notifyTask('T1', 'assigned')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/notify/leave')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ leave_id: 'L1', event: 'requested' })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/notify/task')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ task_id: 'T1', event: 'assigned' })
  })
})
