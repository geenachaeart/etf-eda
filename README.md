# 네이버 ETF 인사이트

네이버 금융 ETF API의 현재 시세를 운용사·시장·상품별로 탐색하는 단일 페이지 반응형 HTML 대시보드입니다. 모든 분석과 상품 조회 화면이 한 문서에 이어지며, 메뉴를 누르면 해당 구역으로 이동합니다.

## 주요 기능

- 전체 ETF 수, 시가총액, 거래대금, 평균 등락률 요약
- 운용사별 상품 수, 점유율, 거래대금, 평균 수익률 비교
- 국내 지수, 업종·테마, 해외 주식, 채권, 원자재 등 시장별 분석
- ETF명·종목코드 검색, 운용사·시장·등락 필터, 열 정렬과 페이지 이동
- 현재가, NAV, 괴리율, 3개월 수익률을 보여주는 상품 상세 화면
- 60초 자동 갱신과 수동 새로고침

## 실행

별도 패키지 설치가 필요하지 않습니다. Node.js 20 이상에서 실행합니다.

```bash
node server.mjs
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다. 네이버 금융 API가 EUC-KR로 응답하고 브라우저의 교차 출처 호출을 허용하지 않으므로, 로컬 서버와 배포 Worker가 `/api/etfs` 프록시를 제공합니다.

## 검사와 빌드

```bash
node --check src/app.js
node --check server.mjs
node scripts/build.mjs
```

빌드 결과는 `dist/server/index.js`에 생성됩니다. 원본 화면은 `src/index.html`, `src/styles.css`, `src/app.js`에서 관리합니다.

## 데이터 출처

- [네이버 금융 ETF API](https://finance.naver.com/api/sise/etfItemList.nhn)

표시되는 수치는 정보 제공 목적이며 투자 판단의 근거로 사용할 수 없습니다.
