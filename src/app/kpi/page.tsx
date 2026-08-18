import { redirect } from 'next/navigation'
import { UI_HIDDEN } from '@/lib/uiHidden'
import KpiPage from '@/components/kpi/KpiPage'

export default function Page() {
  if (UI_HIDDEN.kpi) redirect('/dashboard')
  return <KpiPage />
}
