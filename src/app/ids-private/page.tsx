import CredentialsPage from '@/components/ids/CredentialsPage'
import { PRIVATE_IDS_MENU } from '@/lib/credentialAccess'

export default function Page() {
  return <CredentialsPage kind="private" title={PRIVATE_IDS_MENU} />
}
