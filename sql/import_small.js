const fs = require('fs')

const raw = fs.readFileSync('C:/Users/dawoo0/Documents/ExportBlock-07828063-4491-416a-b148-be146e52c9e2-Part-1/소규모 공동주택 접수대장 2a4a07f8510481f580cbcb7e99acf53c.csv', 'utf-8')
const lines = raw.split('\n').filter(l => l.trim())

function parseCSVLine(line) {
  const r = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; continue }
    if (line[i] === ',' && !inQ) { r.push(cur.trim()); cur = ''; continue }
    cur += line[i]
  }
  r.push(cur.trim()); return r
}

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
}
const DIST = {
  '팔달구': '수원', '장안구': '수원', '권선구': '수원', '영통구': '수원',
  '동안구': '안양', '만안구': '안양',
  '원미구': '부천', '소사구': '부천', '오정구': '부천',
  '수정구': '성남', '중원구': '성남', '분당구': '성남',
  '상록구': '안산', '단원구': '안산',
  '처인구': '용인', '기흥구': '용인', '수지구': '용인',
  '산본동': '군포', '당동': '군포', '금정동': '군포', '군포로': '군포',
  '초월': '하남', '오포': '하남', '퇴촌': '하남', '문형동': '하남',
  '송정동': '하남', '추자동': '하남', '쌍령동': '하남', '고산동': '하남',
  '대야미동': '군포', '광정동': '군포',
}
const SUPPORT_TYPE = {
  '소규모': '07982b9d-ef15-4e39-be26-7870a4cbf309',
  '공동주택': 'f9223d52-5b0e-4b36-8d47-d248e2b58b3d',
  '새빛': '44b35bb9-dda8-41e3-b2cc-e46d24d1cd89',
  '녹색': '0ef88b15-3f27-40f6-afdd-13ad8072c93d',
}

function parseMoney(s) { return s ? parseInt(s.replace(/[₩,\s]/g, '')) || 0 : 0 }
function parseUnits(s) { if (!s) return null; const m = s.match(/(\d+)/); return m ? parseInt(m[1]) : null }
function parseDate(s) { return s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : null }
function esc(s) {
  if (!s || s === '-') return 'NULL'
  const c = String(s).trim().replace(/'/g, "''").replace(/\\/g, '')
  return c ? "'" + c + "'" : 'NULL'
}
function escN(n) { return (n === null || n === undefined || isNaN(n)) ? 'NULL' : String(n) }

function extractCity(addr) {
  if (!addr) return null
  for (const [name, id] of Object.entries(CITIES)) {
    if (addr.includes(name)) return id
  }
  for (const [dist, city] of Object.entries(DIST)) {
    if (addr.includes(dist)) return CITIES[city] || null
  }
  return null
}

function mapStatus(status, surveyDate, appDate, completionDate) {
  const s = (status || '').trim()
  if (s === '취소') return '취소'
  if (s === '완료') return '입금'
  if (completionDate) return '완료서류제출'
  if (appDate) return '신청서제출'
  if (s === '접수' && surveyDate) return '실측'
  if (s === '접수') return '문의'
  if (s === '예약') return '문의'
  if (surveyDate) return '실측'
  return '문의'
}

const rows = []
let skipped = 0

for (let i = 1; i < lines.length; i++) {
  const c = parseCSVLine(lines[i])
  if (c.length < 20) { skipped++; continue }

  const building = c[1]
  if (!building || !building.trim()) { skipped++; continue }

  const year = parseInt(c[0]) || 2026
  const jibun = c[2] || null
  const road = c[3] || null
  const supportType = c[4] || '소규모'
  const approval = c[5]
  const units = c[6]
  const owner = c[7]
  const ownerPhone = c[8]
  const note = c[9]
  const receiptDate = c[10]
  const surveyDate = c[11]
  const designAmount = c[12]
  const appDate = c[13]
  const constDate = c[14]
  const contractor = c[15]
  const otherContractor = c[16]
  const completionDate = c[17]
  const totalCost = c[18]
  const citySupport = c[20]
  const selfPay = c[21]
  const additionalCost = c[22]
  const collected = c[23]
  const outstanding = c[24]
  const remark = c[25]
  const payerName = c[26]
  const status = c[27]
  const cancelReason = c[28]

  const cityId = extractCity(road || jibun)
  const wtId = SUPPORT_TYPE[supportType] || SUPPORT_TYPE['소규모']
  const unitCount = parseUnits(units)
  const addCost = parseMoney(additionalCost)
  const mappedStatus = mapStatus(status, surveyDate, appDate, completionDate)
  const remarkClean = (remark || '').replace(/'/g, "''").replace(/"/g, '')

  rows.push(`(${esc(building)}, NULL, ${esc(road)}, ${esc(jibun)}, ${cityId ? "'" + cityId + "'" : 'NULL'}, '${wtId}', ${esc(owner)}, ${esc(ownerPhone)}, ${esc(supportType)}, ${escN(parseMoney(totalCost))}, ${escN(parseMoney(citySupport))}, ${escN(parseMoney(selfPay))}, ${escN(parseMoney(collected))}, ${escN(parseMoney(outstanding))}, ${escN(unitCount)}, ${parseDate(approval) ? "'" + parseDate(approval) + "'" : 'NULL'}, ${parseDate(receiptDate) ? "'" + parseDate(receiptDate) + "'" : 'NULL'}, ${parseDate(surveyDate) ? "'" + parseDate(surveyDate) + "'" : 'NULL'}, ${escN(parseMoney(designAmount))}, ${parseDate(appDate) ? "'" + parseDate(appDate) + "'" : 'NULL'}, ${parseDate(constDate) ? "'" + parseDate(constDate) + "'" : 'NULL'}, ${esc(contractor)}, ${esc(otherContractor)}, ${parseDate(completionDate) ? "'" + parseDate(completionDate) + "'" : 'NULL'}, ${esc(payerName)}, ${esc(cancelReason)}, ${esc(note)}, '${mappedStatus}', ${escN(year)}, '${remarkClean ? '{"remark":"' + remarkClean + '"}' : '{}'}'::jsonb)`)
}

const sql = `-- 소규모 접수대장 ${rows.length}건 INSERT (${skipped}건 스킵)
INSERT INTO projects (building_name, staff_id, road_address, jibun_address, city_id, work_type_id, owner_name, owner_phone, support_program, total_cost, city_support, self_pay, collected, outstanding, unit_count, approval_date, receipt_date, survey_date, design_amount, application_date, construction_date, external_contractor, other_contractor, completion_doc_date, payer_name, cancel_reason, note, status, year, extra_fields) VALUES
${rows.join(',\n')};
`

fs.writeFileSync('C:/Users/dawoo0/dawoo-erp/sql/import_small_projects.sql', sql, 'utf-8')
console.log('Generated ' + rows.length + ' rows, skipped ' + skipped)

// 상태 분포
const statusMap = {}
rows.forEach(r => { const m = r.match(/, '(문의|실측|신청서제출|완료서류제출|입금|취소)',/); if (m) statusMap[m[1]] = (statusMap[m[1]] || 0) + 1 })
console.log('Status:', statusMap)
