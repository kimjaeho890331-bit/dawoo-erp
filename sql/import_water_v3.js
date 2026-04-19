const fs = require('fs')

const CSV_PATH = 'C:/Users/dawoo0/Desktop/클로드 작업/수도 접수대장_all.csv'
const raw = fs.readFileSync(CSV_PATH, 'utf-8')
const lines = raw.split('\n').filter(l => l.trim())
const headers = parseCSVLine(lines[0])

console.log('Headers:', headers.length, headers.join(' | '))

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
  '광주': '26e795a0-83ea-4ea2-8c09-3df216c98879',
  '서산': 'f9923d8c-6b8a-493f-8f5b-abfcffd8af7f',
}
const DIST = {
  '팔달구': '수원', '장안구': '수원', '권선구': '수원', '영통구': '수원',
  '동안구': '안양', '만안구': '안양',
  '효행구': '화성', '병점구': '화성', '봉담': '화성', '매송': '화성',
}
const WT = { '공용': 'cfae03cc-0a9f-4809-a43a-ed05fd46207a', '옥내': '01ca1009-8946-4346-9d20-1b34e30bf8a3', '단독': '01ca1009-8946-4346-9d20-1b34e30bf8a3' }

function parseMoney(s) { return s ? parseInt(s.replace(/[₩,\s]/g, '')) || 0 : 0 }
function parseUnits(s) { if (!s) return null; const m = s.match(/(\d+)/); return m ? parseInt(m[1]) : null }
function parseDate(s) {
  if (!s) return null
  const m = s.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
function esc(s) {
  if (!s || s === '-') return 'NULL'
  const c = String(s).trim().replace(/'/g, "''").replace(/\\/g, '')
  return c ? "'" + c + "'" : 'NULL'
}
function escN(n) { return (n === null || n === undefined || isNaN(n)) ? 'NULL' : String(n) }
function isPhone(s) { return s && /^01[016789]/.test(s.trim().replace(/-/g, '')) }

function extractCity(road, jibun) {
  const addr = road || jibun || ''
  // "X시 " 패턴 우선 (도로명 안의 도시명 무시)
  const cityMatch = addr.match(/(수원|성남|안양|부천|광명|시흥|안산|군포|의왕|과천|용인|화성|오산|평택|하남|광주|서산)시?\s/)
  if (cityMatch) return CITIES[cityMatch[1]] || null
  // 구/동 매칭
  for (const [dist, city] of Object.entries(DIST)) { if (addr.includes(dist)) return CITIES[city] || null }
  if (addr.match(/세류동|매탄동|화서동|인계동|우만동|조원동|파장동|송죽동|매향동|고색동|구운동/)) return CITIES['수원']
  return CITIES['수원']
}

function mapStatus(status, surveyDate, appDate, completionDate, constDate) {
  const s = (status || '').trim()
  if (s === '취소') return '취소'
  if (s === '완료') return '입금'
  if (completionDate) return '완료서류제출'
  if (constDate) return '공사'
  if (appDate) return '신청서제출'
  if (surveyDate) return '실측'
  if (s === '접수') return '문의'
  if (s === '예약') return '문의'
  return '문의'
}

function idx(name) { return headers.indexOf(name) }

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
  const workType = c[idx('공사 종류')] || ''
  const staff = c[idx('담당자')] || null
  const owner = c[idx('대표자/소유주명')] || null
  const ownerPhone = c[idx('대표자/소유주 연락처')] || null
  const tenantPhone = c[idx('세입자 연락처')] || null
  const password = c[idx('세대 비밀번호')] || null
  const note = c[idx('상담내용')] || null
  const approval = c[idx('사용승인일')]
  const units = c[idx('세대수')]
  const surveyDate = c[idx('실측일')]
  const appDate = c[idx('신청서 제출일')]
  const constDate = c[idx('시공일')]
  const directWorker = c[idx('직영 시공자')] || null
  const equip = c[idx('장비 / 일용직')] || null
  const completionDate = c[idx('완료서류 제출일')]
  const totalCost = c[idx('총공사비')]
  const citySupport = c[idx('시지원금')]
  const selfPay = c[idx('자부담금')]
  const additionalCost = c[idx('추가공사금')]
  const collected = c[idx('수금액')]
  const outstanding = c[idx('미수금')]
  const payerName = c[idx('입금자명 확인')] || null
  const status = c[idx('상태')]
  const cancelReason = c[idx('취소사유')] || null

  const finalRoad = road && !isPhone(road) ? road : null
  const cityId = extractCity(finalRoad, jibun)
  const wtId = WT[workType] || null
  const unitCount = parseUnits(units)
  const addCost = parseMoney(additionalCost)
  const mappedStatus = mapStatus(status, surveyDate, appDate, completionDate, constDate)
  const staffSelect = staff && staff.trim() ? `(SELECT id FROM staff WHERE name='${staff.trim()}' LIMIT 1)` : 'NULL'

  rows.push(`(${esc(building)}, ${staffSelect}, ${esc(finalRoad)}, ${esc(jibun)}, '${cityId}', ${wtId ? `'${wtId}'` : 'NULL'}, ${esc(workType)}, ${esc(owner)}, ${esc(ownerPhone)}, ${esc(tenantPhone)}, ${esc(password)}, ${escN(parseMoney(totalCost))}, ${escN(parseMoney(citySupport))}, ${escN(parseMoney(selfPay))}, ${escN(parseMoney(collected))}, ${escN(parseMoney(outstanding))}, ${escN(unitCount)}, ${parseDate(approval) ? "'" + parseDate(approval) + "'" : 'NULL'}, ${parseDate(surveyDate) ? "'" + parseDate(surveyDate) + "'" : 'NULL'}, ${parseDate(appDate) ? "'" + parseDate(appDate) + "'" : 'NULL'}, ${parseDate(constDate) ? "'" + parseDate(constDate) + "'" : 'NULL'}, ${parseDate(completionDate) ? "'" + parseDate(completionDate) + "'" : 'NULL'}, ${esc(directWorker)}, ${esc(equip)}, ${esc(payerName)}, ${esc(cancelReason)}, ${esc(note)}, '${mappedStatus}', ${escN(year)}, '${addCost > 0 ? `{"additional_cost":${addCost}}` : '{}'}'::jsonb)`)
}

const sql = `-- 수도 접수대장 ${rows.length}건 INSERT
INSERT INTO projects (building_name, staff_id, road_address, jibun_address, city_id, work_type_id, water_work_type, owner_name, owner_phone, tenant_phone, unit_password, total_cost, city_support, self_pay, collected, outstanding, unit_count, approval_date, survey_date, application_date, construction_date, completion_doc_date, direct_worker, equipment, payer_name, cancel_reason, note, status, year, extra_fields) VALUES
${rows.join(',\n')};
`

fs.writeFileSync('C:/Users/dawoo0/dawoo-erp/sql/import_water_v3.sql', sql, 'utf-8')
console.log('Generated', rows.length, 'rows, skipped', skipped)

const statusMap = {}
rows.forEach(r => { const m = r.match(/, '(문의|실측|신청서제출|완료서류제출|입금|취소|공사)',/); if (m) statusMap[m[1]] = (statusMap[m[1]] || 0) + 1 })
console.log('Status:', statusMap)
