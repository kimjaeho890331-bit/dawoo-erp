import { NextRequest } from 'next/server'

const SYSTEM_PROMPT = `당신은 다우건설 ERP AI 비서입니다. 다우건설은 경기도 수원 본사에 위치한 건설회사로, 정부 지원사업(수도공사/소규모 주택수선)과 건설 현장 프로젝트를 관리합니다.

당신의 역할:
- 접수 관련 질문에 답변 (접수 현황, 진행 상태 조회, 단계별 안내)
- 업무 관련 질문에 답변 (일정 관리, 미수금 현황, 보고서 관련)
- 일반 업무 도움 (서류 작성 안내, 절차 설명, 업무 조언)
- 다우건설의 15개 관할 시(수원, 성남, 안양, 부천, 광명, 시흥, 안산, 군포, 의왕, 과천, 용인, 화성, 오산, 평택, 하남) 관련 정보 안내

대화 규칙:
- 친절하지만 전문적인 톤을 유지하세요
- 답변은 간결하고 핵심적으로 하세요
- 모르는 정보는 솔직히 모른다고 하세요
- 한국어로 답변하세요
- 건설/ERP 업무에 집중하되, 일반적인 질문에도 도움을 주세요`

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { messages } = await request.json()

    // Limit to last 20 messages
    const recentMessages = (messages || []).slice(-20)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: recentMessages.map((msg: { role: string; content: string }) => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        })),
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Anthropic API error:', response.status, errorText)
      return new Response(
        JSON.stringify({ error: 'AI API request failed' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Stream the response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') continue

                try {
                  const parsed = JSON.parse(data)
                  if (
                    parsed.type === 'content_block_delta' &&
                    parsed.delta?.type === 'text_delta'
                  ) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`)
                    )
                  }
                } catch {
                  // Skip unparseable chunks
                }
              }
            }
          }
        } catch (err) {
          console.error('Stream error:', err)
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
