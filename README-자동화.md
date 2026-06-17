# 데일리 브리핑 — 매일 자동 업데이트 사이트 만들기

이 폴더를 GitHub에 올리면, **매일 아침 자동으로 그날의 브리핑이 생성**되고
**폰·PC에서 같은 주소로** 접속해 볼 수 있습니다. 한 번만 설정하면 이후엔 손댈 필요가 없어요.

> **💰 비용: 0원** — Google AI Studio 무료 API를 사용합니다. 신용카드도 필요 없습니다.
> 
> 준비물: ① GitHub 계정(이미 있음) ② Google 계정(Gmail이면 됨)

---

## 한눈에 보는 흐름
```
매일 06:00(한국시간)  →  GitHub의 로봇이 자동 실행
   →  Google Gemini AI가 오늘의 브리핑 작성 (data/오늘날짜.json 저장)
   →  사이트 자동 갱신
   →  당신은 같은 주소만 열면 끝
```

---

## 설정 (처음 한 번, 약 10~15분)

### 1단계 — 새 저장소(repository) 만들기
1. GitHub 접속 → 우상단 **＋ → New repository**
2. 이름 입력(예: `daily-briefing`) → **Public** 선택 → **Create repository**

### 2단계 — 이 폴더의 파일을 업로드
1. 저장소 화면에서 **Add file → Upload files**
2. 다운받은 ZIP 압축을 풀고, **안에 있는 파일/폴더를 전부** 드래그해서 올리기
   - 꼭 포함되어야 할 것: `index.html`, `support.js`, `data/` 폴더, `scripts/` 폴더, `.github/` 폴더
   - ⚠️ `.github` 폴더가 안 보이면 숨김 폴더입니다
     - **Mac**: Finder에서 `Cmd + Shift + .` 누르면 보임
     - **Windows**: 탐색기 상단 **보기 → 숨김 항목** 체크
3. 아래 **Commit changes** 클릭

### 3단계 — AI 키를 무료로 발급 (Google AI Studio)
1. **https://aistudio.google.com/apikey** 접속 (Google 계정으로 로그인)
2. **"API 키 만들기" (Create API key)** 클릭
3. 프로젝트 선택 화면이 나오면 아무 프로젝트나 선택 (또는 자동 생성)
4. 생성된 키를 **복사** 📋

> ✅ 신용카드 입력 없음. Gemini Flash 무료 티어는 하루 250회 호출 가능 — 우리는 하루 1회만 씁니다.

### 4단계 — GitHub에 키 등록 (사이트에 절대 노출되지 않습니다)
1. GitHub 저장소 → **Settings → Secrets and variables → Actions**
2. **New repository secret** 클릭
3. **Name**: `GEMINI_API_KEY` / **Secret**: 복사한 키 붙여넣기 → **Add secret**

### 5단계 — 사이트 켜기 (GitHub Pages)
1. 저장소 **Settings → Pages**
2. Source: **Deploy from a branch** 선택
3. Branch: **main** / **/ (root)** → **Save**
4. 1~2분 뒤 상단에 주소가 생깁니다: `https://<내아이디>.github.io/daily-briefing/`
5. **이 주소가 매일 접속할 고정 주소**입니다 🎉

### 6단계 — 첫 브리핑 만들기 (테스트)
1. 저장소 **Actions** 탭 → (처음이면) 워크플로 활성화 버튼 클릭
2. 왼쪽 **Daily Briefing** 선택 → 오른쪽 **Run workflow → Run workflow**
3. 1~2분 뒤 ✅ 초록 체크 뜨면 성공!
4. 5단계의 주소를 열어 확인하세요 — 오늘자 브리핑이 떠 있습니다

**끝! 이후 매일 아침 6시(한국시간)에 자동 갱신됩니다.**

---

## 폰에서 앱처럼 쓰기
주소를 연 뒤 브라우저 메뉴에서 **"홈 화면에 추가"** → 아이콘으로 바로 열 수 있습니다.

---

## 자주 묻는 것

**Q. 정말 무료인가요?**
네. Google AI Studio 무료 티어 + GitHub Pages 무료 + GitHub Actions 무료(월 2,000분). 하루 1회 실행(~2분)이면 월 60분 정도라 한도에 전혀 걸리지 않습니다.

**Q. 생성 시간을 바꾸고 싶어요.**
`.github/workflows/daily.yml` 의 `cron: "0 21 * * *"` 숫자를 바꾸세요. UTC 기준이며, **한국시간 = UTC + 9시간**입니다.
- 한국 아침 6시 → `0 21 * * *` (현재 설정)
- 한국 아침 8시 → `0 23 * * *`
- 한국 아침 7시 → `0 22 * * *`

**Q. 어느 날 AI 생성이 실패하면?**
그날 파일을 만들지 않고 넘어갑니다. 사이트는 **가장 최근 성공한 날짜의 브리핑**을 계속 보여줍니다(빈 화면이 되지 않습니다).

**Q. 디자인을 바꾸고 싶어요.**
원본 디자인 파일은 `데일리 브리핑.dc.html`입니다. 수정 후 그 내용을 `index.html`로 다시 복사해 올리면 됩니다.

---

## 폴더 구성
```
index.html              ← 사이트 첫 화면 (대시보드)
데일리 브리핑.dc.html    ← 편집용 원본 디자인
support.js              ← 화면 구동 런타임 (그대로 두세요)
data/
  index.json            ← 날짜 목록 (자동 갱신)
  profiles.json         ← 연령별 심리 분석 (기본값, 잘 안 바뀜)
  2026-06-17.json …     ← 날짜별 브리핑 (매일 자동 생성)
scripts/generate.mjs    ← 매일 실행되는 생성기 (Google Gemini 사용)
.github/workflows/daily.yml ← 매일 자동 실행 설정
README-자동화.md         ← 이 파일
```
