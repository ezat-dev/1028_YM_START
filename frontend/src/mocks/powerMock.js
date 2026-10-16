// 전력량 목업 — 설비마다 KDX300 전력량계 1대, 누적 유효전력량(Wh)·무효전력량(varh)을 읽는다고 가정.
// DB 연동 시 api/equipment/powerUsageApi.js의 getPowerSeries()/getMeterLatest()로 바꾸면 된다(형식 동일).
//
// getPowerSeries({ from, to, unit })  — from/to: ms, unit: 'hour' | 'day'
//   → { unit, buckets: [시작 ms...], rows: [{ code, ts, wh, varh }] }
//      wh/varh = 그 구간 사용량(= 구간 끝 누적값 − 구간 시작 누적값). 지금 진행 중인 구간은 지금까지의 값.
// getMeterLatest()
//   → [{ code, name, meterId, whTotal, varhTotal, readAt, status: 'ok' | 'stale' }]
//      whTotal/varhTotal = 계량기 누적값 원본(Wh, varh)

import { FURNACES, seededRandom } from './furnaceMock';

const HOUR = 3600000;

// 설비별 부하 특성(목업) — 평균 유효전력(kW)과 역률
const PROFILE = {
  MBF1: { kw: 214, pf: 0.93 },
  MBF2: { kw: 198, pf: 0.855 }, // 역률이 낮은 예시
  MBF3: { kw: 226, pf: 0.92 },
  MBF4: { kw: 205, pf: 0.9 },
  MBF5: { kw: 188, pf: 0.94 },
  MBF6: { kw: 176, pf: 0.91 },
};
const IDLE_KW = 58;          // 정지(보온) 중 전력
const IDLE_HOURS = 6;        // MBF6는 6시간 전부터 정기 점검
const START_WH = { MBF1: 1284503122, MBF2: 1190744018, MBF3: 1342019877, MBF4: 1218830450, MBF5: 1102397412, MBF6: 1167720903 };
const START_VARH = { MBF1: 498120334, MBF2: 612004871, MBF3: 541227903, MBF4: 560118277, MBF5: 380992114, MBF6: 470551208 };
const ORIGIN = Date.UTC(2026, 0, 1) - 9 * HOUR; // 누적값 기준 시각(2026-01-01 00:00 KST)

const floorHour = (ms) => Math.floor(ms / HOUR) * HOUR;

/** 한 시간 동안의 사용량 — 같은 시각이면 언제 물어봐도 같은 값 */
function hourUsage(def, hourStart, now) {
  const p = PROFILE[def.code];
  const rnd = seededRandom(`${def.code}-${hourStart}`);
  const h = new Date(hourStart).getHours();
  const idle = def.status === 'idle' && hourStart >= floorHour(now) - (IDLE_HOURS - 1) * HOUR;
  // 낮 시간 조금 높고 새벽 조금 낮은 완만한 굴곡 + 잡음
  const shape = 1 + 0.05 * Math.sin(((h - 8) / 24) * Math.PI * 2);
  const kw = idle ? IDLE_KW * (0.95 + rnd() * 0.1) : p.kw * shape * (0.94 + rnd() * 0.1);
  const pf = Math.min(0.99, Math.max(0.78, (idle ? p.pf - 0.06 : p.pf) + (rnd() - 0.5) * 0.03));
  const kvar = kw * Math.tan(Math.acos(pf));
  const frac = Math.min(1, Math.max(0, (now - hourStart) / HOUR)); // 진행 중인 시간은 지금까지 비율만
  return { wh: kw * 1000 * frac, varh: kvar * 1000 * frac };
}

function* hoursBetween(from, to) {
  for (let t = floorHour(from); t < to; t += HOUR) yield t;
}

export function createPowerMock() {
  const delay = (v) => new Promise((resolve) => { setTimeout(() => resolve(v), 120); });

  return {
    getPowerSeries({ from, to, unit = 'hour' }) {
      const now = Date.now();
      const end = Math.min(to, now);
      const buckets = [];
      if (unit === 'hour') {
        for (const t of hoursBetween(from, end)) buckets.push(t);
      } else {
        const d = new Date(from);
        d.setHours(0, 0, 0, 0);
        for (let t = d.getTime(); t < end; ) {
          buckets.push(t);
          const n = new Date(t);
          n.setDate(n.getDate() + 1);
          t = n.getTime();
        }
      }
      const rows = [];
      FURNACES.forEach((def) => {
        buckets.forEach((b, i) => {
          const bEnd = unit === 'hour' ? b + HOUR : (buckets[i + 1] ?? (() => { const n = new Date(b); n.setDate(n.getDate() + 1); return n.getTime(); })());
          let wh = 0;
          let varh = 0;
          for (const t of hoursBetween(Math.max(b, from), Math.min(bEnd, end))) {
            const u = hourUsage(def, t, now);
            wh += u.wh;
            varh += u.varh;
          }
          rows.push({ code: def.code, ts: b, wh: Math.round(wh), varh: Math.round(varh) });
        });
      });
      return delay({ unit, buckets, rows });
    },

    getMeterLatest() {
      const now = Date.now();
      return delay(FURNACES.map((def, i) => {
        // 누적값 = 기준값 + 기준 시각부터 지금까지 사용량 (계산량을 줄이려고 최근 40일만 시간 단위로 더하고 그 앞은 평균으로)
        const recentFrom = floorHour(now) - 40 * 24 * HOUR;
        const p = PROFILE[def.code];
        let wh = START_WH[def.code] + ((recentFrom - ORIGIN) / HOUR) * p.kw * 1000;
        let varh = START_VARH[def.code] + ((recentFrom - ORIGIN) / HOUR) * p.kw * Math.tan(Math.acos(p.pf)) * 1000;
        for (const t of hoursBetween(recentFrom, now)) {
          const u = hourUsage(def, t, now);
          wh += u.wh;
          varh += u.varh;
        }
        return {
          code: def.code,
          name: def.name,
          meterId: `KDX300-${String(i + 1).padStart(2, '0')}`,
          whTotal: Math.round(wh),
          varhTotal: Math.round(varh),
          // 6호기 계량기는 통신이 잠깐 끊긴 예시(마지막 수신 4분 전)
          readAt: def.code === 'MBF6' ? now - 4 * 60000 : now - Math.round(seededRandom(`${def.code}-${Math.floor(now / 60000)}`)() * 20000),
          status: def.code === 'MBF6' ? 'stale' : 'ok',
        };
      }));
    },
  };
}
