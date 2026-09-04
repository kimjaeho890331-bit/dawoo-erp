import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'NoticePage.tsx'),
  'utf8',
)

describe('NoticePage', () => {
  it('TelegramGuideBox를 import하거나 렌더하지 않는다', () => {
    expect(src).not.toMatch(/TelegramGuideBox/)
    expect(src).not.toMatch(/Agents_DW_bot/)
    expect(src).not.toMatch(/desktop\.telegram\.org/)
    expect(src).not.toMatch(/telegram/i)
  })

  it('페이지가 notices 테이블만 읽는다', () => {
    const tables = [...src.matchAll(/\.from\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1])
    expect(tables.length).toBeGreaterThan(0)
    expect(tables.every(t => t === 'notices')).toBe(true)
    expect(src).not.toMatch(/staff_invitations/)
  })
})
