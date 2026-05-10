const LOCAL_DATA_URL = './latest.json';
const REMOTE_DATA_URL = 'https://raw.githubusercontent.com/hjleesm/lottery-data/main/latest.json';
const START_ROUND_DATE = new Date('2002-12-07T00:00:00+09:00');
const REFRESH_CUTOFF_HOUR = 21;

const $ = (id) => document.getElementById(id);
const state = {
  data: null,
  roundsByNum: new Map(),
  latest: null,
  expectedRound: null,
  expectedDate: null,
  generated: [],
  analytics: null,
};

function kstNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

function latestDrawDateKST(now = kstNow()) {
  const d = new Date(now);
  const day = d.getDay(); // Sun=0, Sat=6 in local browser time; we're using KST via locale string above.
  const cutoff = new Date(d);
  cutoff.setHours(REFRESH_CUTOFF_HOUR, 0, 0, 0);
  const shouldUseToday = day === 6 && d >= cutoff;
  const delta = shouldUseToday ? 0 : ((day + 1) % 7) + (day === 6 ? 7 : 0);
  const target = new Date(d);
  const back = shouldUseToday ? 0 : (day === 6 ? 7 : day + 1);
  target.setDate(d.getDate() - back);
  target.setHours(0, 0, 0, 0);
  return target;
}

function expectedRoundNow(now = kstNow()) {
  return roundForDate(latestDrawDateKST(now));
}

function expectedDrawDateNow(now = kstNow()) {
  return latestDrawDateKST(now);
}

function roundForDate(date) {
  const diffDays = Math.floor((date - START_ROUND_DATE) / 86400000);
  return 1 + Math.floor(diffDays / 7);
}

function fmtDate(dateStr) {
  return dateStr.replace(/-/g, '.');
}

function fmtKstDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function setStatus(text) {
  $('dataStatus').textContent = text;
}

function setRuleSummary() {
  const latest = state.latest;
  if (!latest) return;
  const latestNums = latest.numbers;
  const latestOdds = latestNums.filter((n) => n % 2 === 1).length;
  const latestLow = latestNums.filter((n) => n <= 15).length;
  const latestMid = latestNums.filter((n) => n >= 16 && n <= 30).length;
  const latestHigh = latestNums.filter((n) => n >= 31).length;
  const latestConsec = countConsecutivePairs(latestNums);
  const prev = state.roundsByNum.get(latest.round - 1);
  const latestOverlap = prev ? overlapCount(latestNums, prev.numbers) : 0;

  const stats = analyzeDataset();
  $('dataInfo').textContent = `전수 데이터: ${state.data.rounds.length.toLocaleString()}회차`;
  $('ruleSummary').innerHTML = `
    <div class="rule-accordion">
      <p class="rule-intro"><span class="rule-line">아래 규칙들은 1회차부터 현재 데이터의 최신 ${latest.round}차까지의 누적 기록을 바탕으로 계산했습니다.</span><span class="rule-line">현재 시각 기준 기대 최신 회차는 ${state.expectedRound ?? latest.round}차입니다.</span></p>
      <details class="rule-item">
        <summary>홀짝</summary>
        <p>
          <span class="rule-line">홀수와 짝수의 개수가 3:3에 가까운 조합을 우선하도록 점수를 줍니다.</span>
          <span class="rule-line">1~${latest.round}회차 분석: 3:3 정확 일치 ${stats.oddExact}/${stats.total}회 (${pct(stats.oddExact, stats.total)}%). 최신회차는 홀수 ${latestOdds}개, 짝수 ${6 - latestOdds}개입니다.</span>
          <span class="rule-line">분포: ${renderDistText(stats.topOdd, (odd) => `${odd}:${6 - odd}`, stats.total)}</span>
        </p>
      </details>
      <details class="rule-item">
        <summary>구간 분포</summary>
        <p>
          <span class="rule-line">1~15, 16~30, 31~45 구간이 2:2:2에 가까운 조합을 우선하도록 점수를 줍니다.</span>
          <span class="rule-line">1~${latest.round}회차 분석: 2:2:2 정확 일치 ${stats.bucketExact}/${stats.total}회 (${pct(stats.bucketExact, stats.total)}%). 최신회차는 ${latestLow}:${latestMid}:${latestHigh}입니다.</span>
          <span class="rule-line">분포: ${renderDistText(stats.topBucket, (bucket) => bucket, stats.total)}</span>
        </p>
      </details>
      <details class="rule-item">
        <summary>연속쌍 허용값</summary>
        <p>
          <span class="rule-line">붙은 숫자 쌍이 적은 조합을 우선하도록 점수를 줍니다.</span>
          <span class="rule-line">1~${latest.round}회차 분석: 연속쌍 0/1개 ${stats.consecLe1}/${stats.total}회 (${pct(stats.consecLe1, stats.total)}%). 최신회차는 ${latestConsec}개입니다.</span>
          <span class="rule-line">분포: ${renderDistText(stats.topConsec, (n) => `${n}개`, stats.total)}</span>
        </p>
      </details>
      <details class="rule-item">
        <summary>직전중복 허용값</summary>
        <p>
          <span class="rule-line">직전 회차와 겹치는 숫자가 적은 조합을 우선하도록 점수를 줍니다.</span>
          <span class="rule-line">1~${latest.round}회차 분석: 직전중복 0/1개 ${stats.repeatLe1}/${stats.total}회 (${pct(stats.repeatLe1, stats.total)}%). 최신회차는 ${latestOverlap}개입니다.</span>
          <span class="rule-line">분포: ${renderDistText(stats.topRepeat, (n) => `${n}개`, stats.total)}</span>
        </p>
      </details>
    </div>
  `;
}

function renderDistText(items, labelFn, total) {
  if (!items?.length) return '';
  const max = items[0]?.[1] ?? 0;
  return items.map(([value, count]) => {
    const cls = count === max ? 'rule-accent' : '';
    return `<span class="${cls}">${labelFn(value)} ${pct(count, total)}%</span>`;
  }).join(' · ');
}

function analyzeDataset() {
  const rounds = state.data?.rounds ?? [];
  let oddExact = 0;
  let bucketExact = 0;
  let consecLe1 = 0;
  let repeatLe1 = 0;
  const oddCounts = new Map();
  const bucketCounts = new Map();
  const consecCounts = new Map();
  const repeatCounts = new Map();
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    const nums = r.numbers;
    const odd = nums.filter((n) => n % 2 === 1).length;
    const low = nums.filter((n) => n <= 15).length;
    const mid = nums.filter((n) => n >= 16 && n <= 30).length;
    const high = nums.filter((n) => n >= 31).length;
    const consec = countConsecutivePairs(nums);
    const prev = rounds[i + 1];
    const overlap = prev ? overlapCount(nums, prev.numbers) : 0;
    if (odd === 3) oddExact++;
    if (low === 2 && mid === 2 && high === 2) bucketExact++;
    if (consec <= 1) consecLe1++;
    if (overlap <= 1) repeatLe1++;
    oddCounts.set(odd, (oddCounts.get(odd) ?? 0) + 1);
    const bucketKey = `${low}:${mid}:${high}`;
    bucketCounts.set(bucketKey, (bucketCounts.get(bucketKey) ?? 0) + 1);
    consecCounts.set(consec, (consecCounts.get(consec) ?? 0) + 1);
    repeatCounts.set(overlap, (repeatCounts.get(overlap) ?? 0) + 1);
  }
  const topOdd = [...oddCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topBucket = [...bucketCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topConsec = [...consecCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topRepeat = [...repeatCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { total: rounds.length, oddExact, bucketExact, consecLe1, repeatLe1, oddCounts, bucketCounts, consecCounts, repeatCounts, topOdd, topBucket, topConsec, topRepeat };
}

function pct(n, d) {
  if (!d) return '0.0';
  return ((n / d) * 100).toFixed(1);
}

function overlapCount(a, b) {
  const set = new Set(a);
  let c = 0;
  for (const n of b) if (set.has(n)) c++;
  return c;
}

function isLatestNumber(n) {
  return !!state.latest?.numbers?.includes(n);
}

function countConsecutivePairs(nums) {
  const sorted = [...nums].sort((x, y) => x - y);
  let c = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] === sorted[i] + 1) c++;
  }
  return c;
}

function readCardSwitches(cardEl) {
  return {
    consecutive: cardEl.querySelector('[data-switch="consecutive"]')?.checked ? 1 : 0,
    repeat: cardEl.querySelector('[data-switch="repeat"]')?.checked ? 1 : 0,
  };
}

function readCardSettings(cardEl) {
  const odd = cardEl.querySelector('[data-select="odd"]')?.value ?? '3';
  const bucket = cardEl.querySelector('[data-select="bucket"]')?.value ?? '2:2:2';
  return {
    odd: Number(odd),
    bucket,
    ...readCardSwitches(cardEl),
  };
}

function cardDraftSettings() {
  const analytics = state.analytics ?? analyzeDataset();
  return {
    odd: analytics.topOdd?.[0]?.[0] ?? 3,
    bucket: analytics.topBucket?.[0]?.[0] ?? '2:2:2',
    consecutive: analytics.topConsec?.[0]?.[0] ?? 0,
    repeat: analytics.topRepeat?.[0]?.[0] ?? 0,
  };
}

function cardLockedSettings() {
  const analytics = state.analytics ?? analyzeDataset();
  return {
    odd: analytics.topOdd?.[0]?.[0] ?? 3,
    bucket: analytics.topBucket?.[0]?.[0] ?? '2:2:2',
    consecutive: analytics.topConsec?.[0]?.[0] ?? 0,
    repeat: analytics.topRepeat?.[0]?.[0] ?? 0,
  };
}

function randomInt(max) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

function sampleTicket() {
  const nums = new Set();
  while (nums.size < 6) nums.add(1 + randomInt(45));
  return [...nums].sort((a, b) => a - b);
}

function bestTicketForSettings(latest, settings, trials = 2500) {
  let best = null;
  for (let i = 0; i < trials; i++) {
    const nums = sampleTicket();
    const meta = scoreTicket(nums, latest, settings);
    if (!best || meta.total < best.meta.total) best = { nums, meta, settings: { ...settings } };
  }
  return best;
}

function scoreTicket(nums, latest, settings) {
  const odd = nums.filter((n) => n % 2 === 1).length;
  const bucket = [0, 0, 0];
  for (const n of nums) bucket[n <= 15 ? 0 : n <= 30 ? 1 : 2]++;
  const consec = countConsecutivePairs(nums);
  const overlap = latest ? overlapCount(nums, latest.numbers) : 0;
  const targetBucket = settings.bucket.split(':').map(Number);

  const oddPenalty = Math.abs(odd - settings.odd) * 200;
  const bucketPenalty = (Math.abs(bucket[0] - targetBucket[0]) + Math.abs(bucket[1] - targetBucket[1]) + Math.abs(bucket[2] - targetBucket[2])) * 150;
  const consecutivePenalty = Math.abs(consec - settings.consecutive) * 320;
  const repeatPenalty = Math.abs(overlap - settings.repeat) * 360;

  const total = oddPenalty + bucketPenalty + consecutivePenalty + repeatPenalty;

  return { total, odd, bucket, consec, overlap, oddPenalty, bucketPenalty, consecutivePenalty, repeatPenalty };
}

function explainScore(meta) {
  return `홀짝 ${meta.odd}:${6 - meta.odd} · 구간 ${meta.bucket.join(':')} · 연속쌍 ${meta.consec}개 · 직전중복 ${meta.overlap}개`;
}

function formatCopyText() {
  return state.generated
    .slice(0, 5)
    .map((item, idx) => `추천${idx + 1} : ${item.nums.slice(0, 6).join(' ')}`)
    .join('\n');
}

async function copyCurrentTickets() {
  if (!state.generated.length) {
    state.generated = generateCandidates(5);
    renderTickets();
  }
  const text = formatCopyText();
  await navigator.clipboard.writeText(text);
  $('refreshNote').textContent = '추천번호를 클립보드에 복사했습니다.';
}

function generateCandidates(count = 5) {
  const latest = state.latest;
  const settings = getCurrentCardSettings(count);
  return Array.from({ length: count }, (_, idx) => bestTicketForSettings(latest, settings[idx] ?? cardDraftSettings()));
}

function regenerateGeneratedTickets() {
  if (!state.generated.length) return;
  state.generated = state.generated.map((item) => {
    if (!item?.settings) return item;
    return bestTicketForSettings(state.latest, item.settings);
  });
}

function getCurrentCardSettings(count) {
  const existing = $('results').querySelectorAll('.ticket');
  if (existing.length >= count) {
    return Array.from({ length: count }, (_, idx) => readCardSettings(existing[idx]));
  }
  if (state.generated.length >= count) {
    return state.generated.slice(0, count).map((item) => item.settings);
  }
  return Array.from({ length: count }, (_, idx) => (idx === 0 ? cardLockedSettings() : cardDraftSettings()));
}

function getOddOptions() {
  const analytics = state.analytics ?? analyzeDataset();
  return (analytics.topOdd?.length ? analytics.topOdd : [[3, analytics.total ?? 0], [4, 0], [2, 0]])
    .map(([odd, count]) => ({ odd, pct: pct(count, analytics.total) }));
}

function getBucketOptions() {
  const analytics = state.analytics ?? analyzeDataset();
  return (analytics.topBucket?.length ? analytics.topBucket : [['2:2:2', analytics.total ?? 0]])
    .map(([bucket, count]) => ({ bucket, pct: pct(count, analytics.total) }));
}

function getConsecutiveOptions() {
  const analytics = state.analytics ?? analyzeDataset();
  const counts = analytics.topConsec?.length ? analytics.topConsec : [[0, analytics.total ?? 0], [1, 0]];
  return counts.map(([value, count]) => ({ value, pct: pct(count, analytics.total) }));
}

function getRepeatOptions() {
  const analytics = state.analytics ?? analyzeDataset();
  const counts = analytics.topRepeat?.length ? analytics.topRepeat : [[0, analytics.total ?? 0], [1, 0]];
  return counts.map(([value, count]) => ({ value, pct: pct(count, analytics.total) }));
}

function buildOddSelect(value, disabled = false) {
  const options = getOddOptions();
  return `
    <label class="rule-field">
      <span>홀짝</span>
      <select data-select="odd" ${disabled ? 'disabled' : ''}>
        ${options.map((opt) => `<option value="${opt.odd}" ${Number(value) === opt.odd ? 'selected' : ''}>${opt.odd}:${6 - opt.odd} (${opt.pct}%)</option>`).join('')}
      </select>
    </label>
  `;
}

function buildBucketSelect(value, disabled = false) {
  const options = getBucketOptions();
  return `
    <label class="rule-field">
      <span>구간분포</span>
      <select data-select="bucket" ${disabled ? 'disabled' : ''}>
        ${options.map((opt) => `<option value="${opt.bucket}" ${value === opt.bucket ? 'selected' : ''}>${opt.bucket} (${opt.pct}%)</option>`).join('')}
      </select>
    </label>
  `;
}

function buildStatToggle(name, label, options, value, disabled = false) {
  const left = options.find((opt) => Number(opt.value) === 0) ?? options[0] ?? { value: 0, pct: '0.0' };
  const right = options.find((opt) => Number(opt.value) === 1) ?? options[1] ?? { value: 1, pct: '0.0' };
  return `
    <div class="stat-toggle ${name === 'repeat' ? 'repeat-toggle' : ''} ${disabled ? 'locked' : ''}">
      <div class="stat-title">${label}</div>
      <label class="switch stat-switch">
        <span class="switch-stat left">${left.value}개 (${left.pct}%)</span>
        <input type="checkbox" data-switch="${name}" ${Number(value) === 1 ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
        <span class="switch-stat right">${right.value}개 (${right.pct}%)</span>
      </label>
    </div>
  `;
}

function renderTickets() {
  const generated = state.generated.length ? state.generated : Array.from({ length: 5 }, () => null);
  const results = $('results');
  results.innerHTML = generated.map((item, idx) => {
    const fixed = idx === 0;
    const defaults = fixed ? cardLockedSettings() : cardDraftSettings();
    if (!item) {
      const emptyBalls = Array.from({ length: 6 }, () => `<span class="ball empty"></span>`).join('') + `<span class="ball bonus empty"></span>`;
      return `
        <article class="ticket placeholder ${fixed ? 'locked' : ''}" data-index="${idx}">
          <div class="ticket-main">
            <div class="ticket-core">
              <div class="ticket-head">
                <h3>추천 ${idx + 1}</h3>
                ${fixed ? '<span class="badge muted">모든 규칙 최고 확률 고정</span>' : ''}
              </div>
              <div class="balls">${emptyBalls}</div>
            </div>
            <div class="ticket-options">
              <div class="ticket-rules">
                ${buildOddSelect(defaults.odd, fixed)}
                ${buildBucketSelect(defaults.bucket, fixed)}
              </div>
              <div class="ticket-switches">
                ${buildStatToggle('consecutive', '연속쌍', getConsecutiveOptions(), defaults.consecutive, fixed)}
                ${buildStatToggle('repeat', '직전중복', getRepeatOptions(), defaults.repeat, fixed)}
              </div>
            </div>
          </div>
        </article>
      `;
    }
    const nums = item.nums.slice(0, 6);
    const balls = nums.map((n) => `<span class="ball ${isLatestNumber(n) ? 'repeat-hit' : ''}">${n}</span>`).join('') + `<span class="ball bonus">+</span>`;
    return `
      <article class="ticket ${fixed ? 'locked' : ''}" data-index="${idx}">
        <div class="ticket-main">
          <div class="ticket-core">
            <div class="ticket-head">
              <h3>추천 ${idx + 1}</h3>
              ${fixed ? '<span class="badge muted">모든 규칙 최고 확률 고정</span>' : ''}
            </div>
            <div class="balls">${balls}</div>
          </div>
          <div class="ticket-options">
            <div class="ticket-rules">
              ${buildOddSelect(item.settings.odd, fixed)}
              ${buildBucketSelect(item.settings.bucket, fixed)}
            </div>
            <div class="ticket-switches">
              ${buildStatToggle('consecutive', '연속쌍', getConsecutiveOptions(), item.settings.consecutive, fixed)}
              ${buildStatToggle('repeat', '직전중복', getRepeatOptions(), item.settings.repeat, fixed)}
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function updateSingleTicket(index) {
  const item = state.generated[index];
  if (!item) return;
  const card = $('results').querySelector(`[data-index="${index}"]`);
  if (!card) return;
  const settings = readCardSettings(card);
  const meta = scoreTicket(item.nums, state.latest, settings);
  state.generated[index] = { ...item, meta, settings };
}

function currentDataSeemsFresh(data, now = kstNow()) {
  const latest = data.rounds[0];
  const expected = expectedRoundNow(now);
  return latest.round >= expected;
}

function withCacheBust(url, key = Date.now()) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(key)}`;
}

async function loadLocalData() {
  const res = await fetch(LOCAL_DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`local load failed: ${res.status}`);
  const data = await res.json();
  return data;
}

async function loadRemoteData(expectedRound) {
  const res = await fetch(withCacheBust(REMOTE_DATA_URL, `${expectedRound}-${Date.now()}`), { cache: 'no-store' });
  if (!res.ok) throw new Error(`remote load failed: ${res.status}`);
  return await res.json();
}

function ingestData(data) {
  state.data = data;
  state.roundsByNum = new Map(data.rounds.map((r) => [r.round, r]));
  state.latest = data.rounds[0];
  state.expectedRound = expectedRoundNow();
  state.expectedDate = expectedDrawDateNow();
  state.analytics = analyzeDataset();
  $('latestRound').textContent = `${state.expectedRound ?? state.latest.round}회`;
  $('latestDate').textContent = fmtDate(fmtKstDate(state.expectedDate || new Date()));
  setRuleSummary();
}

async function refreshLatest() {
  const expected = expectedRoundNow();
  $('refreshNote').textContent = `현재 시각 기준 ${expected}회차를 확인 중...`;
  try {
    const remote = await loadRemoteData(expected);
    ingestData(remote);
    regenerateGeneratedTickets();
    $('refreshNote').textContent = state.latest.round >= expected
      ? `최신화 완료: ${state.latest.round}회까지 반영됨`
      : `원본 데이터는 아직 ${state.latest.round}회까지만 있습니다. 현재 시각 기준 기대 회차는 ${expected}회입니다.`;
    if (state.generated.length) renderTickets();
  } catch (err) {
    $('refreshNote').textContent = `최신화 실패: ${err.message}`;
  }
}

async function init() {
  $('generateBtn').addEventListener('click', () => {
    state.generated = generateCandidates(5);
    renderTickets();
  });
  $('copyBtn').addEventListener('click', copyCurrentTickets);
  $('refreshBtn').addEventListener('click', refreshLatest);
  $('results').addEventListener('change', (e) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    const ticket = e.target.closest('.ticket');
    if (!ticket) return;
    updateSingleTicket(Number(ticket.dataset.index));
  });

  try {
    const data = await loadLocalData();
    ingestData(data);
    const fresh = currentDataSeemsFresh(data);
    $('refreshNote').textContent = fresh
      ? `로컬 데이터가 현재 시각 기준으로 최신입니다. (기대 최신 ${state.expectedRound}회)`
      : `로컬 데이터는 ${data.rounds[0].round}회까지이고, 현재 시각 기준 기대 최신은 ${state.expectedRound}회입니다.`;
    setStatus('로컬 데이터 로드 완료');
    renderTickets();
  } catch (err) {
    setStatus(`로드 실패: ${err.message}`);
    $('refreshNote').textContent = 'local latest.json을 읽지 못했습니다.';
    renderTickets();
  }
}

init();
