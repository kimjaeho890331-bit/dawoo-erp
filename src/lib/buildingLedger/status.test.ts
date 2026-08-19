import { describe, expect, it } from 'vitest'
import {
  buildConfirmUpdate,
  buildIssueUpdate,
  canCancelRequest,
  canQueueProject,
  canTransition,
  clampQueueLimit,
  displayAddress,
  mergeIssueIds,
  parseQueueStatus,
  snapshotAddress,
} from './status'

describe('canQueueProject', () => {
  it('열린 요청이 없으면 신청할 수 있다', () => {
    expect(canQueueProject([])).toBe(true)
    expect(canQueueProject(['confirmed'])).toBe(true)
  })

  it('requested 또는 issued가 있으면 다시 넣을 수 없다', () => {
    expect(canQueueProject(['requested'])).toBe(false)
    expect(canQueueProject(['issued'])).toBe(false)
    expect(canQueueProject(['confirmed', 'requested'])).toBe(false)
  })
})

describe('status transitions', () => {
  it('requested → issued → confirmed 만 허용한다', () => {
    expect(canTransition('requested', 'issued')).toBe(true)
    expect(canTransition('issued', 'confirmed')).toBe(true)
  })

  it('단계를 건너뛰거나 되돌릴 수 없다', () => {
    expect(canTransition('requested', 'confirmed')).toBe(false)
    expect(canTransition('issued', 'issued')).toBe(false)
    expect(canTransition('confirmed', 'issued')).toBe(false)
    expect(canTransition('issued', 'requested')).toBe(false)
    expect(canTransition('confirmed', 'requested')).toBe(false)
  })

  it('신청 중일 때만 빼기할 수 있다', () => {
    expect(canCancelRequest('requested')).toBe(true)
    expect(canCancelRequest('issued')).toBe(false)
    expect(canCancelRequest('confirmed')).toBe(false)
  })
})

describe('address snapshot', () => {
  it('도로명주소를 우선하고, 없으면 지번, 둘 다 없으면 null', () => {
    expect(snapshotAddress({
      road_address: '경기도 수원시 팔달로 1',
      jibun_address: '경기도 수원시 인계동 1',
    })).toBe('경기도 수원시 팔달로 1')
    expect(snapshotAddress({
      road_address: '  ',
      jibun_address: '경기도 수원시 인계동 1',
    })).toBe('경기도 수원시 인계동 1')
    expect(snapshotAddress({ road_address: null, jibun_address: null })).toBeNull()
    expect(snapshotAddress({ road_address: '', jibun_address: '  ' })).toBeNull()
  })

  it('주소가 없으면 주소 없음을 분명히 보여준다', () => {
    expect(displayAddress(null, null)).toEqual({ text: '주소 없음', missing: true })
    expect(displayAddress('팔달로 1', null)).toEqual({ text: '팔달로 1', missing: false })
  })
})

describe('queue API helpers', () => {
  it('limit은 기본 5, 최대 5이다', () => {
    expect(clampQueueLimit(null)).toBe(5)
    expect(clampQueueLimit('3')).toBe(3)
    expect(clampQueueLimit('10')).toBe(5)
    expect(clampQueueLimit('0')).toBe(5)
    expect(clampQueueLimit('abc')).toBe(5)
  })

  it('queue status는 requested(기본) 또는 issued만 받는다', () => {
    expect(parseQueueStatus(null)).toBe('requested')
    expect(parseQueueStatus('issued')).toBe('issued')
    expect(parseQueueStatus('confirmed')).toBeNull()
    expect(parseQueueStatus('requested')).toBe('requested')
  })
})

describe('issue / confirm patches', () => {
  it('보낸 드라이브 필드만 저장하고 URL을 만들지 않는다', () => {
    const now = '2026-08-19T00:00:00.000Z'
    expect(buildIssueUpdate({}, now, 'batch-1')).toEqual({
      status: 'issued',
      issued_at: now,
      updated_at: now,
      batch_key: 'batch-1',
    })
    expect(buildIssueUpdate({
      drive_file_id: 'file-1',
      drive_file_url: 'https://drive.google.com/file/d/file-1',
    }, now)).toEqual({
      status: 'issued',
      issued_at: now,
      updated_at: now,
      drive_file_id: 'file-1',
      drive_file_url: 'https://drive.google.com/file/d/file-1',
    })
  })

  it('확인은 issued에서만 쓰이는 패치를 만든다', () => {
    const now = '2026-08-19T01:00:00.000Z'
    expect(buildConfirmUpdate('11111111-1111-1111-1111-111111111111', now)).toEqual({
      status: 'confirmed',
      confirmed_at: now,
      updated_at: now,
      confirmed_by: '11111111-1111-1111-1111-111111111111',
    })
    expect(buildConfirmUpdate(undefined, now)).toEqual({
      status: 'confirmed',
      confirmed_at: now,
      updated_at: now,
    })
  })

  it('ids와 items를 합치고 잘못된 uuid는 거절한다', () => {
    const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const merged = mergeIssueIds([a], [{ id: b, drive_file_id: 'f' }])
    expect(merged.ok).toBe(true)
    if (merged.ok) {
      expect(merged.items).toHaveLength(2)
      expect(merged.items.find(x => x.id === b)?.drive_file_id).toBe('f')
    }
    expect(mergeIssueIds(['not-a-uuid'], undefined).ok).toBe(false)
    expect(mergeIssueIds([], []).ok).toBe(false)
  })
})
