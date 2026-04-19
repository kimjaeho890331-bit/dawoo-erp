const fs = require('fs')

const CSV_PATH = 'C:/Users/dawoo0/Downloads/4e911b6b-39ed-41b0-a81e-2d556ac4d44a_ExportBlock-96006e54-cda0-47a3-bb1e-37ae0634001a/ExportBlock-96006e54-cda0-47a3-bb1e-37ae0634001a-Part-1/소규모 공동주택 접수대장 2a4a07f8510481f580cbcb7e99acf53c_all.csv'

const raw = fs.readFileSync(CSV_PATH, 'utf-8')
const lines = raw.split('\n').filter(l => l.trim())
const headers = parseCSVLine(lines[0])

console.log('Headers:', headers.length, headers.join(' | '))

// CSV 파싱
function parseCSVLine(line) {
  const r = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; continue }
    if (line[i] === ',' && !inQ) { r.push(cur.trim()); cur = ''; continue }
    cur += line[i]
  }
  r.push(cur.trim()); return r
}

// 도시 매핑
const CITIES = {
  '수원': '48331699-5e85-41d2-96da-7fe3b64b163f',
  '성남': '871f40f0-47ed-4b56-ab7b-52361cb86cff',
  '안양': 'f947344b-87fd-4227-af2b-d03621af042d',
  '부천': 'd9d09587-98f9-4b10-a441-c3ab01c17627',
  '광명': 'a193f833-3255-4cb7-aff1-9fe15e5aa847',
  '시흥': '216c66bf-d006-400c-ac1e-9a5eb0117e83',
  '안산': '9746cbe6-1ec7-419e-944e-a6926f27004d',
  '군포': '4c6827fb-2110-4f92-86ad-9cb6ce53e66b',
  '의왕': 'efc38943-2ac7-4483-b670-b95c9d399172',
  '과천': '9bfe9faf-70f0-4ec8-94c0-8e86e4f08680',
  '용인': '8db105f3-c296-4883-8278-7fdc72030e09',
  '화성': 'fea7f4fa-cbce-46c9-a215-26dd5cdf2a28',
  '오산': '25c2f219-f89e-439a-95ec-b28fe8263493',
  '평택': '28917ec5-2dbe-47a1-a9e7-02c613ed9f9b',
  '하남': '4b3aaddf-263f-44ac-81c8-b16ecc23b420',
  '광주': '26e795a0-83ea-4ea2-8c09-3df216c98879',
  '서산': 'f9923d8c-6b8a-493f-8f5b-abfcffd8af7f',
}
const SUPPORT_TYPE = {
  '소규모': '07982b9d-ef15-4e39-be26-7870a4cbf309',
  '공동주택': 'f9223d52-5b0e-4b36-8d47-d248e2b58b3d',
  '새빛': '44b35bb9-dda8-41e3-b2cc-e46d24d1cd89',
  '녹색': '0ef88b15-3f27-40f6-afdd-13ad8072c93d',
}

function parseMoney(s) { return s ? parseInt(s.replace(/[₩,\s]/g, '')) || 0 : 0 }
function parseUnits(s) { if (!s) return null; const m = s.match(/(\d+)/); return m ? parseInt(m[1]) : null }
function parseDate(s) {
  if (!s) return null
  // 2025/04/28 or 2025-04-28
  const m = s.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
function esc(s) {
  if (!s || s === '-') return 'NULL'
  const c = String(s).trim().replace(/'/g, "''").replace(/\\/g, '')
  return c ? "'" + c + "'" : 'NULL'
}
function escN(n) { return (n === null || n === undefined || isNaN(n)) ? 'NULL' : String(n) }

const unknownCities = new Set()
function extractCity(regionStr) {
  if (!regionStr) return null
  // "군포시 (https://...)" → "군포"
  const clean = regionStr.replace(/\s*\(http[^)]*\)/g, '').trim()
  const cityName = clean.replace(/시$/, '')
  if (CITIES[cityName]) return CITIES[cityName]
  // 못 찾으면 기록
  if (cityName) unknownCities.add(cityName)
  return null
}

function mapStatus(status, surveyDate, appDate, completionDate, constDate) {
  const s = (status || '').trim()
  if (s === '취소') return '취소'
  if (s === '완료') return '입금'
  if (completionDate) return '완료서류제출'
  if (constDate) return '공사'
  if (appDate) return '신청서제출'
  if (s === '접수' && surveyDate) return '실측'
  if (s === '접수') return '문의'
  if (s === '예약') return '문의'
  if (surveyDate) return '실측'
  return '문의'
}

// 헤더 인덱스 찾기
function idx(name) {
  const i = headers.indexOf(name)
  if (i < 0) console.warn('Missing header:', name)
  return i
}

const rows = []
let skipped = 0

for (let i = 1; i < lines.length; i++) {
  const c = parseCSVLine(lines[i])
  if (c.length < 10) { skipped++; continue }

  const building = c[idx('빌라명')]
  if (!building || !building.trim()) { skipped++; continue }

  const year = parseInt(c[idx('진행연도')]) || 2026
  const jibun = c[idx('지번주소')] || null
  const road = c[idx('도로명주소')] || null
  const supportType = c[idx('지원사업 종류')] || '소규모'
  const approval = c[idx('사용승인일')]
  const units = c[idx('세대수')]
  const owner = c[idx('대표자명')]
  const ownerPhone = c[idx('대표 연락처')]
  const note = c[idx('상담내용')]
  const receiptDate = c[idx('접수일')]
  const surveyDate = c[idx('실측일')]
  const designAmount = c[idx('설계금액')]
  const appDate = c[idx('신청서류 제출일')]
  const constDate = c[idx('시공일')]
  const contractor = c[idx('시공업체')]
  const otherContractor = c[idx('기타 시공업체')]
  const completionDate = c[idx('완료서류 제출일')]
  const totalCost = c[idx('총공사비')]
  const contractCost = c[idx('시공사비')]
  const citySupport = c[idx('시지원금')]
  const selfPay = c[idx('자부담금')]
  const additionalCost = c[idx('추가공사금')]
  const collected = c[idx('수금액')]
  const outstanding = c[idx('미수금')]
  const remark = c[idx('비고')]
  const payerName = c[idx('입금자명 확인')]
  const status = c[idx('상태')]
  const cancelReason = c[idx('취소사유')]
  const region = c[idx('지역명')]

  const cityId = extractCity(region) || null
  const wtId = SUPPORT_TYPE[supportType] || SUPPORT_TYPE['소규모']
  const unitCount = parseUnits(units)
  const mappedStatus = mapStatus(status, surveyDate, appDate, completionDate, constDate)
  const remarkClean = (remark || '').replace(/'/g, "''").replace(/"/g, '')

  rows.push(`(${esc(building)}, NULL, ${esc(road)}, ${esc(jibun)}, ${cityId ? "'" + cityId + "'" : 'NULL'}, '${wtId}', ${esc(owner)}, ${esc(ownerPhone)}, ${esc(supportType)}, ${escN(parseMoney(totalCost))}, ${escN(parseMoney(citySupport))}, ${escN(parseMoney(selfPay))}, ${escN(parseMoney(collected))}, ${escN(parseMoney(outstanding))}, ${escN(unitCount)}, ${parseDate(approval) ? "'" + parseDate(approval) + "'" : 'NULL'}, ${parseDate(receiptDate) ? "'" + parseDate(receiptDate) + "'" : 'NULL'}, ${parseDate(surveyDate) ? "'" + parseDate(surveyDate) + "'" : 'NULL'}, ${escN(parseMoney(designAmount))}, ${parseDate(appDate) ? "'" + parseDate(appDate) + "'" : 'NULL'}, ${parseDate(constDate) ? "'" + parseDate(constDate) + "'" : 'NULL'}, ${esc(contractor)}, ${esc(otherContractor)}, ${parseDate(completionDate) ? "'" + parseDate(completionDate) + "'" : 'NULL'}, ${esc(payerName)}, ${esc(cancelReason)}, ${esc(note)}, '${mappedStatus}', ${escN(year)}, '${remarkClean ? '{"remark":"' + remarkClean + '"}' : '{}'}'::jsonb)`)
}

const sql = `-- 소규모 접수대장 ${rows.length}건 INSERT (${skipped}건 스킵)
INSERT INTO projects (building_name, staff_id, road_address, jibun_address, city_id, work_type_id, owner_name, owner_phone, support_program, total_cost, city_support, self_pay, collected, outstanding, unit_count, approval_date, receipt_date, survey_date, design_amount, application_date, construction_date, external_contractor, other_contractor, completion_doc_date, payer_name, cancel_reason, note, status, year, extra_fields) VALUES
${rows.join(',\n')};
`

fs.writeFileSync('C:/Users/dawoo0/dawoo-erp/sql/import_small_v2.sql', sql, 'utf-8')
console.log('Generated', rows.length, 'rows, skipped', skipped)

// 상태 분포
const statusMap = {}
rows.forEach(r => { const m = r.match(/, '(문의|실측|신청서제출|완료서류제출|입금|취소|공사)',/); if (m) statusMap[m[1]] = (statusMap[m[1]] || 0) + 1 })
console.log('Status:', statusMap)

// 도시 분포
const cityCount = {}
rows.forEach(r => {
  for (const [name, id] of Object.entries(CITIES)) {
    if (r.includes(id)) { cityCount[name] = (cityCount[name] || 0) + 1; return }
  }
  cityCount['NULL'] = (cityCount['NULL'] || 0) + 1
})
console.log('Cities:', cityCount)
if (unknownCities.size > 0) console.log('Unknown cities:', [...unknownCities])
