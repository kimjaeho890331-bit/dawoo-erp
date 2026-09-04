import { redirect } from 'next/navigation'
import { hiddenPageRedirect, UI_HIDDEN } from '@/lib/uiHidden'
import ReportsPage from '@/components/reports/ReportsPage'

export default function Page() {
  const dest = hiddenPageRedirect(UI_HIDDEN.reports)
  if (dest) redirect(dest)
  return <ReportsPage />
}
