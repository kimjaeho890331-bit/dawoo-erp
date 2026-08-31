import CredentialsPage from '@/components/ids/CredentialsPage'
import { SHARED_IDS_MENU } from '@/lib/credentialAccess'

export default function Page() {
  return <CredentialsPage kind="shared" title={SHARED_IDS_MENU} />
}
