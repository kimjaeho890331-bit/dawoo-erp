const fs = require('fs')

const csv = fs.readFileSync('C:/Users/dawoo0/Desktop/클로드 작업/수도 접수대장 2aaa07f8510481809e20eedeadabc792.csv', 'utf-8')
const lines = csv.split('\n').filter(l => l.trim())

const CITIES = { '수원': '48331699-5e85-41d2-96da-7fe3b64b163f', '안양': 'f947344b-87fd-4227-af2b-d03621af042d', '화성': 'fea7f4fa-cbce-46c9-a215-26dd5cdf2a28' }
const WT = { '공용': 'cfae03cc-0a9f-4809-a43a-ed05fd46207a', '옥내': '01ca1009-8946-4346-9d20-1b34e30bf8a3', '단독': '01ca1009-8946-4346-9d20-1b34e30bf8a3' }

function parseMoney(s) { return s ? parseInt(s.replace(/[₩,\s]/g, '')) || 0 : 0 }
function parseUnits(s) { if (!s) return null; const m = s.match(/(\d+)/); return m ? parseInt(m[1]) : null }
function parseDate(s) { return s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : null }
function isPhone(s) { return s && /^01[016789]/.test(s.trim().replace(/-/g,'')) }
function extractCity(addr) {
  if (!addr) return CITIES['수원']
  for (const [n, id] of Object.entries(CITIES)) { if (addr.includes(n)) return id }
  if (addr.match(/팔달구|장안구|권선구|영통구|세류동|매탄동|화서동|인계동|우만동|조원동|파장동|송죽동|매향동|고색동|구운동/)) return CITIES['수원']
  if (addr.match(/동안구|만안구|호계동/)) return CITIES['안양']
  if (addr.match(/효행구|병점|매송|봉담|동탄/)) return CITIES['화성']
  return CITIES['수원']
}
function esc(s) { if (!s || s === '-') return 'NULL'; const c = String(s).trim().replace(/'/g, "''"); return c ? `'${c}'` : 'NULL' }
function escN(n) { return (n === null || n === undefined || isNaN(n)) ? 'NULL' : String(n) }
function parseCSVLine(line) {
  const r = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; continue }
    if (line[i] === ',' && !inQ) { r.push(cur.trim()); cur = ''; continue }
    cur += line[i]
  }
  r.push(cur.trim()); return r
}

const rows = []
for (let i = 1; i < lines.length; i++) {
  const c = parseCSVLine(lines[i])
  if (c.length < 10) continue
  
  const building = c[2]
  if (!building || !building.trim()) continue  // 빈 행 스킵

  const staff = c[3]
  const jibun = c[4]
  const road = c[5]
  const workType = c[6]
  const note = c[7]
  const approval = c[8]
  const units = c[9]
  const owner = c[11]
  const ownerPhone = c[12]
  const tenantPhone = c[13]
  const password = c[14]
  const surveyDate = c[15]
  const appDate = c[16]
  const constDate = c[17]
  const directWorker = c[18]
  const equip = c[19]
  const completionDate = c[20]
  const totalCost = c[21]
  const citySupport = c[23]
  const selfPay = c[24]
  const additionalCost = c[25]
  const collected = c[26]
  const outstanding = c[27]
  const payerName = c[28]
  const cancelReason = c[29]
  const status = c[1]
  const year = c[0]

  const finalRoad = road && !isPhone(road) ? road : null
  const cityId = extractCity(finalRoad || jibun)
  const wtId = WT[workType] || null
  const unitCount = parseUnits(units)
  const addCost = parseMoney(additionalCost)
  const staffSelect = staff && staff.trim() ? `(SELECT id FROM staff WHERE name='${staff.trim()}' LIMIT 1)` : 'NULL'

  rows.push(`(${esc(building)}, ${staffSelect}, ${esc(finalRoad)}, ${esc(jibun)}, '${cityId}', ${wtId ? `'${wtId}'` : 'NULL'}, ${esc(workType)}, ${esc(owner)}, ${esc(ownerPhone)}, ${esc(tenantPhone)}, ${esc(password)}, ${escN(parseMoney(totalCost))}, ${escN(parseMoney(citySupport))}, ${escN(parseMoney(selfPay))}, ${escN(parseMoney(collected))}, ${escN(parseMoney(outstanding))}, ${escN(unitCount)}, ${parseDate(approval) ? `'${parseDate(approval)}'` : 'NULL'}, ${parseDate(surveyDate) ? `'${parseDate(surveyDate)}'` : 'NULL'}, ${parseDate(appDate) ? `'${parseDate(appDate)}'` : 'NULL'}, ${parseDate(constDate) ? `'${parseDate(constDate)}'` : 'NULL'}, ${parseDate(completionDate) ? `'${parseDate(completionDate)}'` : 'NULL'}, ${esc(directWorker)}, ${esc(equip)}, ${esc(payerName)}, ${esc(cancelReason)}, ${esc(note)}, ${esc(status)}, ${escN(parseInt(year)||2026)}, '${addCost > 0 ? `{"additional_cost":${addCost}}` : '{}'}'::jsonb)`)
}

const sql = `-- 수도 접수대장 ${rows.length}건 INSERT
INSERT INTO projects (building_name, staff_id, road_address, jibun_address, city_id, work_type_id, water_work_type, owner_name, owner_phone, tenant_phone, unit_password, total_cost, city_support, self_pay, collected, outstanding, unit_count, approval_date, survey_date, application_date, construction_date, completion_doc_date, direct_worker, equipment, payer_name, cancel_reason, note, status, year, extra_fields) VALUES
${rows.join(',\n')};`

fs.writeFileSync('C:/Users/dawoo0/dawoo-erp/sql/import_water_projects.sql', sql, 'utf-8')
console.log(`Generated ${rows.length} rows (빈 행 제거됨)`)
