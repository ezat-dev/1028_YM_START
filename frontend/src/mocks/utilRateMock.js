// 설비가동률 목업 — 설비별 하루 상태 구간(가동/계획정지/고장정지/대기)을 만들어 가동률·비가동 사유·타임라인에 같이 쓴다.
// DB 연동 시 api/equipment/utilRateApi.js의 getUtilDays()로 바꾸면 된다(형식 동일).
//
// getUtilDays({ from, to }) — from/to: 'YYYY-MM-DD'(포함)
//   → [{ code, date: 'YYYY-MM-DD', dayStart: ms, span: 분(그날 지난 시간, 오늘은 지금까지),
//        run, plan, fail, wait: 분,
//        stops: [{ type: 'plan' | 'fail' | 'wait', cause: '정기 점검', start: ms, end: ms }] }]
//   가동률 = run / span

import { FURNACES, seededRandom } from './furnaceMock';

const MIN = 60000;
const DAY_MIN = 24 * 60;

export const STOP_CAUSES = {
  plan: ['정기 점검', '패턴 교체', '청소·정비'],
  fail: ['벨트 이상', '버너 점화 불량', '온도 이상', '컨베이어 정지'],
  wait: ['자재 대기', '작업자 대기'],
};

// 설비별 성향(목업) — 정지 횟수 범위와 고장 비율
const PROFILE = {
  BCF1: { stops: [0, 2], failBias: 0.2 },
  BCF2: { stops: [1, 3], failBias: 0.3 },
  BCF3: { stops: [0, 2], failBias: 0.25 },
  BCF4: { stops: [1, 4], failBias: 0.55 }, // 고장이 잦은 예시
  BCF5: { stops: [0, 1], failBias: 0.15 },
  BCF6: { stops: [1, 3], failBias: 0.3 },
};
const DURATION = { plan: [30, 140], fail: [12, 95], wait: [10, 55] };

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function buildDay(def, dayStart, now) {
  const rnd = seededRandom(`${def.code}-util-${dayStart}`);
  const r = (a, b) => a + rnd() * (b - a);
  const p = PROFILE[def.code];
  const span = Math.min(DAY_MIN, Math.max(0, Math.floor((now - dayStart) / MIN)));
  const stops = [];

  const n = Math.round(r(p.stops[0], p.stops[1]));
  for (let k = 0; k < n; k += 1) {
    const x = rnd();
    const type = x < p.failBias ? 'fail' : x < p.failBias + (1 - p.failBias) * 0.6 ? 'plan' : 'wait';
    const dur = Math.round(r(DURATION[type][0], DURATION[type][1]));
    const start = Math.round(r(20, DAY_MIN - dur - 20));
    stops.push({ type, cause: STOP_CAUSES[type][Math.floor(rnd() * STOP_CAUSES[type].length)], s: start, e: start + dur });
  }

  // 오늘: 정지 설비(BCF6)는 6시간 전부터 정기 점검, 알람 설비(BCF4)는 25분 전부터 고장 정지 진행 중
  const isToday = now - dayStart < DAY_MIN * MIN;
  if (isToday) {
    const nowMin = span;
    if (def.status === 'idle') stops.push({ type: 'plan', cause: '정기 점검', s: Math.max(0, nowMin - 360), e: nowMin });
    if (def.status === 'alarm') stops.push({ type: 'fail', cause: '온도 이상', s: Math.max(0, nowMin - 25), e: nowMin });
  }

  // 겹치는 구간 정리 + 지금 이후 잘라내기
  stops.sort((a, b) => a.s - b.s);
  const clean = [];
  stops.forEach((st) => {
    const s = Math.max(st.s, clean.length ? clean[clean.length - 1].e : 0);
    const e = Math.min(st.e, span);
    if (e - s >= 3) clean.push({ ...st, s, e });
  });

  const sum = (t) => clean.filter((x) => x.type === t).reduce((a, x) => a + (x.e - x.s), 0);
  const plan = sum('plan');
  const fail = sum('fail');
  const wait = sum('wait');
  return {
    code: def.code,
    date: ymd(new Date(dayStart)),
    dayStart,
    span,
    run: Math.max(0, span - plan - fail - wait),
    plan,
    fail,
    wait,
    stops: clean.map((x) => ({ type: x.type, cause: x.cause, start: dayStart + x.s * MIN, end: dayStart + x.e * MIN })),
  };
}

export function createUtilMock() {
  const delay = (v) => new Promise((resolve) => { setTimeout(() => resolve(v), 120); });
  return {
    getUtilDays({ from, to }) {
      const now = Date.now();
      const rows = [];
      const d = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`).getTime();
      for (; d.getTime() <= end && d.getTime() <= now; d.setDate(d.getDate() + 1)) {
        const dayStart = d.getTime();
        FURNACES.forEach((def) => rows.push(buildDay(def, dayStart, now)));
      }
      return delay(rows);
    },
  };
}
