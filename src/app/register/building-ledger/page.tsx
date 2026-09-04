import { redirect } from 'next/navigation'
import { hiddenPageRedirect, UI_HIDDEN } from '@/lib/uiHidden'
import BuildingLedgerPage from '@/components/register/BuildingLedgerPage'

export default function Page() {
  const dest = hiddenPageRedirect(UI_HIDDEN.buildingLedger)
  if (dest) redirect(dest)
  return <BuildingLedgerPage />
}
