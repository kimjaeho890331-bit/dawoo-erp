import { redirect } from 'next/navigation'
import { UI_HIDDEN } from '@/lib/uiHidden'
import ReportsPage from '@/components/reports/ReportsPage'

export default function Page() {
  if (UI_HIDDEN.reports) redirect('/dashboard')
  return <ReportsPage />
}
