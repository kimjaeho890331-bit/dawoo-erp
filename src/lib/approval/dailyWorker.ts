interface AttachedFileLike {
  file_name: string
  file_url: string
  size: number
}

interface DailyVendorLike {
  name: string
  vendor_type: string | null
  id_card_url: string | null
  bankbook_url: string | null
  safety_cert_url: string | null
}

/** 일용직 거래처를 고르면 등록된 신분증·통장사본·안전교육이수증 URL을 첨부 목록에 넣는다. */
export function attachDailyWorkerFiles<T extends AttachedFileLike>(files: T[], v: DailyVendorLike): T[] {
  if (v.vendor_type !== '일용직') return files

  const extra: AttachedFileLike[] = []
  const add = (url: string | null | undefined, label: string) => {
    if (!url) return
    extra.push({ file_name: `${label}_${v.name}`, file_url: url, size: 0 })
  }
  add(v.id_card_url, '신분증')
  add(v.bankbook_url, '통장사본')
  add(v.safety_cert_url, '안전교육이수증')
  if (extra.length === 0) return files

  const urls = new Set(files.map(f => f.file_url))
  const added = extra.filter(f => !urls.has(f.file_url)) as T[]
  return [...files, ...added]
}
