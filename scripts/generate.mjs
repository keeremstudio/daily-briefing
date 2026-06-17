// ============================================================================
//  데일리 브리핑 — 매일 자동 생성기 (GitHub Actions에서 실행됩니다)
//  ★ Google Gemini API 무료 티어 사용 — 비용 0원, 신용카드 불필요
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_RETRIES = 3;

if (!KEY) { console.error('❌ GEMINI_API_KEY 가 없습니다. GitHub Secrets에 등록하세요.'); process.exit(1); }

const DATA_DIR = 'data';
const AGES = ['10대', '20대', '30대', '40대', '50대', '60대+'];
const SECTOR_NAMES = ['콘텐츠·미디어', '금융·자산', '소비·유통', '주거·부동산', '고용·노동'];

function todaySeoul() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}
function editionNo(date) {
  const d = new Date(date + 'T00:00:00Z');
  const start = new Date('2026-01-01T00:00:00Z');
  return 'No. ' + (245 + Math.round((d - start) / 86400000));
}
function makeRng(date, salt = 0) {
  let seed = salt + [...date].reduce((a, c) => a + c.charCodeAt(0), 0);
  return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
}

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

function buildNumbers(date, prev) {
  const rng = makeRng(date, 7);
  const moodBase = [62, 58, 64, 60, 66, 70];
  const moods = {}, moodsPrev = {};
  AGES.forEach((a, i) => {
    moods[a] = Math.max(50, Math.min(78, Math.round(moodBase[i] + (rng() * 8 - 4))));
    moodsPrev[a] = (prev && prev.moods && prev.moods[a] != null) ? prev.moods[a] : moodBase[i];
  });
  const valBase = [113, 104, 102, 100, 97];
  const sectors = SECTOR_NAMES.map((name, i) => {
    const prevVal = (prev && Array.isArray(prev.sectors) && prev.sectors[i]) ? prev.sectors[i].value : valBase[i];
    const value = Math.round((prevVal + (rng() * 3 - 1.4)) * 10) / 10;
    return { name, value, delta: Math.round((value - prevVal) * 10) / 10 };
  });
  return { moods, moodsPrev, sectors };
}

// ---- Google Gemini API 호출 ------------------------------------------------
function buildPrompt() {
  return `당신은 대한민국 소비·시장 트렌드 분석가입니다. 오늘(${todaySeoul()}) 기준의 브리핑을 JSON으로 작성하세요.

반드시 유효한 JSON 객체만 출력하세요. 설명·마크다운·코드블록 절대 금지.

스키마:
{"briefing":{"headline":"한줄 헤드라인","takeaways":["문장1","문장2","문장3"],"insight":"통찰 한 문장","actions":["액션1","액션2"]},"keywords":[{"term":"키워드","change":"NN%","dir":"up"}],"rising":[{"title":"트렌드명","momentum":80,"desc":"설명"}],"marketArticles":[{"title":"제목","source":"매체","time":"N시간 전","summary":"요약"}],"profileArticles":{"10대":[{"title":"","source":"","time":"","summary":""}],"20대":[...],"30대":[...],"40대":[...],"50대":[...],"60대+":[...]}}

규칙:
- keywords 정확히 8개, rising 3개, marketArticles 3개, profileArticles 연령대당 2개
- 한국어, 현실적인 매체명, 과장 금지
- 반드시 완전한 JSON으로 닫을 것 (모든 괄호/따옴표 닫기)`;
}

async function callGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt() }] }],
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    throw new Error(`API HTTP ${res.status}: ${body}`);
  }

  const j = await res.json();

  // 응답 텍스트 추출
  let txt = '';
  try { txt = j.candidates[0].content.parts[0].text; }
  catch { throw new Error('응답 구조가 예상과 다름: ' + JSON.stringify(j).slice(0, 500)); }

  console.log('📝 AI 응답 길이:', txt.length, '자');

  // JSON 정리
  txt = txt.trim();
  txt = txt.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('JSON 객체를 찾을 수 없음. 응답 시작: ' + txt.slice(0, 200));
  txt = txt.slice(s, e + 1);

  return JSON.parse(txt);
}

async function callWithRetry() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🔄 시도 ${attempt}/${MAX_RETRIES}...`);
      const result = await callGemini();
      console.log('✅ AI 응답 파싱 성공');
      return result;
    } catch (err) {
      console.error(`❌ 시도 ${attempt} 실패: ${err.message}`);
      if (attempt === MAX_RETRIES) throw err;
      console.log('   3초 후 재시도...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

function validate(ai) {
  if (!ai || !ai.briefing || !ai.briefing.headline) throw new Error('briefing.headline 없음');
  if (!Array.isArray(ai.briefing.takeaways) || ai.briefing.takeaways.length < 3) throw new Error('takeaways 부족');
  if (!Array.isArray(ai.keywords) || ai.keywords.length < 6) throw new Error('keywords 부족');
  if (!Array.isArray(ai.rising) || ai.rising.length < 3) throw new Error('rising 부족');
  if (!Array.isArray(ai.marketArticles) || ai.marketArticles.length < 3) throw new Error('marketArticles 부족');
}

// ---- 메인 ------------------------------------------------------------------
(async () => {
  const date = todaySeoul();
  console.log('📅 오늘 날짜(KST):', date);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const prev = readLatestEdition(date);
  const nums = buildNumbers(date, prev);

  let ai;
  try {
    ai = await callWithRetry();
    validate(ai);
  } catch (err) {
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

  const idxPath = path.join(DATA_DIR, 'index.json');
  let dates = [];
  try { dates = JSON.parse(fs.readFileSync(idxPath, 'utf8')).dates || []; } catch {}
  if (!dates.includes(date)) dates.push(date);
  dates = [...new Set(dates)].sort().reverse().slice(0, 60);
  fs.writeFileSync(idxPath, JSON.stringify({ dates }, null, 2) + '\n');
  console.log('✅ index.json 갱신 (' + dates.length + '일 보관)');
})();
