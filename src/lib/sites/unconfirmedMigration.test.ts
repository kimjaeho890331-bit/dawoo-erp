import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/025_sites_inflow_work_kind_unconfirmed.sql'),
  'utf8',
)

const applied = sql
  .split('-- 롤백')[0]
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('025 미확인 마이그레이션', () => {
  it('제약에 기존 값과 미확인을 넣고 NULL은 허용한다', () => {
    expect(applied).toMatch(/sites_inflow_path_check/)
    expect(applied).toMatch(/sites_work_kind_check/)
    expect(applied).toMatch(/inflow_path IS NULL OR inflow_path IN/)
    expect(applied).toMatch(/work_kind IS NULL OR work_kind IN/)
    for (const path of ['소개', '재계약', '협력사등록', '직접문의', '나라장터공고', '기타', '미확인']) {
      expect(applied).toContain(`'${path}'`)
    }
    for (const kind of ['기계가스설비', '실내건축', '습식방수', '금속창호', '도장', '미확인']) {
      expect(applied).toContain(`'${kind}'`)
    }
  })

  it('두 컬럼 DEFAULT는 미확인이다', () => {
    expect(applied).toMatch(/ALTER COLUMN inflow_path SET DEFAULT '미확인'/)
    expect(applied).toMatch(/ALTER COLUMN work_kind SET DEFAULT '미확인'/)
  })

  it('백필은 NULL만 바꾸고 다른 값은 추정하지 않는다', () => {
    const updates = [...applied.matchAll(/UPDATE\s+sites[\s\S]*?;/gi)].map(m => m[0])
    expect(updates).toHaveLength(2)
    expect(updates[0]).toMatch(/SET inflow_path\s*=\s*'미확인'\s+WHERE inflow_path IS NULL/)
    expect(updates[1]).toMatch(/SET work_kind\s*=\s*'미확인'\s+WHERE work_kind IS NULL/)
  })

  it('NOT NULL / DROP / RLS를 건드리지 않는다', () => {
    expect(applied).not.toMatch(/SET\s+NOT\s+NULL/i)
    expect(applied).not.toMatch(/DROP\s+COLUMN/i)
    expect(applied).not.toMatch(/DROP\s+TABLE/i)
    expect(applied).not.toMatch(/\bRLS\b/i)
    expect(applied).not.toMatch(/ENABLE ROW LEVEL SECURITY/i)
  })
})
