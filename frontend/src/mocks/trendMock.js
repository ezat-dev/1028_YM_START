/*
 * 모니터링 > TREND '예시 데이터 보기' — 실제 스냅샷(tb_temp_snapshot) 대신 화면에서 만드는 예시 값.
 *
 * - 태그: 1~6호기마다 퀜칭로 1~5존 PV, 퀜칭로 3존 SP(점선), 템퍼링로 1~3존 PV, CP PV, RX 가스 유량, C3H8 유량
 * - 승온 구간을 보여준다: 보온(퀜칭로 약 300℃) → 일정 속도로 승온 → 설정값 근처에서 살짝 넘쳤다가 안정
 *   온도가 다 오르면 C3H8를 넣고 CP가 설정값까지 올라온다
 * - 승온 시작 시각(anchor)은 '예시 데이터 보기'를 켠 시각 기준으로 잡아 기본 6시간 화면에 승온~안정이 다 들어오게 한다
 * - 값은 시각(ts)과 anchor만으로 정해지는 함수라, 15초마다 기간이 밀려도 선이 끊기지 않고 이어진다
 * - 잡음은 무작위가 아니라 느린 사인파 몇 개의 합이라 선이 매끈하다
 * 행 모양은 실제 API와 같다: { record_time: 'YYYY-MM-DD HH:mm:ss', [colName]: 값, ... }
 */

const EQUIPS = ['MBF1', 'MBF2', 'MBF3', 'MBF4', 'MBF5', 'MBF6'];
// 설비마다 설정 온도가 조금씩 다르다(패턴 차이)
const Q_SV = { MBF1: 860, MBF2: 850, MBF3: 870, MBF4: 880, MBF5: 845, MBF6: 860 };
const T_SV = { MBF1: 180, MBF2: 175, MBF3: 190, MBF4: 185, MBF5: 170, MBF6: 180 };
const CP_SV = { MBF1: 0.85, MBF2: 0.8, MBF3: 0.9, MBF4: 0.95, MBF5: 0.8, MBF6: 0.85 };

const MIN = 60000;
const HOUR = 60 * MIN;
/** 켠 시각 기준 몇 시간 전에 승온을 시작했다고 볼지 — 6시간 화면에 보온 1시간 + 승온 + 안정이 다 보이게 */
export const DEMO_RAMP_LEAD = 4.8 * HOUR;

const Q_HOLD = 300; // 보온 온도
const T_HOLD = 60;
const Q_RATE = 4.2; // ℃/분 — 퀜칭로 승온 속도
const T_RATE = 1.3;
const APPROACH = 28; // 설정값 이 만큼 아래부터는 천천히 다가가며 살짝 넘친다

function tag(equip, key, trendName, demoDefault) {
  // scale을 채워 둬야 applyValueCorrection이 레거시 보정 없이 값을 그대로 쓴다
  return { tempId: `demo-${equip}-${key}`, colName: `demo_${equip.toLowerCase()}_${key}`, tagName: `${equip} ${trendName}`, trendName, equipId: equip, scale: '*1', enabled: 1, demoDefault };
}

// 켰을 때 처음 선택되는 태그(demoDefault): 퀜칭 1~3존 PV, 템퍼링 1~3존 PV, CP PV, RX 가스 유량
export const DEMO_TAGS = EQUIPS.flatMap((eq) => [
  ...[1, 2, 3, 4, 5].map((z) => tag(eq, `q${z}_pv`, `퀜칭 ${z}존 PV`, z <= 3)),
  tag(eq, 'q3_sp', '퀜칭 3존 SP', false),
  ...[1, 2, 3].map((z) => tag(eq, `t${z}_pv`, `템퍼링 ${z}존 PV`, true)),
  tag(eq, 'cp_pv', 'CP PV', true),
  tag(eq, 'rx_flow', 'RX 가스 유량', true),
  tag(eq, 'c3h8_flow', 'C3H8 유량', false),
]);

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 매끈한 흔들림 — 주기가 다른 사인파 셋의 합(-1~1 근처)
function wobble(ts, salt) {
  const m = ts / MIN;
  return 0.5 * Math.sin(m / 9.3 + salt) + 0.3 * Math.sin(m / 23.7 + salt * 1.7) + 0.2 * Math.sin(m / 61 + salt * 0.6);
}

/**
 * 승온 곡선 — 보온값에서 rate(℃/분)로 오르다가 (sv - APPROACH)부터는 감쇠 진동으로 다가가 살짝 넘쳤다 안정.
 * 반환: { v: 온도, reachedAt: 설정값 근처(−5℃)에 처음 닿는 분 }
 */
function rampCurve(minutes, hold, sv, rate, approach = APPROACH) {
  const linEnd = Math.max(0, (sv - approach - hold) / rate); // 직선 구간 길이(분)
  if (minutes <= 0) return hold;
  if (minutes <= linEnd) return hold + rate * minutes;
  const t2 = minutes - linEnd;
  // 처음 기울기가 직선 구간과 이어지도록 sin 항을 섞는다
  const k = 14; // 감쇠 시간(분)
  const w = 1 / 10; // 진동(라디안/분)
  return sv - approach * Math.exp(-t2 / k) * (Math.cos(t2 * w) - ((rate / approach) - 1 / k) / w * Math.sin(t2 * w));
}

function minutesToReach(hold, sv, rate) {
  return Math.max(0, (sv - APPROACH - hold) / rate) + 18;
}

function valueOf(t, ts, anchor) {
  const eq = t.equipId;
  const eqIdx = EQUIPS.indexOf(eq);
  const salt = hashStr(t.colName) % 97;
  const key = t.colName.split('_').slice(2).join('_');
  // 설비마다 승온 시작이 20분씩 어긋난다
  const start = anchor + eqIdx * 20 * MIN;
  const m = (ts - start) / MIN;
  const zoneNo = Number((key.match(/\d/) || ['3'])[0]);
  const wob = wobble(ts, salt);
  const qReach = minutesToReach(Q_HOLD, Q_SV[eq], Q_RATE);

  if (key.startsWith('q') && key.endsWith('_pv')) {
    // 앞쪽 존은 장입구 쪽이라 조금 늦게·낮게 오른다
    const sv = Q_SV[eq] - (3 - zoneNo) * 3;
    const rate = Q_RATE * (0.9 + zoneNo * 0.04);
    const hold = Q_HOLD - (3 - zoneNo) * 6;
    return +(rampCurve(m - (5 - zoneNo) * 2, hold, sv, rate) + wob * 0.8).toFixed(1);
  }
  if (key === 'q3_sp') {
    // SP는 승온 시작 때 한 번에 설정값으로
    return m < 0 ? Q_HOLD : Q_SV[eq];
  }
  if (key.startsWith('t')) {
    const sv = T_SV[eq] + (zoneNo - 2) * 3;
    return +(rampCurve(m - 10 - zoneNo * 3, T_HOLD + zoneNo * 2, sv, T_RATE, 12) + wob * 0.5).toFixed(1);
  }
  // 가스·CP는 퀜칭로가 설정 온도에 닿은 뒤부터
  const g = m - qReach; // 가스 투입 후 경과(분)
  if (key === 'cp_pv') {
    const base = 0.22;
    const v = g <= 0 ? base : base + (CP_SV[eq] - base) * (1 - Math.exp(-g / 16));
    return +(v + wob * 0.004).toFixed(3);
  }
  if (key === 'rx_flow') {
    // 승온 시작에 0.6 → 1.05로, 가스 투입 뒤 1.35로 — 계단이 아니라 서서히 바뀌게
    const v = m <= 0 ? 0.6 : 0.6 + 0.45 * (1 - Math.exp(-m / 4)) + (g > 0 ? 0.3 * (1 - Math.exp(-g / 6)) : 0);
    return +(v + wob * 0.006).toFixed(3);
  }
  if (key === 'c3h8_flow') {
    const v = g <= 0 ? 0 : 4.2 * (1 - Math.exp(-g / 5));
    return +(v + (g > 0 ? wob * 0.06 : 0)).toFixed(3);
  }
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const parse = (s) => new Date(String(s).replace(' ', 'T')).getTime();

/** from/to: 'YYYY-MM-DD HH:mm:ss', anchor: 1호기 승온 시작(ms) — 기간 길이에 맞춰 점 간격을 잡는다(최대 약 400점) */
export function makeDemoRows(from, to, anchor) {
  const a = parse(from);
  const b = parse(to);
  if (!(b > a)) return [];
  const step = Math.max(MIN, Math.ceil((b - a) / 400 / MIN) * MIN);
  const rows = [];
  for (let ts = Math.ceil(a / step) * step; ts <= b; ts += step) {
    const row = { record_time: fmt(new Date(ts)) };
    DEMO_TAGS.forEach((t) => { row[t.colName] = valueOf(t, ts, anchor); });
    rows.push(row);
  }
  return rows;
}

// 메모에 쓰는 예시 LOT — 제품명·회사명(seq: LOT 일련번호, after: 온도 도달 후 몇 분에 장입)
const DEMO_LOTS = [
  { seq: 2, after: 12, product: '가이드 부시', company: '한일기어' },
];

/**
 * 1호기 기준 메모 — 온도가 다 오른 뒤 LOT 장입(제목 LOT번호, 내용 '제품명 · 회사명')과
 * 화면 오른쪽 끝 근처의 PLC 통신 재연결 메모.
 */
export function makeDemoMemos(from, to, anchor) {
  const a = parse(from);
  const b = parse(to);
  const reach = anchor + minutesToReach(Q_HOLD, Q_SV.MBF1, Q_RATE) * MIN;
  const d = new Date(anchor);
  const ymd = `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const list = DEMO_LOTS.map((lot) => ({
    ts: reach + lot.after * MIN,
    name: `LOT ${ymd}-1${String(lot.seq).padStart(3, '0')} 장입`,
    desc: `${lot.product} · ${lot.company}`,
  }));
  // 켠 시각 38분 전(안정 구간) — 16:04쯤 켜면 15:26
  list.push({ ts: anchor + DEMO_RAMP_LEAD - 38 * MIN, name: '통신 재연결', desc: 'PLC 통신 자동 복구', tone: 'alert' });
  return list
    .filter((m) => m.ts >= a && m.ts <= b)
    .map((m) => ({
      tcCnt: `demo-${m.ts}`,
      tcName: m.name,
      tcDesc: m.desc,
      tcRegtime: fmt(new Date(Math.round(m.ts / MIN) * MIN)),
      tone: m.tone, // 'alert'면 연빨강으로 표시
    }));
}
