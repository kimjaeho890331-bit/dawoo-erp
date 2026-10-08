import { describe, it, expect } from 'vitest'
import { checkUpload, MAX_FILE_SIZE } from './uploadRules'

const xlsx = { name: '노무비.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 5_300_000 }

describe('checkUpload', () => {
  it('허용 파일은 통과시키고 한글 파일명은 저장 가능한 경로로 바꾼다', () => {
    expect(checkUpload(xlsx, 'approval/1_노무비.xlsx')).toEqual({ ok: true, safePath: 'approval/1____.xlsx' })
  })

  it('20MB까지는 받고 넘으면 거부한다', () => {
    expect(checkUpload({ ...xlsx, size: MAX_FILE_SIZE }, 'approval/a.xlsx').ok).toBe(true)
    expect(checkUpload({ ...xlsx, size: MAX_FILE_SIZE + 1 }, 'approval/a.xlsx')).toEqual({
      ok: false, status: 400, error: '파일 크기는 20MB 이하만 가능합니다',
    })
  })

  it('MIME이 낯설어도 확장자가 맞으면 통과시킨다', () => {
    expect(checkUpload({ ...xlsx, type: 'application/x-zip-compressed' }, 'approval/a.xlsx').ok).toBe(true)
  })

  it('MIME도 확장자도 아니면 거부한다', () => {
    expect(checkUpload({ name: 'run.exe', type: 'application/x-msdownload', size: 10 }, 'approval/run.exe')).toEqual({
      ok: false, status: 400, error: '허용되지 않는 파일 형식입니다 (exe)',
    })
  })

  it('허용 폴더 밖 경로는 거부하고, 상위 이동(..)은 지워서 허용 폴더 안에 가둔다', () => {
    expect(checkUpload(xlsx, 'secret/a.xlsx')).toEqual({ ok: false, status: 403, error: '허용되지 않는 저장 경로입니다' })
    expect(checkUpload(xlsx, '../approval/a.xlsx')).toEqual({ ok: true, safePath: 'approval/a.xlsx' })
    expect(checkUpload(xlsx, 'approval/../../secret/a.xlsx')).toEqual({ ok: true, safePath: 'approval///secret/a.xlsx' })
  })
})
