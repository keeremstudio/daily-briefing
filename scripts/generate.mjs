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

// 브랜드·디자인 섹션 기본 검색 주제
const BRAND_DESIGN_DEFAULT_QUERIES = [
  '브랜드 디자인 트렌드',
  '브랜드 아이덴티티 리뉴얼',
  '패키지 디자인 사례',
];

// 신뢰 언론사 화이트리스트 (이 매체의 기사만 통과)
// [name, weight] — 매칭은 source.includes(name) 부분 매칭, 정렬 시 weight 우선
const ALLOWED_SOURCES = [
  // 메이저 방송·종합지 (가중치 3)
  ['SBS', 3], ['KBS', 3], ['JTBC', 3], ['MBN', 3],
  ['중앙일보', 3], ['JoongAng', 3],
  ['세계일보', 3],
  // 경제 전문 (가중치 2)
  ['한국경제TV', 2], ['한국경제', 2],
  ['매일경제', 2], ['머니투데이', 2], ['이데일리', 2], ['헤럴드경제', 2],
  // IT·기술 전문 (가중치 2)
  ['블로터', 2], ['Bloter', 2],
  ['HelloDD', 2], ['Hello DD', 2], ['헬로디디', 2],
  ['데이터뉴스', 2], ['dataNews', 2], ['DataNews', 2],
  // 스포츠·문화 (가중치 2)
  ['OSEN', 2],
  // 영문 (가중치 2)
  ['Arirang', 2], ['아리랑', 2],
  // 지역 (가중치 1)
  ['경기신문', 1], ['인천일보', 1], ['경기일보', 1],
  ['kbc', 1], ['KBC', 1], ['광주방송', 1],
  // 연예·라이프 (가중치 1)
  ['마이데일리', 1], ['mydaily', 1], ['MyDaily', 1],
  // 기업·인물 (가중치 1)
  ['CEO스코어', 1], ['CEO 스코어', 1],
  ['뉴스앤조이', 1], ['NEWSJOY', 1], ['Newsnjoy', 1], ['newsnjoy', 1],
  // 디자인 전문 (브랜드·디자인 섹션용, 가중치 3)
  ['월간디자인', 3], ['designdb', 3], ['DesignDB', 3], ['디자인정글', 3], ['designjungle', 3],
];

function sourceWeight(source) {
  if (!source) return 0;
  let max = 0;
  for (const [name, w] of ALLOWED_SOURCES) {
    if (source.includes(name) && w > max) max = w;
  }
  return max;
}

function isAllowedSource(source) {
  return sourceWeight(source) > 0;
}

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
    while ((m = re.exec(xml)) && items.length < count) {
      const b = m[1];
      const get = (tag) => { const x = b.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return x ? (x[1] || x[2] || '').trim() : ''; };
      const title = get('title').replace(/<[^>]+>/g, '').trim();
      const link = get('link');
      const source = get('source') || '';
      const pubDate = get('pubDate');
      if (!title || !link) continue;
      if (!isAllowedSource(source)) continue;  // 화이트리스트 외 매체는 제외
      if (title.includes('[AD]') || title.includes('[광고]') || title.includes('후원]')) continue;
      let timeLabel = '오늘';
      let publishedAt = null;
      if (pubDate) {
        const t = new Date(pubDate);
        publishedAt = isNaN(t) ? null : t.toISOString();
        const hours = Math.floor((Date.now() - t.getTime()) / 3600000);
        timeLabel = hours < 1 ? '방금 전' : hours < 24 ? hours + '시간 전' : hours < 48 ? '어제' : Math.floor(hours/24) + '일 전';
      }
      items.push({ title, source, time: timeLabel, url: link, summary: '', publishedAt });
    }
    return items.slice(0, count);
  } catch { return []; }
}

async function fetchAllNews(keywords, ageTopics, brandTopics) {
  console.log('📰 실제 뉴스 수집 중...');
  const dedup = (arr) => { const seen = new Set(); return arr.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; }); };

  // 가중치 기준 정렬: weight 높은 매체 우선, 같은 weight면 최신순
  const sortByWeight = (arr) => arr.slice().sort((a, b) => {
    const wa = sourceWeight(a.source), wb = sourceWeight(b.source);
    if (wb !== wa) return wb - wa;
    return (b.publishedAt || '').localeCompare(a.publishedAt || '');
  });

  // 시장 기사: 상위 키워드로 검색
  const marketAll = [];
  for (const k of keywords.slice(0, 4)) {
    const arts = await fetchRealNews(k.term, 3);
    marketAll.push(...arts);
    console.log(`  시장 "${k.term}" → ${arts.length}건`);
  }
  const marketArticles = sortByWeight(dedup(marketAll)).slice(0, 6); // 신뢰도 필터로 일부 탈락 가능하므로 여유 있게 6건

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
    profileArticles[age] = sortByWeight(dedup(ageAll)).slice(0, 5);
    console.log(`  ${age} → ${profileArticles[age].length}건`);
  }

  // 브랜드·디자인 기사: AI 주제 + 기본 주제 결합
  const aiBrand = (brandTopics || []).slice(0, 2);
  const brandQueries = [...aiBrand, ...BRAND_DESIGN_DEFAULT_QUERIES].slice(0, 4);
  const brandAll = [];
  for (const q of brandQueries) {
    const arts = await fetchRealNews(q, 3);
    brandAll.push(...arts);
    console.log(`  브랜드 "${q}" → ${arts.length}건`);
  }
  const brandArticles = sortByWeight(dedup(brandAll)).slice(0, 6);

  return { marketArticles, profileArticles, brandArticles };
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
  return `대한민국 소비·시장·디자인 분석가. 오늘(${todaySeoul()}) 기준 브리핑. 유효 JSON만 출력.

{"briefing":{"headline":"임팩트 헤드라인","takeaways":["요약1","요약2","요약3"],"insight":"세대심리+시장 연결 통찰","actions":["마케터 액션1","액션2"]},"keywords":[{"term":"키워드","change":"NN%","dir":"up|down|flat"}],"rising":[{"title":"트렌드명","momentum":80,"desc":"한두문장"}],"ageTopics":{"10대":["뉴스검색어1","검색어2"],"20대":[...],"30대":[...],"40대":[...],"50대":[...],"60대+":[...]},"brandDesign":{"headline":"브랜드·디자인 영역 오늘의 한 줄","insight":"디자이너·브랜드 운영자에게 의미 있는 통찰 한 문장","rising":[{"title":"디자인/브랜딩 트렌드명","momentum":80,"desc":"한두문장"},{"title":"...","momentum":75,"desc":"..."},{"title":"...","momentum":70,"desc":"..."}],"topics":["뉴스검색어1","검색어2"]}}

keywords 8개(화제성순), rising 3개, ageTopics 연령당 2개, brandDesign.rising 정확히 3개, brandDesign.topics 2개. 브랜드·디자인은 패키지, 아이덴티티, 에디토리얼, 리테일 공간, 컬러·서체 트렌드 등을 포괄. 한국어, 현실적, 완전한 JSON.`;
}

// 2단계 프롬프트: 기사 요약
function summaryPrompt(articles) {
  const list = articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}`).join('\n');
  return `아래 실제 뉴스 기사 목록을 분석하세요. 각 기사에 대해 5가지를 평가:

1. summary: 5~7문장의 상세 요약 (배경·핵심·맥락을 모두 담을 것. 단순 제목 풀이 금지. 정보 풍부)
2. bullets: 핵심 포인트 3개. 각 항목은 한 문장. "누가/무엇이/어떻게" 명확하게
3. implication: 이 사안의 시사점·관점 한 문장. 마케터·디자이너·기획자·소비자 시야 중 가장 적합한 관점으로
4. category: 아래 4개 중 하나
   - "news": 사실 보도 (취재 기반의 일반 뉴스)
   - "opinion": 칼럼·사설·의견·인터뷰
   - "PR": 보도자료·홍보·기업 발표·신제품 출시·자사 행사 안내
   - "clickbait": 낚시성·과장·근거 빈약·자극적 제목
5. trustScore: 1~5 정수 (5=신뢰할 만한 사실 보도, 3=중립, 1=의심스럽거나 검증 부족)

기사 목록:
${list}

유효 JSON만 출력. 형식:
{"items":[{"summary":"...","bullets":["...","...","..."],"implication":"...","category":"news","trustScore":4}, ...]}

기사 순서대로 같은 수의 항목 반환. 보수적으로 평가하되, 정상 보도는 너무 엄격히 깎지 말 것. summary와 implication은 한국어로, 완전한 문장으로.`;
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
  const brandTopics = ai.brandDesign?.topics || [];
  const news = await fetchAllNews(keywords, ageTopics, brandTopics);

  // 3단계: AI가 수집된 기사를 분석 (요약 + 분류 + 신뢰도 점수)
  const allArticles = [...news.marketArticles];
  AGES.forEach(age => allArticles.push(...(news.profileArticles[age] || [])));
  allArticles.push(...news.brandArticles);

  if (allArticles.length > 0) {
    try {
      console.log('📝 AI 기사 분석 중 (' + allArticles.length + '건, 요약+분류+신뢰도)...');
      const sumResult = await retryCall(summaryPrompt(allArticles));
      const items = sumResult?.items || [];
      allArticles.forEach((a, i) => {
        if (items[i]) {
          a.summary = items[i].summary || '';
          a.bullets = Array.isArray(items[i].bullets) ? items[i].bullets.slice(0, 3) : [];
          a.implication = items[i].implication || '';
          a.category = items[i].category || 'news';
          a.trustScore = typeof items[i].trustScore === 'number' ? items[i].trustScore : 3;
        } else {
          a.bullets = []; a.implication = '';
          a.category = 'news'; a.trustScore = 3;
        }
      });
      const filtered = allArticles.filter(a => a.category === 'news' && a.trustScore >= 3);
      console.log('✅ 분석 완료 — 통과: ' + filtered.length + '/' + allArticles.length +
        ' (제외: PR ' + allArticles.filter(a=>a.category==='PR').length +
        ', clickbait ' + allArticles.filter(a=>a.category==='clickbait').length +
        ', opinion ' + allArticles.filter(a=>a.category==='opinion').length +
        ', 저점수 ' + allArticles.filter(a=>a.category==='news'&&a.trustScore<3).length + ')');
    } catch (err) {
      console.warn('⚠️  분석 실패 (기사 링크는 유지, 신뢰도 필터 미적용):', err.message);
      allArticles.forEach(a => { a.category = 'news'; a.trustScore = 3; a.bullets = a.bullets || []; a.implication = a.implication || ''; });
    }
  }

  // 4단계: 신뢰도 필터 + 최종 개수 슬라이스
  // 매체 가중치는 이미 fetchAllNews에서 정렬됨
  const passFilter = (a) => a.category === 'news' && a.trustScore >= 3;
  // brand 섹션은 디자인 칼럼·사례·인터뷰가 많아 opinion까지 허용 (PR/clickbait만 제외)
  const passBrandFilter = (a) => (a.category === 'news' || a.category === 'opinion') && a.trustScore >= 3;
  const finalMarket = news.marketArticles.filter(passFilter).slice(0, 4);
  const finalProfile = {};
  AGES.forEach(age => {
    finalProfile[age] = (news.profileArticles[age] || []).filter(passFilter).slice(0, 3);
  });
  const finalBrand = news.brandArticles.filter(passBrandFilter).slice(0, 4);

  console.log('📋 최종 — market: ' + finalMarket.length + '건, brand: ' + finalBrand.length + '건 (brand opinion 허용)');

  // 조립
  const edition = {
    edition: editionNo(date),
    moods: nums.moods, moodsPrev: nums.moodsPrev,
    keywords, sectors: nums.sectors,
    rising: ai.rising?.slice(0, 3) || [],
    marketArticles: finalMarket,
    profileArticles: finalProfile,
    brandDesign: {
      headline: ai.brandDesign?.headline || '',
      insight: ai.brandDesign?.insight || '',
      rising: (ai.brandDesign?.rising || []).slice(0, 3),
    },
    brandArticles: finalBrand,
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
