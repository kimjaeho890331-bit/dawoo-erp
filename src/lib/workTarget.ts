export type WorkKind = '' | 'site' | 'project'

export function workKindFromIds(siteId?: string | null, projectId?: string | null): WorkKind {
  if (siteId) return 'site'
  if (projectId) return 'project'
  return ''
}

export function projectLabel(p: { building_name?: string | null; ho?: string | null; dong?: string | null }): string {
  const name = (p.building_name || '').trim() || '접수'
  const ho = (p.ho || '').trim()
  const dong = (p.dong || '').trim()
  const loc = [dong, ho ? `${ho}호` : ''].filter(Boolean).join(' ')
  return loc ? `${name} ${loc}` : name
}

export function workTargetLabel(opts: {
  siteName?: string | null
  projectName?: string | null
  siteId?: string | null
  projectId?: string | null
}): { text: string; missing: boolean } {
  if (opts.siteId && opts.siteName) return { text: opts.siteName, missing: false }
  if (opts.projectId && opts.projectName) return { text: opts.projectName, missing: false }
  if (opts.siteId) return { text: '현장', missing: false }
  if (opts.projectId) return { text: '지원사업', missing: false }
  return { text: '현장 없음', missing: true }
}
