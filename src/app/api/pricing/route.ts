import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// 기본 단가
const DEFAULT_PRICES = {
  전용: 8500,
  공용: 4500,
  공용_세대: 150000,
}

// GET /api/pricing?city=수원&category=수도
export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const city = request.nextUrl.searchParams.get('city')
  const category = request.nextUrl.searchParams.get('category') || '수도'

  if (!city) {
    return Response.json(DEFAULT_PRICES)
  }

  try {
    // 해당 시의 공문 템플릿에서 단가 조회
    const { data } = await supabaseAdmin
      .from('templates')
      .select('field_mapping')
      .eq('name', '공문')
      .order('updated_at', { ascending: false })

    if (data && data.length > 0) {
      // city와 category가 일치하는 공문 찾기
      const match = data.find(row => {
        const mapping = row.field_mapping as Record<string, unknown>
        return mapping?.city === city && mapping?.category === category
      })

      if (match) {
        const mapping = match.field_mapping as Record<string, unknown>
        const pricing = mapping?.pricing as Record<string, number> | undefined
        if (pricing) {
          return Response.json({
            전용: pricing.전용 || DEFAULT_PRICES.전용,
            공용: pricing.공용 || DEFAULT_PRICES.공용,
            공용_세대: pricing.공용_세대 || DEFAULT_PRICES.공용_세대,
          })
        }
      }
    }

    return Response.json(DEFAULT_PRICES)
  } catch (error) {
    console.error('Pricing fetch error:', error)
    return Response.json(DEFAULT_PRICES)
  }
}
