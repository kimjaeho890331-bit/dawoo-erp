import { redirect } from 'next/navigation'
import { UI_HIDDEN } from '@/lib/uiHidden'
import AIReviewPage from '@/components/ai-review/AIReviewPage'

export default function Page() {
  if (UI_HIDDEN.aiReview) redirect('/dashboard')
  return <AIReviewPage />
}
