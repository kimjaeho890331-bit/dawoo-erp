import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { parseLaborWorkbook } from '@/lib/labor/importExcel'

// 노무비지급내역 엑셀 → 일용직 근무관리 행 미리보기.
// 읽기만 한다. DB 저장은 화면에서 미리보기를 확인한 뒤에 따로 한다.

const MAX_BYTES = 15 * 1024 * 1024

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '엑셀 파일을 선택해 주세요.' }, { status: 400 })
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ error: '.xlsx 파일만 읽을 수 있습니다. (.xls는 엑셀에서 .xlsx로 다시 저장해 주세요)' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: '파일이 너무 큽니다. (15MB 이하)' }, { status: 400 })
  }

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: '엑셀 파일을 열지 못했습니다. 파일이 손상됐거나 암호가 걸려 있을 수 있습니다.' }, { status: 400 })
  }

  try {
    return NextResponse.json(parseLaborWorkbook(wb))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '엑셀을 읽지 못했습니다.' }, { status: 400 })
  }
}
