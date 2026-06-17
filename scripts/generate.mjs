// ============================================================================
//  데일리 브리핑 — 매일 자동 생성기 v3
//  ★ Google Gemini API(무료) + Google News RSS(무료)
//  ★ AI는 요약·분석만, 기사는 실제 뉴스에서 가져옴 → 진짜 링크 제공
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_RETRIES = 3;

if (!KEY) { console.error('❌ GEMINI_API_KEY 가 없습니다.'); process.exit(1); }

const DATA_DIR = 'data';
const AGES = ['10대', '20대', '30대', '40대', '50대', '60대+'];
const SECTOR_NAMES = ['콘텐츠·미디어', '금융·자산', '소비·유통', '주거·부동산', '고용·노동'];

function todaySeoul() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); }
function editionNo(date) {
  const d = new Date(date + 'T00:00:00Z'), start = new Date('2026-01-01T00:00:00Z');
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
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch {}
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

// ============================================================================
// 실제 뉴스 가져오기 (Google News RSS — 무료, 키 불필요)
// ============================================================================
async function fetchRealNews(query, count = 3) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) { console.warn('  RSS 실패:', res.status, query); return []; }
    const xml = await res.text();

    // 간단한 RSS XML 파싱 (외부 라이브러리 없이)
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) && items.length < count) {
      const block = match[1];
      const get = (tag) => { const m = block.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[(.+?)\\]\\]>|<${tag}[^>]*>(.+?)</${tag}>`)); return m ? (m[1] || m[2] || '').trim() : ''; };

      const title = get('title').replace(/<[^>]+>/g, '').trim();
      const link = get('link');
      const source = get('source') || '';
      const pubDate = get('pubDate');

      if (!title || !link) continue;

      // 시간 표시: "N시간 전" 형태로 변환
      let timeLabel = '오늘';
      if (pubDate) {
        const diff = Date.now() - new Date(pubDate).getTime();
        const hours = Math.floor(diff / 3600000);
        if (hours < 1) timeLabel = '방금 전';
        else if (hours < 24) timeLabel = hours + '시간 전';
        else if (hours < 48) timeLabel = '어제';
        else timeLabel = Math.floor(hours / 24) + '일 전';
      }

      items.push({ title, source, time: timeLabel, url: link, summary: '' });
    }
    return items;
  } catch (err) {
    console.warn('  RSS 에러:', query, err.message);
    return [];
  }
}

async function fetchAllNews(keywords, ageTopics) {
  console.log('📰 실제 뉴스 수집 중...');

  // 시장 기사: 상위 키워드 3개로 검색
  const marketQueries = keywords.slice(0, 3).map(k => k.term + ' 한국');
  const marketResults = [];
  for (const q of marketQueries) {
    const arts = await fetchRealNews(q, 2);
    marketResults.push(...arts);
    console.log(`  시장 "${q}" → ${arts.length}건`);
  }
  // 중복 제거 (제목 기준)
  const seen = new Set();
  const marketArticles = marketResults.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; }).slice(0, 3);

  // 연령대별 기사
  const profileArticles = {};
  for (const age of AGES) {
    const topics = ageTopics[age] || [age + ' 심리', age + ' 소비'];
    const arts = [];
    for (const t of topics.slice(0, 2)) {
      const fetched = await fetchRealNews(t + ' 한국', 2);
      arts.push(...fetched);
      console.log(`  ${age} "${t}" → ${fetched.length}건`);
    }
    const ageSeen = new Set();
    profileArticles[age] = arts.filter(a => { if (ageSeen.has(a.title)) return false; ageSeen.add(a.title); return true; }).slice(0, 2);
  }

  console.log('✅ 뉴스 수집 완료 (시장 ' + marketArticles.length + '건 + 연령대별)');
  return { marketArticles, profileArticles };
}

// ============================================================================
// Gemini AI — 분석·요약만 담당 (기사는 위에서 실제 뉴스로 가져옴)
// ============================================================================
function buildPrompt() {
  return `당신은 대한민국 소비·시장 트렌드 분석가입니다. 오늘(${todaySeoul()}) 기준 브리핑을 JSON으로 작성하세요.

반드시 유효한 JSON 객체만 출력. 마크다운/설명/코드블록 절대 금지.

스키마:
{"briefing":{"headline":"한줄 헤드라인","takeaways":["문장1","문장2","문장3"],"insight":"통찰 한 문장","actions":["액션1","액션2"]},"keywords":[{"term":"키워드","change":"NN%","dir":"up"}],"rising":[{"title":"트렌드명","momentum":80,"desc":"설명"}],"ageTopics":{"10대":["검색어1","검색어2"],"20대":[...],"30대":[...],"40대":[...],"50대":[...],"60대+":[...]}}

규칙:
- keywords 정확히 8개(화제성순), rising 3개
- ageTopics: 각 연령대와 관련된 뉴스 검색 키워드 2개씩 (예: "10대 디지털 학습", "청소년 SNS 트렌드")
- 한국어, 현실적, 과장 금지
- 반드시 완전한 JSON으로 닫을 것`;
}

async function callGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt() }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.7, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`API HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j = await res.json();
  let txt = '';
  try { txt = j.candidates[0].content.parts[0].text; } catch { throw new Error('응답 구조 이상: ' + JSON.stringify(j).slice(0, 500)); }
  console.log('📝 AI 응답 길이:', txt.length, '자');
  txt = txt.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('JSON 못 찾음: ' + txt.slice(0, 200));
  return JSON.parse(txt.slice(s, e + 1));
}

async function callWithRetry() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🔄 AI 시도 ${attempt}/${MAX_RETRIES}...`);
      return await callGemini();
    } catch (err) {
      console.error(`❌ 시도 ${attempt} 실패: ${err.message}`);
      if (attempt === MAX_RETRIES) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

function validate(ai) {
  if (!ai?.briefing?.headline) throw new Error('briefing.headline 없음');
  if (!Array.isArray(ai.briefing.takeaways) || ai.briefing.takeaways.length < 3) throw new Error('takeaways 부족');
  if (!Array.isArray(ai.keywords) || ai.keywords.length < 6) throw new Error('keywords 부족');
  if (!Array.isArray(ai.rising) || ai.rising.length < 3) throw new Error('rising 부족');
}

// ============================================================================
// 메인
// ============================================================================
(async () => {
  const date = todaySeoul();
  console.log('📅 날짜(KST):', date);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const prev = readLatestEdition(date);
  const nums = buildNumbers(date, prev);

  // 1단계: AI로 분석·키워드 생성
  let ai;
  try { ai = await callWithRetry(); validate(ai); }
  catch (err) {
    console.error('⚠️  AI 생성 실패 — 종료합니다.');
    console.error(String(err));
    process.exit(1);
  }

  const keywords = ai.keywords.slice(0, 8).map((k, i) => ({
    rank: i + 1, term: String(k.term || '').trim(),
    dir: (k.dir === 'down' ? 'down' : k.dir === 'flat' ? 'flat' : 'up'),
    change: (String(k.change || '').match(/\d+%?/) || ['—'])[0],
  })).filter(k => k.term);

  // 2단계: 실제 뉴스 가져오기
  const ageTopics = ai.ageTopics || {};
  const news = await fetchAllNews(keywords, ageTopics);

  // 조립
  const edition = {
    edition: editionNo(date),
    moods: nums.moods, moodsPrev: nums.moodsPrev,
    keywords,
    sectors: nums.sectors,
    rising: ai.rising.slice(0, 3),
    marketArticles: news.marketArticles,
    profileArticles: news.profileArticles,
    briefing: {
      headline: ai.briefing.headline,
      takeaways: ai.briefing.takeaways.slice(0, 3),
      insight: ai.briefing.insight || '',
      actions: Array.isArray(ai.briefing.actions) ? ai.briefing.actions.slice(0, 2) : [],
    },
  };

  fs.writeFileSync(path.join(DATA_DIR, date + '.json'), JSON.stringify(edition, null, 2) + '\n');
  console.log('✅ ' + date + '.json 생성 완료');

  const idxPath = path.join(DATA_DIR, 'index.json');
  let dates = [];
  try { dates = JSON.parse(fs.readFileSync(idxPath, 'utf8')).dates || []; } catch {}
  if (!dates.includes(date)) dates.push(date);
  dates = [...new Set(dates)].sort().reverse().slice(0, 60);
  fs.writeFileSync(idxPath, JSON.stringify({ dates }, null, 2) + '\n');
  console.log('✅ index.json 갱신 (' + dates.length + '일)');
})();
