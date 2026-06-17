# 데일리 브리핑 — 매일 자동 업데이트 사이트 만들기 (비전문가용)

이 폴더를 GitHub에 올리면, **매일 아침 자동으로 그날의 브리핑이 생성**되고
**폰·PC에서 같은 주소로** 접속해 볼 수 있습니다. 한 번만 설정하면 이후엔 손댈 필요가 없어요.

> 준비물: ① GitHub 계정(이미 있음) ② Claude(Anthropic) API 키 1개

---

## 한눈에 보는 흐름
```
매일 06:00(한국시간)  →  GitHub의 로봇이 자동 실행
   →  AI가 오늘의 브리핑 작성 (data/오늘날짜.json 저장)
   →  사이트 자동 갱신
   →  당신은 같은 주소만 열면 끝
```

---

## 설정 (처음 한 번, 약 10분)

### 1단계 — 새 저장소(repository) 만들기
1. GitHub 우상단 **＋ → New repository**
2. 이름 입력(예: `daily-briefing`) → **Public** 선택 → **Create repository**

### 2단계 — 이 폴더의 파일을 업로드
- 저장소 화면의 **Add file → Upload files** 로 이 폴더 안의 **모든 파일/폴더**를 올리고 **Commit**.
  - 꼭 포함되어야 할 것: `index.html`, `support.js`, `data/` 폴더, `scripts/` 폴더, `.github/` 폴더
  - ⚠️ `.github` 폴더가 안 보이면 숨김 폴더라 그렇습니다. 파일을 드래그할 때 폴더째로 끌어다 놓으면 같이 올라갑니다.

### 3단계 — AI 키를 안전하게 등록
1. Claude API 키 발급: <https://console.anthropic.com> → **API Keys** → 키 생성 → 복사
2. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
3. **Name** 칸에 정확히 `ANTHROPIC_API_KEY` 입력, **Secret** 칸에 복사한 키 붙여넣기 → **Add secret**

> 키는 GitHub가 암호화해 보관하며 사이트에는 노출되지 않습니다.

### 4단계 — 사이트 켜기 (GitHub Pages)
1. 저장소 **Settings → Pages**
2. **Source** 를 **Deploy from a branch** 로 선택
3. **Branch** 를 `main` / `/ (root)` 로 두고 **Save**
4. 잠시 뒤 상단에 `https://<your-id>.github.io/daily-briefing/` 주소가 생깁니다 → **이게 매일 접속할 주소**

### 5단계 — 첫 브리핑 즉시 생성(테스트)
1. 저장소 **Actions** 탭 → (처음이면) 워크플로 실행 허용 버튼 클릭
2. 왼쪽 **Daily Briefing** 선택 → 오른쪽 **Run workflow → Run workflow**
3. 1~2분 뒤 초록 체크가 뜨면 성공. 4단계의 주소를 열어 확인하세요.

끝! 이후 매일 아침 자동으로 갱신됩니다.

---

## 폰에서 앱처럼 쓰기
- 주소를 연 뒤 브라우저 메뉴에서 **"홈 화면에 추가"** → 아이콘으로 바로 열 수 있습니다.
- 북마크·읽음 표시는 기기에 저장됩니다(기기마다 따로).

---

## 자주 묻는 것

**Q. 생성 시간을 바꾸고 싶어요.**
`.github/workflows/daily.yml` 의 `cron: "0 21 * * *"` 숫자를 바꾸세요. UTC 기준이며, **한국시간 = UTC + 9시간**입니다. (예: 한국 08:00 → `0 23 * * *`)

**Q. AI 모델을 바꾸고 싶어요.**
`scripts/generate.mjs` 상단의 `MODEL` 값을 바꾸거나, Secrets에 `CLAUDE_MODEL` 을 추가하세요.

**Q. 비용은?**
하루 한 번 호출이라 매우 적습니다(보통 월 몇백 원 수준). Anthropic 콘솔에서 사용량·한도를 설정할 수 있어요.

**Q. 어느 날 AI 생성이 실패하면?**
그날 파일을 만들지 않고 넘어가며, 사이트는 **가장 최근 날짜의 브리핑**을 계속 보여줍니다(빈 화면이 되지 않습니다).

**Q. 디자인을 바꾸고 싶어요.**
원본 디자인 파일은 `데일리 브리핑.dc.html` 입니다. 수정 후 그 내용을 `index.html` 로 다시 복사해 올리면 사이트에 반영됩니다. (요청하시면 제가 다시 내보내 드립니다.)

---

## 폴더 구성
```
index.html              ← 사이트 첫 화면(대시보드)
데일리 브리핑.dc.html    ← 편집용 원본 디자인
support.js              ← 화면 구동 런타임 (그대로 두세요)
data/
  index.json            ← 날짜 목록 (자동 갱신)
  profiles.json         ← 연령별 심리 분석 (잘 안 바뀌는 기본값)
  2026-06-17.json …     ← 날짜별 브리핑 (매일 자동 생성)
scripts/generate.mjs    ← 매일 실행되는 생성기
.github/workflows/daily.yml ← 매일 자동 실행 설정
```
