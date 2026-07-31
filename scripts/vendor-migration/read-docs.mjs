/**
 * ② 판독 — 사업자등록증·통장사본·명함을 읽어 거래처 필드를 추출한다.
 *
 * 설계: docs/superpowers/specs/2026-07-31-vendor-nas-migration-design.md
 * 판독이 애매하면 빈칸으로 두고 `판독불가`로 표시한다. 추측해서 채우지 않는다.
 *
 * 실행: node scripts/vendor-migration/read-docs.mjs
 * 이어하기: 이미 판독한 업체는 건너뛴다 (read.json에 누적).
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const WORK_DIR = 'C:\\Users\\dawoo\\ERP 헤르메스\\vendor-migration-work'
const SCAN = path.join(WORK_DIR, 'scan.json')
const OUT = path.join(WORK_DIR, 'read.json')

/** API에 올릴 수 있는 크기 상한. 넘으면 판독하지 않고 사유를 남긴다. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 이미지 1장당 API 상한
const MAX_PDF_BYTES = 10 * 1024 * 1024
const CONCURRENCY = 5
/** 압축 안에 든 서류를 풀어둘 곳. NAS 원본은 건드리지 않는다. */
const UNZIP_DIR = path.join(WORK_DIR, 'unzipped')

const MEDIA = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp',
}

// .env.local에서 키만 읽는다. 값은 로그·엑셀 어디에도 남기지 않는다.
const env = fs.readFileSync('C:\\Users\\dawoo\\ERP 헤르메스\\dawoo-erp\\.env.local', 'utf8')
const apiKey = env.match(/^ANTHROPIC_API_KEY="?([^"\r\n]+)"?/m)?.[1]
if (!apiKey) throw new Error('.env.local에 ANTHROPIC_API_KEY가 없다')

/** /api/chat과 같은 방식 — SDK 없이 fetch로 호출한다. 429·5xx는 백오프 재시도. */
async function callClaude(body, attempt = 0) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500
    if (retryable && attempt < 4) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt
      await new Promise(r => setTimeout(r, wait))
      return callClaude(body, attempt + 1)
    }
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  return res.json()
}

/** 빈 문자열 = 판독 실패. null을 쓰면 스키마가 복잡해지기만 한다. */
const SCHEMA = {
  type: 'object',
  properties: {
    company_name: { type: 'string', description: '사업자등록증의 상호(법인명). 없으면 빈 문자열' },
    business_number: { type: 'string', description: '사업자등록번호 000-00-00000 형식. 없으면 빈 문자열' },
    representative: { type: 'string', description: '대표자 성명. 없으면 빈 문자열' },
    address: { type: 'string', description: '사업장 소재지. 없으면 빈 문자열' },
    bank_name: { type: 'string', description: '통장사본의 은행명. 없으면 빈 문자열' },
    account_number: { type: 'string', description: '계좌번호(하이픈 포함 원본 그대로). 없으면 빈 문자열' },
    account_holder: { type: 'string', description: '예금주. 없으면 빈 문자열' },
    phone: { type: 'string', description: '전화번호. 없으면 빈 문자열' },
    email: { type: 'string', description: '이메일. 없으면 빈 문자열' },
    status: { type: 'string', enum: ['정상', '일부판독불가', '판독불가'] },
    notes: { type: 'string', description: '판독이 애매했던 부분. 없으면 빈 문자열' },
  },
  required: [
    'company_name', 'business_number', 'representative', 'address',
    'bank_name', 'account_number', 'account_holder', 'phone', 'email',
    'status', 'notes',
  ],
  additionalProperties: false,
}

const SYSTEM = `당신은 건설회사의 협력업체 서류를 판독한다.
첨부된 사업자등록증·통장사본·명함 이미지에서 아래 정보를 그대로 옮겨 적는다.

규칙:
- 보이는 그대로 옮긴다. 추론하거나 보정하지 않는다.
- 글자가 흐리거나 가려서 확신이 없으면 그 항목은 빈 문자열로 두고 notes에 이유를 적는다.
- 사업자등록번호와 계좌번호는 특히 중요하다. 숫자 하나라도 확신이 없으면 빈 문자열로 둔다.
- 계좌번호는 통장에 인쇄된 형태(하이픈 포함) 그대로 적는다.
- 서류가 '다우건설' 것이면 우리 회사 서류이므로 협력업체 정보로 쓰지 않는다. notes에 적고 빈 문자열로 둔다.
- status: 주요 항목이 다 읽히면 '정상', 일부만 읽히면 '일부판독불가', 거의 못 읽으면 '판독불가'.`

/**
 * 서류가 zip 안에 들어있는 폴더가 있다. 작업 디렉터리에 풀어서 읽는다.
 * NAS 원본은 읽기만 하고, 푼 파일은 vendor-migration-work 아래에만 둔다.
 */
function expandZips(vendor) {
  const zips = vendor.files.filter(
    f => f.ext === '.zip' && !f.skip && f.tags.some(t => t !== 'etc')
  )
  const out = []
  for (const z of zips) {
    const dest = path.join(UNZIP_DIR, vendor.folder.replace(/[^가-힣a-zA-Z0-9]/g, '_'))
    try {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true })
        execFileSync('powershell', [
          '-NoProfile', '-Command',
          `Expand-Archive -LiteralPath '${z.abs.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
        ])
      }
      for (const name of fs.readdirSync(dest)) {
        const abs = path.join(dest, name)
        const ext = path.extname(name).toLowerCase()
        if (!fs.statSync(abs).isFile() || (!MEDIA[ext] && ext !== '.pdf')) continue
        out.push({ name: `${z.name} > ${name}`, abs, ext, size: fs.statSync(abs).size, tags: z.tags })
      }
    } catch {
      // 압축이 깨졌거나 암호가 걸린 경우 — 그냥 건너뛴다. 검수표에 '서류없음'으로 남는다.
    }
  }
  return out
}

/** 판독 대상 파일 고르기 — 종류별 1장씩, 합본은 양쪽에 들어간다. */
function pickFiles(vendor) {
  const usable = [
    ...vendor.files.filter(f => !f.skip && (MEDIA[f.ext] || f.ext === '.pdf')),
    ...expandZips(vendor),
  ]
  const pick = tag => usable.find(f => f.tags.includes(tag))
  const chosen = []
  for (const tag of ['biz_license', 'bankbook', 'namecard']) {
    const f = pick(tag)
    if (f && !chosen.includes(f)) chosen.push(f)
  }
  return chosen
}

function toBlock(f) {
  const limit = f.ext === '.pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
  if (f.size > limit) return { skipped: `${f.name} (용량 ${(f.size / 1024 / 1024).toFixed(1)}MB 초과)` }
  const data = fs.readFileSync(f.abs).toString('base64')
  return f.ext === '.pdf'
    ? { block: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } }
    : { block: { type: 'image', source: { type: 'base64', media_type: MEDIA[f.ext], data } } }
}

async function readVendor(vendor) {
  const files = pickFiles(vendor)
  if (files.length === 0) {
    return { folder: vendor.folder, status: '서류없음', sources: [], result: null }
  }

  const content = []
  const sources = []
  const skipped = []
  for (const f of files) {
    const { block, skipped: why } = toBlock(f)
    if (why) { skipped.push(why); continue }
    content.push({ type: 'text', text: `[${f.tags.join(',')}] ${f.name}` })
    content.push(block)
    sources.push(f.abs)
  }
  if (content.length === 0) {
    return { folder: vendor.folder, status: '판독불가', sources: [], skipped, result: null }
  }
  content.push({ type: 'text', text: `이 협력업체의 정보를 추출하라. 폴더명 참고: "${vendor.folder}"` })

  const res = await callClaude({
    model: 'claude-opus-5',
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  })

  if (res.stop_reason === 'refusal') {
    return { folder: vendor.folder, status: '판독거부', sources, skipped, result: null }
  }
  const text = res.content.find(b => b.type === 'text')?.text ?? '{}'
  return {
    folder: vendor.folder,
    status: 'ok',
    sources,
    skipped,
    result: JSON.parse(text),
    usage: { in: res.usage.input_tokens, out: res.usage.output_tokens },
  }
}

// --- 실행 ---
const scan = JSON.parse(fs.readFileSync(SCAN, 'utf8'))
const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {}
// --limit N: 전체를 돌리기 전에 몇 건만 시험 판독할 때 쓴다.
const limitArg = process.argv.indexOf('--limit')
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity
const todo = scan.vendors.filter(v => !done[v.folder]).slice(0, limit)

console.log(`전체 ${scan.vendors.length}개 / 이미 판독 ${Object.keys(done).length}개 / 이번 ${todo.length}개`)

let finished = 0
const save = () => fs.writeFileSync(OUT, JSON.stringify(done, null, 2), 'utf8')

async function worker(queue) {
  for (;;) {
    const vendor = queue.shift()
    if (!vendor) return
    try {
      done[vendor.folder] = await readVendor(vendor)
    } catch (e) {
      done[vendor.folder] = { folder: vendor.folder, status: '오류', error: String(e.message || e), result: null }
    }
    finished++
    const r = done[vendor.folder]
    const mark = r.status === 'ok' ? (r.result?.status ?? '?') : r.status
    console.log(`[${finished}/${todo.length}] ${vendor.folder} → ${mark}`)
    if (finished % 5 === 0) save()
  }
}

const queue = [...todo]
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)))
save()

const vals = Object.values(done)
const tally = vals.reduce((m, r) => {
  const k = r.status === 'ok' ? r.result.status : r.status
  return { ...m, [k]: (m[k] || 0) + 1 }
}, {})
console.log('\n--- 판독 결과 ---')
for (const [k, v] of Object.entries(tally)) console.log(`  ${k}: ${v}`)
const tok = vals.filter(r => r.usage).reduce((s, r) => s + r.usage.in, 0)
console.log(`입력 토큰 합계: ${tok.toLocaleString()}`)
console.log(`→ ${OUT}`)
