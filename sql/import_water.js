const fs = require('fs')

const csv = fs.readFileSync('C:/Users/dawoo0/Downloads/ExportBlock-6b0c363b-6be8-4853-8fde-2003a117a4f6-Part-1/수도 접수대장.csv', 'utf-8')
const lines = csv.split('\n').filter(l => l.trim())

const CITIES = { '수원': '48331699-5e85-41d2-96da-7fe3b64b163f', '안양': 'f947344b-87fd-4227-af2b-d03621af042d', '화성': 'fea7f4fa-cbce-46c9-a215-26dd5cdf2a28' }
const WT = { '공용': 'cfae03cc-0a9f-4809-a43a-ed05fd46207a', '옥내': '01ca1009-8946-4346-9d20-1b34e30bf8a3', '단독': '01ca1009-8946-4346-9d20-1b34e30bf8a3' }

function parseMoney(s) { return s ? parseInt(s.replace(/[₩,\s]/g, '')) || 0 : 0 }
function parseUnits(s) { if (!s) return null; const m = s.match(/(\d+)\s*(세대|가구)/); return m ? parseInt(m[1]) : null }
function parseDate(s) { return s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : null }
function isPhone(s) { return s && /^01[016789]-?\d{3,4}-?\d{4}/.test(s.trim()) }
function extractCity(addr) {
  if (!addr) return CITIES['수원']
  for (const [name, id] of Object.entries(CITIES)) { if (addr.includes(name)) return id }
  if (addr.match(/팔달구|장안구|권선구|영통구|세류동|매탄동|화서동|인계동|우만동/)) return CITIES['수원']
  if (addr.match(/동안구|만안구/)) return CITIES['안양']
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

const out = []
out.push(`-- 수도 접수대장 일괄 등록`)
out.push(`-- Generated: ${new Date().toISOString().slice(0,10)}`)
out.push(``)
out.push(`-- Step 0: 직원 교체`)
out.push(`UPDATE schedules SET staff_id = NULL WHERE staff_id IN (SELECT id FROM staff WHERE name IN ('박민수','이대호','정수빈','최영희','한지은'));`)
out.push(`DELETE FROM staff WHERE name IN ('박민수','이대호','정수빈','최영희','한지은');`)
out.push(`INSERT INTO staff (name, role) VALUES`)
out.push(`  ('조혜진','대표'),('김용이','이사'),('김지선','대표'),('이희건','대리'),`)
out.push(`  ('김태정','직원'),('김덕민','직원'),('김현준','직원'),('고상준','직원'),`)
out.push(`  ('송승란','직원'),('최원혁','직원'),('임대진','직원')`)
out.push(`ON CONFLICT DO NOTHING;`)
out.push(``)
out.push(`-- Step 1: 수도 접수대장 (${lines.length-1}건)`)

const rows = []
for (let i = 1; i < lines.length; i++) {
  const c = parseCSVLine(lines[i])
  if (c.length < 10) continue

  let [year,status,building,staff,jibun,road,workType,note,approval,
    units,area,owner,ownerPhone,tenantPhone,password,
    surveyDate,appDate,constDate,directWorker,equip,completionDate,
    totalCost,contractCost,citySupport,selfPay,additionalCost,
    collected,outstanding,payerName,cancelReason] = c

  // 도로명주소에 전화번호가 들어간 경우 → 주소를 지번에서 가져오고 전화는 무시
  let finalRoad = road && !isPhone(road) ? road : null
  let finalJibun = jibun || null
  
  // 도시 추출 (도로명 우선, 없으면 지번)
  const cityId = extractCity(finalRoad || finalJibun)
  const wtId = WT[workType] || null
  const unitCount = parseUnits(units)
  const addCost = parseMoney(additionalCost)

  rows.push(`(${esc(building)}, (SELECT id FROM staff WHERE name=${esc(staff)} LIMIT 1), ${esc(finalRoad)}, ${esc(finalJibun)}, '${cityId}', ${wtId ? `'${wtId}'` : 'NULL'}, ${esc(workType)}, ${esc(owner)}, ${esc(ownerPhone)}, ${esc(tenantPhone)}, ${esc(password)}, ${escN(parseMoney(totalCost))}, ${escN(parseMoney(citySupport))}, ${escN(parseMoney(selfPay))}, ${escN(parseMoney(collected))}, ${escN(parseMoney(outstanding))}, ${escN(unitCount)}, ${parseDate(approval) ? `'${parseDate(approval)}'` : 'NULL'}, ${parseDate(surveyDate) ? `'${parseDate(surveyDate)}'` : 'NULL'}, ${parseDate(appDate) ? `'${parseDate(appDate)}'` : 'NULL'}, ${parseDate(constDate) ? `'${parseDate(constDate)}'` : 'NULL'}, ${parseDate(completionDate) ? `'${parseDate(completionDate)}'` : 'NULL'}, ${esc(directWorker)}, ${esc(equip)}, ${esc(payerName)}, ${esc(cancelReason)}, ${esc(note)}, ${esc(status)}, ${escN(parseInt(year)||2026)}, '${addCost > 0 ? `{"additional_cost":${addCost}}` : '{}'}'::jsonb)`)
}

out.push(`INSERT INTO projects (building_name, staff_id, road_address, jibun_address, city_id, work_type_id, water_work_type, owner_name, owner_phone, tenant_phone, unit_password, total_cost, city_support, self_pay, collected, outstanding, unit_count, approval_date, survey_date, application_date, construction_date, completion_doc_date, direct_worker, equipment, payer_name, cancel_reason, note, status, year, extra_fields) VALUES`)
out.push(rows.join(',\n') + ';')
out.push(``)
out.push(`NOTIFY pgrst, 'reload schema';`)

fs.writeFileSync('C:/Users/dawoo0/dawoo-erp/sql/import_water_projects.sql', out.join('\n'), 'utf-8')
console.log(`Generated ${rows.length} rows → sql/import_water_projects.sql`)

// 검증: 첫 3건 출력
rows.slice(0,3).forEach((r,i) => console.log(`\nRow ${i+1}: ${r.slice(0,120)}...`))
