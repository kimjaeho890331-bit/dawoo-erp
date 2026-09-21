import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { admin } from '@/lib/approval/guard'
import { suggestedLaborCategory, validateLaborExpense } from '@/lib/expenseCategory'

type ExpenseBody = {
  id?: string
  category?: string | null
  title?: string | null
  item?: string | null
  amount?: number | null
  expense_date?: string | null
  site_id?: string | null
  project_id?: string | null
  staff_id?: string | null
  memo?: string | null
  receipt_url?: string | null
  payee?: string | null
}

function payloadOf(body: ExpenseBody) {
  const title = (body.title ?? '').trim()
  const category = (body.category ?? '').trim() || suggestedLaborCategory(title) || '기타'
  return {
    category,
    title,
    item: body.item?.trim() || null,
    amount: Number(body.amount) || 0,
    expense_date: body.expense_date || null,
    site_id: body.site_id || null,
    project_id: body.project_id || null,
    staff_id: body.staff_id || null,
    memo: body.memo || null,
    receipt_url: body.receipt_url || null,
    payee: body.payee ?? null,
  }
}

export async function POST(request: NextRequest) {
  return upsert(request, 'create')
}

export async function PATCH(request: NextRequest) {
  return upsert(request, 'update')
}

async function upsert(request: NextRequest, mode: 'create' | 'update') {
  const user = await getAuthUser()
  if (!user?.email) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  let body: ExpenseBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  if (mode === 'update' && !body.id) {
    return Response.json({ error: '수정할 지출 id가 없습니다' }, { status: 400 })
  }

  const row = payloadOf(body)
  const laborErr = validateLaborExpense({
    category: row.category,
    title: row.title,
    item: row.item,
    amount: row.amount,
    expense_date: row.expense_date,
    site_id: row.site_id,
    project_id: row.project_id,
    payee: row.payee,
    requirePayee: Boolean(row.payee !== null && row.payee !== undefined),
  })
  if (laborErr) return Response.json({ error: laborErr }, { status: 400 })

  if (!row.title) return Response.json({ error: '내용을 입력해 주세요' }, { status: 400 })
  if (!row.amount) return Response.json({ error: '금액을 입력해 주세요' }, { status: 400 })
  if (!row.expense_date) return Response.json({ error: '지출일을 입력해 주세요' }, { status: 400 })

  const write = {
    category: row.category,
    title: row.title,
    amount: row.amount,
    expense_date: row.expense_date,
    site_id: row.site_id,
    project_id: row.project_id,
    staff_id: row.staff_id,
    memo: row.memo,
    receipt_url: row.receipt_url,
  }

  if (mode === 'update') {
    const { data, error } = await admin.from('expenses').update(write).eq('id', body.id).select('id').maybeSingle()
    if (error) return Response.json({ error: `지출 수정 실패: ${error.message}` }, { status: 500 })
    if (!data) return Response.json({ error: '지출을 찾을 수 없습니다' }, { status: 404 })
    return Response.json({ id: data.id })
  }

  const { data, error } = await admin.from('expenses').insert(write).select('id').single()
  if (error || !data) {
    return Response.json({ error: `지출 등록 실패: ${error?.message}` }, { status: 500 })
  }
  return Response.json({ id: data.id })
}
