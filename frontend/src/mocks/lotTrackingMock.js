// LOT 트래킹 목업 — C# PlcApiServer 캐시가 돌려줄 '트래킹 스냅샷'을 흉내 낸다.
// 화면은 이 객체의 fetchSnapshot()을 주기적으로 부르고, 받은 슬롯 위치대로만 그린다(실데이터와 같은 흐름).
// 실연동 시 api/monitoring/lotTrackingApi.js의 getTrackingSnapshot()으로 바꾸면 된다.
//
// 스냅샷 형식(실서버와 맞출 계약):
// {
//   polledAt: 1760241609000,               // C# 캐시가 PLC를 마지막으로 읽은 시각(ms)
//   furnaces: [{
//     code: 'MBF1', status: 'run' | 'alarm' | 'idle', idleReason?, alarm?: { zone: 'q3', message },
//     moveCount: 1234,                     // 이송 카운터(PLC) — 값이 바뀌면 벨트가 한 피치 이동한 것
//     lastMoveAt: 1760241590000,           // 마지막 이송 시각
//     pitchSec: 45,                        // 평균 이송 주기(초)
//     pattern: { patternCode, partNo, productName }, patternChangedAt,
//     inToday: 120, outToday: 112,
//     slots: ['261012-1023', null, ...],   // 슬롯 0(장입) ~ SLOT_COUNT-1(배출)의 LOT번호
//     lots: { '261012-1023': { lotNo, seqText, company, partNo, productName, patternCode, enterAt, alarmPass } },
//   }],
// }

import { FURNACES } from './furnaceMock';
import { STAGES, SLOT_COUNT } from '../constants/furnaceLayout';

const rand = (a, b) => a + Math.random() * (b - a);
const pad = (n, l = 2) => String(n).padStart(l, '0');

// 목업 이송 주기 — 실제 설비(수 분 간격)보다 짧게 잡아 화면에서 이송을 볼 수 있게 했다
const PITCH_MIN_MS = 38000;
const PITCH_MAX_MS = 58000;
// 장입 방식 — 같은 제품 4개를 연달아 넣고, 3~4칸 비운 뒤 다음 묶음
const BATCH_SIZE = 4;
const GAP_MIN = 3;
const GAP_MAX = 4;
const PATTERN_CHANGE_CHANCE = 0.3;   // 묶음이 끝날 때마다 이 확률로 다음 제품으로

const DATE_TAG = (() => {
  const d = new Date();
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
})();

export function createLotTrackingMock(patterns) {
  const t0 = Date.now();

  const furnaces = FURNACES.map((def, i) => {
    const pitchMs = Math.round(rand(PITCH_MIN_MS, PITCH_MAX_MS));
    const f = {
      def,
      no: i + 1,
      pitchMs,
      // 다음 이송까지 남은 비율 — 로마다 달라서 6대가 한꺼번에 움직이지 않는다
      firstMoveAt: t0 + rand(0.12, 0.9) * pitchMs,
      moveCount: Math.round(rand(800, 2400)),
      lastMoveAt: 0,
      seq: Math.round(rand(20, 45)),
      pattern: patterns[i % patterns.length],
      patternChangedAt: 0,
      // 장입기 상태: 'lot'이면 left개 더 넣고, 'gap'이면 left칸 비운다
      feed: { mode: 'lot', left: 0 },
      slots: new Array(SLOT_COUNT).fill(null),
      lots: new Map(),
      inToday: 0,
      outToday: Math.round(rand(24, 46)),
      alarmStage: def.alarm ? STAGES.find((s) => s.key === def.alarm.zone) : null,
      stepsDone: 0,
    };
    f.lastMoveAt = f.firstMoveAt - pitchMs;
    f.alarmSince = t0 - pitchMs * 4; // 알람은 화면을 열기 조금 전(이송 4번 전)부터 진행 중

    if (def.status !== 'idle') {
      // 벨트 위 초기 상태 — 장입기를 배출 쪽(오래된 칸)부터 SLOT_COUNT번 돌려 채운다.
      // 슬롯 k의 트레이는 k번 이송 전에 장입됐다. 시작 위치를 묶음 중간 아무 데서나 잡는다.
      const phase = Math.floor(rand(0, BATCH_SIZE + GAP_MAX));
      f.feed = phase < BATCH_SIZE
        ? { mode: 'lot', left: BATCH_SIZE - phase }
        : { mode: 'gap', left: BATCH_SIZE + GAP_MAX - phase };
      f.pattern = patterns[(i + 1) % patterns.length]; // 배출 쪽은 이전 제품으로 시작
      for (let k = SLOT_COUNT - 1; k >= 0; k -= 1) {
        f.slots[k] = feedNext(f, f.lastMoveAt - k * pitchMs);
      }
      f.patternChangedAt = 0; // 화면을 열기 전의 제품 교체는 강조하지 않는다
      f.inToday = f.outToday + f.slots.filter(Boolean).length;
    } else {
      f.inToday = f.outToday;
    }
    return f;
  });

  // 장입기 한 번 — 이번 이송에 장입 칸으로 들어올 LOT번호(또는 빈칸 null)
  function feedNext(f, at) {
    if (f.feed.left <= 0) {
      if (f.feed.mode === 'lot') {
        f.feed = { mode: 'gap', left: Math.round(rand(GAP_MIN, GAP_MAX)) };
      } else {
        // 빈칸이 끝나고 새 묶음 시작 — 이때만 제품이 바뀐다
        if (patterns.length > 1 && Math.random() < PATTERN_CHANGE_CHANCE) {
          const others = patterns.filter((x) => x.patternCode !== f.pattern.patternCode);
          f.pattern = others[Math.floor(Math.random() * others.length)];
          f.patternChangedAt = at;
        }
        f.feed = { mode: 'lot', left: BATCH_SIZE };
      }
    }
    f.feed.left -= 1;
    return f.feed.mode === 'lot' ? addLot(f, f.pattern, at) : null;
  }

  function addLot(f, pattern, enterAt) {
    f.seq += 1;
    const seqText = `${f.no}${pad(f.seq % 1000, 3)}`;
    const lotNo = `${DATE_TAG}-${seqText}`;
    f.lots.set(lotNo, {
      lotNo,
      seqText,
      company: pattern.company,
      partNo: pattern.partNo,
      productName: pattern.productName,
      patternCode: pattern.patternCode,
      enterAt,
    });
    return lotNo;
  }

  // 지금 시각까지 일어났어야 할 이송을 모두 처리 — 화면이 늦게 물어봐도(탭이 숨겨졌다 돌아와도) 위치가 맞는다
  function advance(f, now) {
    if (f.def.status === 'idle') return;
    while (f.firstMoveAt + f.stepsDone * f.pitchMs <= now) {
      const at = f.firstMoveAt + f.stepsDone * f.pitchMs;
      f.stepsDone += 1;
      f.moveCount += 1;
      f.lastMoveAt = at;

      const out = f.slots[SLOT_COUNT - 1];
      if (out) {
        f.lots.delete(out);
        f.outToday += 1;
      }
      const fresh = feedNext(f, at);
      if (fresh) f.inToday += 1;
      f.slots = [fresh, ...f.slots.slice(0, -1)];
    }
  }

  // 알람 중에 알람 존을 지났거나 지나는 중인 LOT (실서버에서는 MES가 알람 이력으로 판정해 내려줄 값)
  function alarmPass(f, lot, slot) {
    const st = f.alarmStage;
    if (!st || slot < st.firstSlot) return false;
    const leftZoneAt = lot.enterAt + (st.lastSlot + 1) * f.pitchMs;
    return slot <= st.lastSlot || leftZoneAt >= f.alarmSince;
  }

  return {
    fetchSnapshot() {
      const now = Date.now();
      furnaces.forEach((f) => advance(f, now));
      const snapshot = {
        polledAt: now,
        furnaces: furnaces.map((f) => {
          const lots = {};
          f.slots.forEach((lotNo, slot) => {
            if (lotNo) lots[lotNo] = { ...f.lots.get(lotNo), alarmPass: alarmPass(f, f.lots.get(lotNo), slot) };
          });
          return {
            code: f.def.code,
            name: f.def.name,
            status: f.def.status,
            idleReason: f.def.idleReason,
            alarm: f.def.alarm,
            moveCount: f.moveCount,
            lastMoveAt: f.def.status === 'idle' ? null : f.lastMoveAt,
            pitchSec: Math.round(f.pitchMs / 1000),
            pattern: f.pattern,
            patternChangedAt: f.patternChangedAt,
            inToday: f.inToday,
            outToday: f.outToday,
            slots: [...f.slots],
            lots,
          };
        }),
      };
      // 네트워크 왕복처럼 약간 늦게 돌려준다
      return new Promise((resolve) => { setTimeout(() => resolve(snapshot), 60); });
    },
  };
}
