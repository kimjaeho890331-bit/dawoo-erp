import { redirect } from 'next/navigation'
import { hiddenPageRedirect, UI_HIDDEN } from '@/lib/uiHidden'
import LaborPage from '@/components/labor/LaborPage'

export default function Page() {
  const dest = hiddenPageRedirect(UI_HIDDEN.labor)
  if (dest) redirect(dest)
  return <LaborPage />
}
