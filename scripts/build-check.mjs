/**
 * 배포 전 확인용 프로덕션 빌드.
 *
 * `next build`를 그냥 돌리면 개발 서버와 같은 .next 폴더를 두고 다투다
 * Turbopack 캐시가 깨진다("Another write batch or compaction is already active").
 * 그러면 개발 서버가 죽어서, 빌드할 때마다 서버를 껐다 켜야 했다.
 *
 * 여기서는 .next-build를 쓰므로 개발 서버를 켜 둔 채로 확인할 수 있다.
 * 배포(Vercel)는 이 스크립트를 쓰지 않고 `npm run build`를 그대로 돌리므로
 * 결과물 경로는 평소와 같다.
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

// next build는 next-env.d.ts와 tsconfig.json을 자기 distDir에 맞춰 고쳐 쓴다.
// 그대로 두면 커밋된 파일이 gitignore된 .next-build를 가리키게 되고(새로 받은
// 사람에겐 없는 경로다), 개발 서버를 다시 켜면 또 .next로 돌아가 작업 트리가
// 계속 더러워진다. 원래 내용을 기억했다가 되돌려 놓는다.
const TOUCHED = ['next-env.d.ts', 'tsconfig.json']
const before = new Map(TOUCHED.map(f => [f, readFileSync(f, 'utf8')]))

try {
  execSync('next build', {
    stdio: 'inherit',
    env: { ...process.env, NEXT_DIST_DIR: '.next-build' },
  })
} finally {
  for (const [file, original] of before) {
    if (readFileSync(file, 'utf8') !== original) writeFileSync(file, original)
  }
}
