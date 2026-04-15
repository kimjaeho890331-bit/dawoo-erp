import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/telegram/debug?code=DAWOO1
// 임시 디버그용 — 사용 후 삭제
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') || 'DAWOO1'

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const result: Record<string, unknown> = {
    env: {
      has_url: !!url,
      url_preview: url?.slice(0, 40),
      has_service_key: !!serviceKey,
      service_key_prefix: serviceKey?.slice(0, 15),
      service_key_len: serviceKey?.length,
      has_anon_key: !!anonKey,
    },
  }

  if (!url || !serviceKey) {
    result.error = 'Missing env vars'
    return Response.json(result, { status: 500 })
  }

  try {
    const supabase = createClient(url, serviceKey)

    // Test 1: staff_invitations by code
    const r1 = await supabase
      .from('staff_invitations')
      .select('*')
      .eq('code', code.toUpperCase())
    result.query1_eq_code = {
      data: r1.data,
      error: r1.error?.message,
      count: r1.data?.length,
    }

    // Test 2: with is used_at null
    const r2 = await supabase
      .from('staff_invitations')
      .select('*')
      .eq('code', code.toUpperCase())
      .is('used_at', null)
    result.query2_eq_code_isnull = {
      data: r2.data,
      error: r2.error?.message,
      count: r2.data?.length,
    }

    // Test 3: raw select all
    const r3 = await supabase
      .from('staff_invitations')
      .select('code, name, used_at')
      .limit(10)
    result.query3_all = {
      data: r3.data,
      error: r3.error?.message,
      count: r3.data?.length,
    }

    // Test 4: staff by name
    const r4 = await supabase
      .from('staff')
      .select('id, name, telegram_chat_id')
      .eq('name', '김재호')
    result.query4_staff = {
      data: r4.data,
      error: r4.error?.message,
      count: r4.data?.length,
    }
  } catch (e) {
    result.exception = String(e)
  }

  return Response.json(result, { status: 200 })
}
