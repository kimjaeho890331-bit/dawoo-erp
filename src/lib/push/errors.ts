/**
 * 만료된(재전송 불가능한) 구독 오류인지 판단한다.
 * 410 Gone / 404 Not Found = 브라우저/OS가 구독을 폐기했다는 뜻이라
 * push_subscriptions에서 지워야 계속 재시도하지 않는다.
 *
 * send.ts와 별도 파일로 뺀 이유: send.ts는 @/lib/approval/guard(admin)를 import하는데,
 * guard.ts는 모듈 로드 시점에 createClient()를 즉시 실행해 Supabase 클라이언트를 만든다.
 * 유닛 테스트 환경(vitest)에는 그 env 값이 주입되지 않아 send.ts를 그대로 import하면
 * "supabaseUrl is required" 오류로 테스트 자체가 죽는다. 이 순수 함수만 따로 두면
 * 그 의존성 없이 테스트할 수 있다.
 */
export function isExpiredSubscriptionError(err: unknown): boolean {
  const code = (err as { statusCode?: number } | null | undefined)?.statusCode
  return code === 410 || code === 404
}
