# 주소/건축물대장 API 연동 가이드

## 연동 흐름
```
[1] 주소 키워드 → 도로명주소 API → 주소 목록
[2] 선택 → 표제부 API → 건물 전체 정보
[3] 자동 → 전유부 API → 호별 면적
[4] 선택 → 소유자 API → 소유자 이름/주민번호 (활성화 대기)
→ 접수대장 자동 입력
```

## 1단계: 도로명주소 검색
- URL: `https://business.juso.go.kr/addrlink/addrLinkApi.do`
- Route: `/api/address/search?keyword=검색어`
- 추출: `roadAddr`→도로명, `jibunAddr`→지번, `bdNm`→건물명
- 내부용: `admCd`(앞5=시군구,뒤5=법정동), `lnbrMnnm`(번), `lnbrSlno`(지)

## 2단계: 표제부 (건물 전체)
- URL: `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo`
- Route: `/api/address/building?sigunguCd=&bjdongCd=&bun=&ji=`
- 추출: `bldNm`(건물명), `mainPurpsCdNm`(용도), `hhldCnt`(세대수), `useAprDay`(사용승인일 YYYYMMDD)
- 주의: `useAprDay` YYYYMMDD→YYYY-MM-DD 변환, 빈 값 가능

## 3단계: 전유부 (호별 면적)
- URL: `getBrExposPubuseAreaInfo` (같은 서비스)
- Route: `/api/address/units?sigunguCd=&bjdongCd=&bun=&ji=`
- 필터: `exposPubuseGbCd==="1"` (전유만, 공용 무시)
- 추출: `dongNm`(동), `hoNm`(호), `area`(전유면적㎡)
- 페이징: numOfRows 최대100건 → totalCount 기반 병렬 요청

## 4단계: 소유자 (활성화 대기)
- URL: `getBrOwnrInfo` (별도 서비스 `15021136` 신청 필요)
- Route: `/api/address/owner?sigunguCd=&bjdongCd=&bun=&ji=`
- 추출: `ownrNm`(이름), `ownrRgstNo`(주민번호 앞7자리), `ownrGbCdNm`(개인/법인)
- 현재 상태: 코드 구현 완료, API 키 활성화 대기

## 필드 매핑
| 접수대장 필드 | 소스 | 방식 |
|-------------|------|------|
| road_address / jibun_address | 1단계 | 자동 |
| building_name | 1→2단계 | 자동+수정가능 |
| building_use / unit_count / approval_date | 2단계 | 자동 |
| dong / ho / exclusive_area | 3단계 | 선택 |
| owner_name | 4단계 또는 수동 | 자동/수동 |
| owner_phone | - | 수동 입력 |

## 에러 처리
| 상황 | 처리 |
|------|------|
| 주소 검색 없음 | "검색 결과가 없습니다" |
| 표제부 실패 | 수동 입력 허용 |
| 전유부 실패 | 동호수+면적 직접 입력 |
| API 타임아웃 | 5초 제한, 수동 입력 안내 |
