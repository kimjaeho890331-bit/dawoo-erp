/**
 * Supabase 목록 조회는 한 번에 최대 1000줄까지만 돌려준다(그 뒤는 말없이 잘린다).
 * 접수대장처럼 해마다 쌓이는 표는 1000건을 넘는 순간 오래된 건이 목록에서 사라지므로,
 * 1000줄씩 나눠 끝까지 읽는다.
 *
 * page(from, to)는 `.range(from, to)`를 붙인 조회를 돌려주면 된다. 순서가 흔들리면
 * 페이지 사이에서 줄이 겹치거나 빠지므로, 부르는 쪽에서 고유한 열(id)로도 정렬해 둔다.
 */
export const PAGE_SIZE = 1000

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw error
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) return all
  }
}

/** Promise.all 안에서 다른 조회와 같은 모양({ data, error })으로 쓰려고 감싼 것 */
export function fetchAllPagesResult<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = PAGE_SIZE,
): Promise<{ data: T[] | null; error: unknown }> {
  return fetchAllPages(page, pageSize).then(
    data => ({ data, error: null }),
    error => ({ data: null, error }),
  )
}
