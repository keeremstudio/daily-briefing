// ============================================================================
//  데일리 브리핑 — 매일 자동 생성기 v4
//  ★ Google Gemini(무료) + Google News RSS(무료)
//  ★ 2단계: AI 분석 → 실제 뉴스 수집 → AI가 기사 요약 → 고품질 브리핑
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

// 연령대별 기본 검색 주제 (AI가 추가 주제를 제공하면 합침)
const AGE_DEFAULT_QUERIES = {
  '10대': ['청소년 교육 정책', '10대 SNS 디지털'],
  '20대': ['청년 취업 일자리', 'MZ세대 소비 트렌드'],
  '30대': ['30대 부동산 내집마련', '맞벌이 육아 워라밸'],
  '40대': ['40대 건강 관리', '중년 자녀교육 사교육비'],
  '50대': ['50대 은퇴 준비', '시니어 재취업 창업'],
  '60대+': ['고령층 복지 정책', '시니어 디지털 격차'],
};

// 저품질 소스 필터 (광고성·클릭베이트 도메인)
const BLOCKED_SOURCES = ['보도자료', '와이어드코리아', 'PR Newswire', 'Globe Newswire', '미디어SR'];

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
  for (const f of files) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch {} }
  return null;
}
function buildNumbers(date, prev) {
  const rng = makeRng(date, 7);
  const moodBase = [62, 58, 64, 60, 66, 70];
  const moods = {}, moodsPrev = {};
  AGES.forEach((a, i) => {
    moods[a] = Math.max(50, Math.min(78, Math.round(moodBase[i] + (rng() * 8 - 4))));
    moodsPrev[a] = (prev?.moods?.[a] != null) ? prev.moods[a] : moodBase[i];
  });
  const valBase = [113, 104, 102, 100, 97];
  const sectors = SECTOR_NAMES.map((name, i) => {
    const prevVal = prev?.sectors?.[i]?.value ?? valBase[i];
    const value = Math.round((prevVal + (rng() * 3 - 1.4)) * 10) / 10;
    return { name, value, delta: Math.round((value - prevVal) * 10) / 10 };
  });
  return { moods, moodsPrev, sectors };
}

// ============================================================================
// Google News RSS — 실제 뉴스 수집 (무료)
// ============================================================================
async function fetchRealNews(query, count = 4) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' when:7d')}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) && items.length < count + 4) {
      const b = m[1];
      const get = (tag) => { const x = b.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return x ? (x[1] || x[2] || '').trim() : ''; };
      const title = get('title').replace(/<[^>]+>/g, '').trim();
      const link = get('link');
      const source = get('source') || '';
      const pubDate = get('pubDate');
      if (!title || !link) continue;
      if (BLOCKED_SOURCES.some(bs => source.includes(bs))) continue;
      if (title.includes('[AD]') || title.includes('[광고]') || title.includes('후원]')) continue;
      let timeLabel = '오늘';
      if (pubDate) {
        const hours = Math.floor((Date.now() - new Date(pubDate).getTime()) / 3600000);
        timeLabel = hours < 1 ? '방금 전' : hours < 24 ? hours + '시간 전' : hours < 48 ? '어제' : Math.floor(hours/24) + '일 전';
      }
      items.push({ title, source, time: timeLabel, url: link, summary: '' });
    }
    return items.slice(0, count);
  } catch { return []; }
}

async function fetchAllNews(keywords, ageTopics) {
  console.log('📰 실제 뉴스 수집 중...');
  const dedup = (arr) => { const seen = new Set(); return arr.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; }); };

  // 시장 기사: 상위 키워드로 검색
  const marketAll = [];
  for (const k of keywords.slice(0, 4)) {
    const arts = await fetchRealNews(k.term, 3);
    marketAll.push(...arts);
    console.log(`  시장 "${k.term}" → ${arts.length}건`);
  }
  const marketArticles = dedup(marketAll).slice(0, 4);

  // 연령대별 기사: AI 주제 + 기본 주제 결합
  const profileArticles = {};
  for (const age of AGES) {
    const aiQueries = ageTopics[age] || [];
    const defaults = AGE_DEFAULT_QUERIES[age] || [];
    const queries = [...aiQueries.slice(0, 2), ...defaults].slice(0, 3);
    const ageAll = [];
    for (const q of queries) {
      const arts = await fetchRealNews(q, 2);
      ageAll.push(...arts);
    }
    profileArticles[age] = dedup(ageAll).slice(0, 3);
    console.log(`  ${age} → ${profileArticles[age].length}건`);
  }
  return { marketArticles, profileArticles };
}

// ============================================================================
// Gemini API
// ============================================================================
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.7, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`API HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j = await res.json();
  let txt = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  txt = txt.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('JSON 못 찾음');
  return JSON.parse(txt.slice(s, e + 1));
}

async function retryCall(prompt) {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try { console.log(`🔄 AI 호출 ${i}/${MAX_RETRIES}...`); return await callGemini(prompt); }
    catch (err) { console.error(`  실패: ${err.message}`); if (i === MAX_RETRIES) throw err; await new Promise(r => setTimeout(r, 3000)); }
  }
}

// 1단계 프롬프트: 분석
function analysisPrompt() {
  return `대한민국 소비·시장 분석가. 오늘(${todaySeoul()}) 기준 브리핑. 유효 JSON만 출력.

{"briefing":{"headline":"임팩트 헤드라인","takeaways":["요약1","요약2","요약3"],"insight":"세대심리+시장 연결 통찰","actions":["마케터 액션1","액션2"]},"keywords":[{"term":"키워드","change":"NN%","dir":"up|down|flat"}],"rising":[{"title":"트렌드명","momentum":80,"desc":"한두문장"}],"ageTopics":{"10대":["뉴스검색어1","검색어2"],"20대":[...],"30대":[...],"40대":[...],"50대":[...],"60대+":[...]}}

keywords 8개(화제성순), rising 3개, ageTopics 연령당 2개. 한국어, 현실적, 완전한 JSON.`;
}

// 2단계 프롬프트: 기사 요약
function summaryPrompt(articles) {
  const list = articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}`).join('\n');
  return `아래 실제 뉴스 기사 제목을 보고, 각각 2~3문장으로 핵심 내용을 요약하세요.
기사의 맥락을 추론하여 정보가 풍부한 요약을 작성하세요.

기사 목록:
${list}

유효 JSON만 출력. 형식: {"summaries":["요약1","요약2",...]}
기사 순서대로 같은 수의 요약을 반환하세요.`;
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

  // 1단계: AI 분석
  let ai;
  try {
    ai = await retryCall(analysisPrompt());
    if (!ai?.briefing?.headline || !ai?.keywords?.length) throw new Error('분석 형식 오류');
  } catch (err) { console.error('⚠️  AI 분석 실패:', err.message); process.exit(1); }

  const keywords = ai.keywords.slice(0, 8).map((k, i) => ({
    rank: i + 1, term: String(k.term || '').trim(),
    dir: k.dir === 'down' ? 'down' : k.dir === 'flat' ? 'flat' : 'up',
    change: (String(k.change || '').match(/\d+%?/) || ['—'])[0],
  })).filter(k => k.term);

  // 2단계: 실제 뉴스 수집
  const ageTopics = ai.ageTopics || {};
  const news = await fetchAllNews(keywords, ageTopics);

  // 3단계: AI가 수집된 기사를 요약 (고품질 요약 제공)
  const allArticles = [...news.marketArticles];
  AGES.forEach(age => allArticles.push(...(news.profileArticles[age] || [])));

  if (allArticles.length > 0) {
    try {
      console.log('📝 AI 기사 요약 중 (' + allArticles.length + '건)...');
      const sumResult = await retryCall(summaryPrompt(allArticles));
      const sums = sumResult?.summaries || [];
      allArticles.forEach((a, i) => { if (sums[i]) a.summary = sums[i]; });
      console.log('✅ 요약 완료');
    } catch (err) {
      console.warn('⚠️  요약 실패 (기사 링크는 유지):', err.message);
      // 요약 실패해도 기사 자체는 실제 링크가 있으므로 계속 진행
    }
  }

  // 조립
  const edition = {
    edition: editionNo(date),
    moods: nums.moods, moodsPrev: nums.moodsPrev,
    keywords, sectors: nums.sectors,
    rising: ai.rising?.slice(0, 3) || [],
    marketArticles: news.marketArticles,
    profileArticles: news.profileArticles,
    briefing: {
      headline: ai.briefing.headline,
      takeaways: ai.briefing.takeaways?.slice(0, 3) || [],
      insight: ai.briefing.insight || '',
      actions: ai.briefing.actions?.slice(0, 2) || [],
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
