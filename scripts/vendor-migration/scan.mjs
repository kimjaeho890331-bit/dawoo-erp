/**
 * ① 수집 — 파일서버 협력업체 폴더를 스캔해 scan.json을 만든다.
 *
 * NAS는 읽기 전용으로만 만진다. 원본을 옮기거나 지우지 않는다.
 * 설계: docs/superpowers/specs/2026-07-31-vendor-nas-migration-design.md
 *
 * 실행: node scripts/vendor-migration/scan.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE = '\\\\DAWOO-SERVER\\관리부\\01. 사무관리\\5. 협력업체 관련서류'
const OUT_DIR = 'C:\\Users\\dawoo\\ERP 헤르메스\\vendor-migration-work'

/** 업체 폴더가 아닌 것 — ★로 시작하는 양식 폴더 */
const isVendorFolder = name => !name.startsWith('★')

/** 업로드 제외 규칙 (설계 "대상/제외") */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
/** 윈도우·오피스가 남기는 부산물. 서류가 아니다. */
const isJunk = name =>
  /^(thumbs\.db|desktop\.ini|\.ds_store)$/i.test(name) || name.startsWith('~$')
const skipReason = f => {
  if (isJunk(f.name)) return '정크파일'
  if (f.ext === '.tmp') return '임시파일'
  if (f.size > MAX_UPLOAD_BYTES) return '20MB초과'
  return null
}

/**
 * 파일명으로 서류 종류를 1차 분류한다.
 * 확정이 아니라 ② 판독의 후보를 좁히는 용도 — 애매하면 'etc'로 둔다.
 *
 * `사업자등록증, 통장사본.pdf`처럼 한 파일에 두 서류가 든 합본이 있어서
 * 태그를 배열로 돌린다. 하나만 고르면 나머지 한 종류를 놓친다.
 */
function classify(name) {
  const tags = []
  // '다우건설 사업자등록증'은 우리 회사 서류다. 협력업체 것으로 오인하면 안 된다.
  const isOurs = /다우건설|다우 건설/.test(name)
  if (/사업자|등록증/.test(name)) tags.push(isOurs ? 'biz_license_ours' : 'biz_license')
  if (/통장|계좌/.test(name)) tags.push('bankbook')
  if (/신분증|주민등록증/.test(name)) tags.push('id_card')
  if (/안전보건|안전관리|안전교육|안전증|산재|고용보험/.test(name)) tags.push('safety_cert')
  if (/명함/.test(name)) tags.push('namecard')
  if (/계약서/.test(name)) tags.push('contract')
  return tags.length ? tags : ['etc']
}

function walk(dir, base) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...walk(abs, base))
    } else if (e.isFile()) {
      const st = fs.statSync(abs)
      const ext = path.extname(e.name).toLowerCase()
      const f = { name: e.name, rel: path.relative(base, abs), abs, ext, size: st.size }
      f.tags = classify(e.name)
      f.skip = skipReason(f)
      out.push(f)
    }
  }
  return out
}

const folders = fs
  .readdirSync(BASE, { withFileTypes: true })
  .filter(e => e.isDirectory() && isVendorFolder(e.name))
  .map(e => e.name)
  .sort((a, b) => a.localeCompare(b, 'ko'))

const vendors = folders.map(folder => {
  const dir = path.join(BASE, folder)
  const files = walk(dir, dir)
  return {
    folder,
    dir,
    files,
    counts: {
      total: files.length,
      upload: files.filter(f => !f.skip).length,
      biz_license: files.filter(f => f.tags.includes('biz_license')).length,
      bankbook: files.filter(f => f.tags.includes('bankbook')).length,
    },
  }
})

fs.mkdirSync(OUT_DIR, { recursive: true })
const outPath = path.join(OUT_DIR, 'scan.json')
fs.writeFileSync(
  outPath,
  JSON.stringify({ scannedAt: new Date().toISOString(), base: BASE, vendors }, null, 2),
  'utf8'
)

const all = vendors.flatMap(v => v.files)
const mb = n => (n / 1024 / 1024).toFixed(1)
console.log(`업체 폴더 ${vendors.length}개 / 파일 ${all.length}개`)
console.log(`총 ${mb(all.reduce((s, f) => s + f.size, 0))}MB`)
console.log(`업로드 대상 ${all.filter(f => !f.skip).length}개 / ${mb(all.filter(f => !f.skip).reduce((s, f) => s + f.size, 0))}MB`)
console.log(`제외 ${all.filter(f => f.skip).length}개 (${[...new Set(all.filter(f => f.skip).map(f => f.skip))].join(', ')})`)
console.log('')
console.log('--- 서류 분류 (합본은 중복 집계) ---')
const tagCount = all.flatMap(f => f.tags).reduce((m, t) => ({ ...m, [t]: (m[t] || 0) + 1 }), {})
for (const [k, v] of Object.entries(tagCount).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`)
}
console.log('')
console.log(`사업자등록증 있는 폴더: ${vendors.filter(v => v.counts.biz_license > 0).length}`)
console.log(`통장사본 있는 폴더:   ${vendors.filter(v => v.counts.bankbook > 0).length}`)
console.log(`둘 다 없는 폴더:      ${vendors.filter(v => !v.counts.biz_license && !v.counts.bankbook).length}`)
console.log('')
console.log(`→ ${outPath}`)
