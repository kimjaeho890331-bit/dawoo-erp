import { redirect } from 'next/navigation'
import { hiddenPageRedirect, UI_HIDDEN } from '@/lib/uiHidden'
import KpiPage from '@/components/kpi/KpiPage'

export default function Page() {
  const dest = hiddenPageRedirect(UI_HIDDEN.kpi)
  if (dest) redirect(dest)
  return <KpiPage />
}
