// LOT 현황 목업 — 설비별 작업 LOT 타임라인을 만들어 '현재 현황'과 '과거 이력' 두 화면에 같은 데이터를 준다.
// DB 연동 시 api/monitoring/lotStatusApi.js의 getLotStatus()/getLotHistory()로 바꾸면 된다(형식 동일).
//
// LOT 한 건 형식(현황·이력 공통):
// {
//   code: 'BCF1', lotNo: '261012-1043', company, partNo, productName, patternCode, patternName,
//   trayCount: 4, qty: 1200, weightKg: 2400,
//   startAt: ms(첫 트레이 장입), endAt: ms(마지막 트레이 배출) | null(진행 중), expectedEndAt: ms,
//   progress: 0~1,
//   zoneFrom, zoneTo: 진행 중일 때 이 LOT 트레이들이 차지한 구간 번호(0~13, constants/furnaceLayout STAGES 순서)
//                     — 실데이터에서는 PLC 트래킹 테이블에서 이 LOT번호가 있는 칸의 처음·끝
//   result: 'run' | 'ok' | 'check', note: '퀜칭로 3존 온도 상한 초과' (품질 확인 사유),
//   sp: { q: [5], t: [5], cp, qs, ts, unit },
// }
// 현황: { updatedAt, furnaces: [{ code, name, status, idleReason, alarm,
//          running: LOT[](로 안에 있는 LOT, 배출에 가까운 순 — 동시에 2건 이상일 수 있다),
//          previous: LOT[](완료된 LOT, 최근 순, 최대 3건), today }] }

import { FURNACES, seededRandom } from './furnaceMock';
import { SLOT_COUNT, STAGES } from '../constants/furnaceLayout';

const MIN = 60000;
const BATCH = 4;                 // LOT 하나 = 트레이 4개 → 로 안에서 연속된 4개 구간을 차지한다
const RUN_PITCHES = SLOT_COUNT + BATCH - 1; // 첫 트레이 장입 ~ 마지막 트레이 배출까지 이송 횟수
const PITCH_MIN = [11, 14];      // 이송 주기(분) — 설비마다 이 범위에서 정해진다
const HISTORY_DAYS = 62;         // 이력은 최근 두 달까지 만들어 둔다
const PAST_CHECK_CHANCE = 0.03;  // 지난 LOT 중 품질 확인 비율
const PREV_SHOW = 3;             // 현황 카드의 직전 LOT 개수
const PAST_NOTES = ['CP 하한 이탈', '오일조 온도 하한', '벨트 속도 편차', '템퍼링로 2존 온도 편차'];
// 화면 예시: 앞 LOT가 다 빠지기 전에 다음 LOT를 넣는 설비 — 값은 LOT 사이 빈칸(피치) 범위.
//  빈칸 5~6 → 장입 간격 9~10피치 → 로 안에 최대 2건 (예시는 설비당 최대 2건)
//  (화면은 3건까지 보여줄 수 있다 — 빈칸을 1~2로 주면 3건 예시가 된다)
// 나머지는 앞 LOT가 다 빠진 뒤 다음 LOT를 넣는다(1건씩).
const CONCURRENT = { BCF3: [5, 6], BCF5: [5, 6] };

const pad = (n, l = 2) => String(n).padStart(l, '0');
const dateTag = (ms) => {
  const d = new Date(ms);
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};
const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function spOf(p) {
  return { q: p.q, t: p.t, cp: p.cp, qs: p.qs, ts: p.ts, unit: p.unit };
}

/**
 * 설비 하나의 LOT 타임라인 — 시작 시각을 고정해 두고 같은 씨앗으로 만들기 때문에 새로고침해도 같은 이력이 나온다.
 * 트레이는 이송 한 번에 한 칸씩 들어가므로 LOT(트레이 4개)는 첫 트레이 장입부터 마지막 트레이 배출까지 17피치가 걸린다.
 */
function buildTimeline(def, idx, patterns, origin, now) {
  const rnd = seededRandom(`${def.code}-lot-${origin}`);
  const r = (a, b) => a + rnd() * (b - a);
  const pitch = Math.round(r(PITCH_MIN[0], PITCH_MIN[1]) * 10) / 10 * MIN;
  const duration = RUN_PITCHES * pitch;
  const concurrent = CONCURRENT[def.code];
  const idleSince = def.status === 'idle' ? now - 6 * 60 * MIN : Infinity;
  const alarmSince = def.status === 'alarm' ? now - 60 * MIN : Infinity; // 알람은 1시간 전부터 진행 중
  const alarmStage = def.alarm ? STAGES.findIndex((s) => s.key === def.alarm.zone) : -1;

  const lots = [];
  let t = origin + r(0, 6) * pitch;
  let pattern = patterns[idx % patterns.length];
  let batchLeft = Math.round(r(2, 5));
  let seqDay = '';
  let seq = 0;

  while (t <= now && t < idleSince) {
    if (batchLeft <= 0) {
      pattern = patterns[Math.floor(rnd() * patterns.length)];
      batchLeft = Math.round(r(2, 5));
    }
    batchLeft -= 1;

    const day = dateTag(t);
    if (day !== seqDay) { seqDay = day; seq = 0; }
    seq += 1;

    const startAt = Math.round(t);
    const expectedEndAt = Math.round(startAt + duration);
    const done = expectedEndAt <= now;
    const perTray = Math.round(r(240, 360) / 10) * 10;
    const chargeKg = pattern.charge ?? 450;

    let result = done ? 'ok' : 'run';
    let note = null;
    // 지금 진행 중인 알람: 이 LOT 트레이가 알람 존에 머문 시간([첫 트레이 진입, 마지막 트레이 이탈])이 알람과 겹치면 품질 확인
    if (alarmStage >= 0) {
      const inAt = startAt + alarmStage * pitch;
      const outAt = startAt + (alarmStage + BATCH) * pitch;
      if (outAt >= alarmSince && inAt <= now) { result = done ? 'check' : 'run'; note = def.alarm.message; }
    }
    if (done && !note && rnd() < PAST_CHECK_CHANCE) {
      result = 'check';
      note = PAST_NOTES[Math.floor(rnd() * PAST_NOTES.length)];
    }

    lots.push({
      code: def.code,
      lotNo: `${day}-${idx + 1}${pad(seq, 3)}`,
      company: pattern.company,
      partNo: pattern.partNo,
      productName: pattern.productName,
      patternCode: pattern.patternCode,
      patternName: pattern.patternName,
      trayCount: BATCH,
      qty: perTray * BATCH,
      weightKg: chargeKg * BATCH,
      startAt,
      endAt: done ? expectedEndAt : null,
      expectedEndAt,
      pitchMs: pitch,
      result,
      note,
      sp: spOf(pattern),
    });
    // 다음 LOT 장입 — 동시 진행 설비는 트레이 4개 + 빈칸 뒤, 아니면 앞 LOT가 다 빠진 뒤(0~1피치 쉬고)
    t += (concurrent ? BATCH + Math.round(r(concurrent[0], concurrent[1])) : RUN_PITCHES + Math.round(r(0, 1))) * pitch;
  }
  return lots;
}

/** 진행 중 LOT에 '지금' 기준 진행률과 차지한 구간을 붙인다 */
function withProgress(lot, now) {
  if (!lot) return null;
  if (lot.endAt) return { ...lot, progress: 1, zoneFrom: null, zoneTo: null };
  const passed = Math.floor((now - lot.startAt) / lot.pitchMs); // 지금까지 이송 횟수 = 첫 트레이 위치
  return {
    ...lot,
    progress: Math.min(0.999, (now - lot.startAt) / (lot.expectedEndAt - lot.startAt)),
    zoneTo: Math.min(SLOT_COUNT - 1, passed),
    zoneFrom: Math.max(0, passed - (lot.trayCount - 1)),
  };
}

export function createLotStatusMock(patterns) {
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const origin = today0.getTime() - HISTORY_DAYS * 24 * 60 * MIN;
  let cache = { at: 0, lines: null };

  // 현재 시각까지의 타임라인 — 30초 안에 다시 물으면 다시 만들지 않는다
  function lines(now) {
    if (cache.lines && now - cache.at < 30000) {
      // 그 사이 끝난 LOT만 완료로 바꿔 준다
      cache.lines.forEach((ls) => ls.forEach((l) => {
        if (!l.endAt && l.expectedEndAt <= now) {
          l.endAt = l.expectedEndAt;
          if (l.result === 'run') l.result = l.note ? 'check' : 'ok';
        }
      }));
      return cache.lines;
    }
    cache = { at: now, lines: FURNACES.map((def, i) => buildTimeline(def, i, patterns, origin, now)) };
    return cache.lines;
  }

  const delay = (v) => new Promise((resolve) => { setTimeout(() => resolve(v), 120); });

  return {
    getLotStatus() {
      const now = Date.now();
      const all = lines(now);
      return delay({
        updatedAt: now,
        furnaces: FURNACES.map((def, i) => {
          const ls = all[i];
          const running = ls.filter((l) => !l.endAt);           // 오래된 것(배출 쪽)부터
          const done = ls.filter((l) => l.endAt);
          return {
            code: def.code,
            name: def.name,
            status: def.status,
            idleReason: def.idleReason,
            alarm: def.alarm,
            running: running.map((l) => withProgress(l, now)),
            previous: done.slice(-PREV_SHOW).reverse().map((l) => withProgress(l, now)),
            today: summarizeToday(ls, now),
          };
        }),
      });
    },

    /** params: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', code, result, keyword } — 완료된 LOT만, 최근 완료 순 */
    getLotHistory({ from, to, code, result, keyword } = {}) {
      const now = Date.now();
      const kw = (keyword ?? '').trim().toLowerCase();
      const rows = lines(now).flat().filter((l) => {
        if (!l.endAt) return false;
        const d = dayKey(l.endAt);
        if (from && d < from) return false;
        if (to && d > to) return false;
        if (code && l.code !== code) return false;
        if (result && l.result !== result) return false;
        if (kw && ![l.lotNo, l.partNo, l.productName, l.company, l.patternCode].some((v) => (v ?? '').toLowerCase().includes(kw))) return false;
        return true;
      });
      rows.sort((a, b) => b.endAt - a.endAt);
      return delay(rows.map((l) => ({ ...l })));
    },
  };
}

function summarizeToday(lots, now) {
  const d0 = new Date(now);
  d0.setHours(0, 0, 0, 0);
  const done = lots.filter((l) => l.endAt && l.endAt >= d0.getTime());
  return {
    doneCount: done.length,
    weightKg: done.reduce((a, l) => a + l.weightKg, 0),
    checkCount: done.filter((l) => l.result === 'check').length,
  };
}
