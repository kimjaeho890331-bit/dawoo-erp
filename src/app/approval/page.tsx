import { Suspense } from 'react'
import ApprovalPage from '@/components/approval/ApprovalPage'

// ApprovalPage가 useSearchParams로 ?box=를 읽으므로 Suspense 경계가 필요하다.
export default function Page() {
  return (
    <Suspense>
      <ApprovalPage />
    </Suspense>
  )
}
