// ============================================================================
//  데일리 브리핑 — 매일 자동 생성기 (GitHub Actions에서 실행됩니다)
//  하는 일: 오늘의 시장/심리 브리핑을 AI로 만들어 data/<날짜>.json 으로 저장하고
//           data/index.json 의 날짜 목록을 갱신합니다.
//  ※ 숫자(정서지수·지표값)는 코드가 안정적으로 계산하고, AI는 글(요약·키워드·기사)만
//     생성하므로 결과가 깨질 위험이 적습니다.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.ANTHROPIC_API_KEY;
// 모델은 여기서 바꿀 수 있습니다. (GitHub Secrets의 CLAUDE_MODEL 로도 덮어쓰기 가능)
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

if (!KEY) { console.error('❌ ANTHROPIC_API_KEY 가 없습니다. GitHub Secrets에 등록하세요.'); process.exit(1); }

const DATA_DIR = 'data';
const AGES = ['10대', '20대', '30대', '40대', '50대', '60대+'];
const SECTOR_NAMES = ['콘텐츠·미디어', '금융·자산', '소비·유통', '주거·부동산', '고용·노동'];

// ---- 날짜 (한국 시간 기준) -------------------------------------------------
function todaySeoul() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
}
function editionNo(date) {
  const d = new Date(date + 'T00:00:00Z');
  const start = new Date('2026-01-01T00:00:00Z');
  const idx = Math.round((d - start) / 86400000);
  return 'No. ' + (245 + idx); // 2026-06-17 → No. 412 와 연속되도록 보정
}

// ---- 결정적 난수 (같은 날짜면 항상 같은 값) --------------------------------
function makeRng(date, salt = 0) {
  let seed = salt + [...date].reduce((a, c) => a + c.charCodeAt(0), 0);
  return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
}

// ---- 직전 에디션 읽기 (어제 대비 계산용) -----------------------------------
function readLatestEdition(exceptDate) {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== exceptDate + '.json')
    .sort().reverse();
  for (const f of files) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { /* skip */ }
  }
  return null;
}

// ---- 숫자(정서지수/지표) 계산 ---------------------------------------------
function buildNumbers(date, prev) {
  const rng = makeRng(date, 7);
  const moodBase = [62, 58, 64, 60, 66, 70];
  const moods = {}, moodsPrev = {};
  AGES.forEach((a, i) => {
    const v = Math.max(50, Math.min(78, Math.round(moodBase[i] + (rng() * 8 - 4))));
    moods[a] = v;
    moodsPrev[a] = (prev && prev.moods && prev.moods[a] != null) ? prev.moods[a] : moodBase[i];
  });

  const valBase = [113, 104, 102, 100, 97];
  const sectors = SECTOR_NAMES.map((name, i) => {
    const prevVal = (prev && Array.isArray(prev.sectors) && prev.sectors[i]) ? prev.sectors[i].value : valBase[i];
    const value = Math.round((prevVal + (rng() * 3 - 1.4)) * 10) / 10;
    const delta = Math.round((value - prevVal) * 10) / 10;
    return { name, value, delta };
  });
  return { moods, moodsPrev, sectors };
}

// ---- AI 호출 ---------------------------------------------------------------
const PROMPT = `당신은 대한민국 소비·시장 트렌드 분석가입니다. 오늘(${todaySeoul()}) 기준의 현실적이고 구체적인 데일리 브리핑을 작성하세요.
반드시 아래 스키마의 "순수 JSON"만 출력하세요. 마크다운/설명/코드블록 금지.

{
  "briefing": {
    "headline": "한 줄 헤드라인(임팩트 있게)",
    "takeaways": ["핵심 요약 문장 3개"],
    "insight": "세대 심리와 시장 흐름을 연결하는 통찰 한 문장",
    "actions": ["마케터·기획자를 위한 실행 제안 2개(짧게)"]
  },
  "keywords": [
    { "term": "키워드", "change": "NN%", "dir": "up|down|flat" }
  ],   // 정확히 8개, 화제성 순위
  "rising": [
    { "title": "부상 트렌드명", "momentum": 70, "desc": "한두 문장 설명" }
  ],   // 3개
  "marketArticles": [
    { "title": "기사 제목", "source": "매체명", "time": "N시간 전|어제", "summary": "2~3문장 요약" }
  ],   // 3개
  "profileArticles": {
    "10대": [{ "title": "", "source": "", "time": "", "summary": "" }],
    "20대": [...], "30대": [...], "40대": [...], "50대": [...], "60대+": [...]
  }    // 각 연령대 2개씩, 그 세대의 심리·상황과 맞닿은 기사
}

조건: 한국어. 실제로 있을 법한 매체명/시점. 과장·허위 통계 금지. 키워드는 소비·심리·정책·기술 등 다양하게.`;

async function callAI() {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: 'user', content: PROMPT }] }),
  });
  if (!res.ok) throw new Error('AI 호출 실패 ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const j = await res.json();
  let txt = (j.content && j.content[0] && j.content[0].text || '').trim();
  txt = txt.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  if (s >= 0 && e > s) txt = txt.slice(s, e + 1);
  return JSON.parse(txt);
}

// ---- 검증 ------------------------------------------------------------------
function validate(ai) {
  const ok = ai && ai.briefing && ai.briefing.headline
    && Array.isArray(ai.briefing.takeaways) && ai.briefing.takeaways.length >= 3
    && Array.isArray(ai.keywords) && ai.keywords.length >= 6
    && Array.isArray(ai.rising) && ai.rising.length >= 3
    && Array.isArray(ai.marketArticles) && ai.marketArticles.length >= 3;
  if (!ok) throw new Error('AI 응답 형식이 올바르지 않습니다.');
}

// ---- 메인 ------------------------------------------------------------------
(async () => {
  const date = todaySeoul();
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const prev = readLatestEdition(date);
  const nums = buildNumbers(date, prev);

  let ai;
  try { ai = await callAI(); validate(ai); }
  catch (err) {
    console.error('⚠️  생성 실패 — 오늘 파일을 만들지 않고 종료합니다(사이트는 가장 최근 날짜를 계속 표시).');
    console.error(String(err));
    process.exit(1);
  }

  const keywords = ai.keywords.slice(0, 8).map((k, i) => ({
    rank: i + 1,
    term: String(k.term || '').trim(),
    dir: (k.dir === 'down' ? 'down' : k.dir === 'flat' ? 'flat' : 'up'),
    change: (String(k.change || '').match(/\d+%?/) || ['—'])[0],
  })).filter(k => k.term);

  const edition = {
    edition: editionNo(date),
    moods: nums.moods,
    moodsPrev: nums.moodsPrev,
    keywords,
    sectors: nums.sectors,
    rising: ai.rising.slice(0, 3),
    marketArticles: ai.marketArticles.slice(0, 3),
    briefing: {
      headline: ai.briefing.headline,
      takeaways: ai.briefing.takeaways.slice(0, 3),
      insight: ai.briefing.insight || '',
      actions: Array.isArray(ai.briefing.actions) ? ai.briefing.actions.slice(0, 2) : [],
    },
    profileArticles: (ai.profileArticles && typeof ai.profileArticles === 'object') ? ai.profileArticles : null,
  };

  fs.writeFileSync(path.join(DATA_DIR, date + '.json'), JSON.stringify(edition, null, 2) + '\n');
  console.log('✅ ' + date + '.json 생성 완료');

  // index.json 갱신 (최신순, 최대 60일 보관)
  const idxPath = path.join(DATA_DIR, 'index.json');
  let dates = [];
  try { dates = JSON.parse(fs.readFileSync(idxPath, 'utf8')).dates || []; } catch { /* new */ }
  if (!dates.includes(date)) dates.push(date);
  dates = [...new Set(dates)].sort().reverse().slice(0, 60);
  fs.writeFileSync(idxPath, JSON.stringify({ dates }, null, 2) + '\n');
  console.log('✅ index.json 갱신 (' + dates.length + '일 보관)');
})();
