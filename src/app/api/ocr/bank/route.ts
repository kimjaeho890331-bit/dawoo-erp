import { NextRequest } from 'next/server'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    const { image, mimeType } = await request.json()
    // image is base64 string, mimeType is like "image/jpeg" or "image/png"

    if (!image) {
      return Response.json({ error: '이미지가 필요합니다' }, { status: 400 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType || 'image/jpeg',
                data: image,
              },
            },
            {
              type: 'text',
              text: `이 통장사본 이미지에서 다음 정보를 추출해주세요. JSON 형식으로만 응답하세요:
{
  "bank_name": "은행명 (예: 국민은행, 신한은행)",
  "account_number": "계좌번호 (숫자와 하이픈만)",
  "account_holder": "예금주명"
}
이미지에서 읽을 수 없는 항목은 빈 문자열("")로 응답하세요.`,
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Claude Vision API error:', errText)
      return Response.json({ error: 'OCR 처리 실패' }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return Response.json(parsed)
    }

    return Response.json({ error: 'OCR 결과를 파싱할 수 없습니다', raw: text }, { status: 422 })
  } catch (error) {
    console.error('OCR API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
