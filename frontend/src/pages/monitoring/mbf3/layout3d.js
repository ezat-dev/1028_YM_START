import { LAMPS } from '../mbf1/mbf1Layout';

/*
 * MBF3호기 3D 배치 — 설비 구성 · 램프는 MBF1 · 2와 같다(mbf1Layout). 2D 그림의 가로 자리(0~1800)를 3D 라인(X -30 ~ 30)으로 옮긴다.
 * 좌표: X = 라인 방향, Y = 위, Z = 앞(+). 설비 앞면은 대략 Z +1.1 ~ +1.3.
 */

export const sx = (x2d) => -30 + (x2d / 1800) * 60;

// 지하 구덩이 깊이 — 전세정기 · 유조 · 중간세정기는 바닥 아래로 이만큼 묻혀 있다(현장처럼)
export const PIT = 1.0;

// 설비 자리 — 이름 붙은 숫자로 모아 두어 그림 · 제품 흐름 · 램프가 같은 자리를 본다
export const EQ = {
  hoist: { x: -31.2, top: 4.9, rise: 2.6 }, // top: 머리 보 높이(기울인 철통 모서리 ≈4.7이 닿지 않게), rise: 철통이 올라가는 높이
  hopper: { x: -28.5, top: 2.65, out: 1.95 }, // 승강기 옆 받는 호퍼 — 배출 목이 투입 컨베이어 벨트 바로 위
  conv: { x0: -28.95, x1: -24.85, y: 1.45 }, // 투입 컨베이어 — 호퍼 아래 → 머리가 진동 피더 아래 끝(받는 쪽) 위 0.25쯤
  feeder: { x0: -25.0, y0: 1.05, x1: -22.3, y1: 2.9 }, // 경사 진동 피더 — 아래 끝(컨베이어 머리 바로 아래 높이) → 위 끝
  fwash: { x0: -22.0, x1: -17.6, outX: -16.7, outY: 1.95 }, // outY: 배출 컨베이어 끝 — 로 장입 벨트 바로 위(완만하게)
  quench: { charge: -17.35, x0: -15.6, x1: -7.8, zones: 4 },
  oil: { x0: -6.9, x1: -1.2, conv: [-4.0, 0.55 - PIT], top: [0.0, 3.2] },
  sep: { x0: 0.0, x1: 4.2, y: 3.2 },
  mwash: { x0: 4.6, x1: 9.0, outX: 10.2, outY: 1.95 },
  temper: { charge: 9.4, x0: 11.4, x1: 23.4, zones: 5 },
  rust: { x0: 24.6, x1: 27.0, outX: 28.4, outY: 1.4, convY: 0.82, h: 1.0 }, // 낮은 탱크(h) — 배출 컨베이어가 끝 벽 위로 완만하게(액면 바로 아래 → 제품 상자 위)
  bin: { x: 28.9 },
};

export const BELT_Y = 1.6; // 로 메시 벨트 높이

// 경사 피더 위 높이(바닥 면)
export const feedY = (x) => EQ.feeder.y0 + ((x - EQ.feeder.x0) / (EQ.feeder.x1 - EQ.feeder.x0)) * (EQ.feeder.y1 - EQ.feeder.y0);

// 위에 올라간 철통 입구(기울기 축) 높이
export const LIP_Y = 0.2 + EQ.hoist.rise + 1.0;

/*
 * 구간 연결 슈트 — [시작, 끝]. 곧은 홈통이고, 앞 설비에서 넘어가는 머리 모서리만 살짝 둥글다(chuteCurve).
 * 설비 그림(Chute)과 제품 흐름이 같은 선을 쓴다
 */
export const CHUTES = {
  hoist: [[EQ.hoist.x + 0.85, LIP_Y - 0.4], [EQ.hopper.x - 0.35, EQ.hopper.top + 0.12]],
  feeder: [[EQ.feeder.x1 + 0.05, EQ.feeder.y1 - 0.05], [EQ.fwash.x0 + 0.6, 0.62]], // 끝은 세정기 덮개 투입구 위
  quench: [[EQ.quench.x1 + 0.05, BELT_Y + 0.05], [EQ.oil.x0 + 0.8, 1.57 - PIT]],
  sep: [[EQ.sep.x1 + 0.05, EQ.sep.y], [EQ.mwash.x0 + 0.7, 1.62 - PIT]],
};

// 바닥 구덩이 — [x0, x1, 반폭(Z)]
export const PITS = [
  { x0: -22.0 - 0.35, x1: -17.6 + 0.35, hz: 1.45 },
  { x0: -6.9 - 0.35, x1: -1.2 + 0.35, hz: 1.65 },
  { x0: 4.6 - 0.35, x1: 9.0 + 0.35, hz: 1.45 },
];
export const VEST = 0.6; // 입구 · 출구 전실 폭

// 위 줄 램프 높이 — 구간마다 설비 꼭대기 위
const TOP_Y = { skip: 5.5, feeder: 4.5, fwash: 3.7, quench: 5.9, oil: 4.4, sep: 4.6, mwash: 3.7, temper: 5.9, rust: 3.7 };

// 3D에서 2D 자리보다 옮긴 구간(재료 투입은 승강기를 왼쪽으로 비켜 투입 컨베이어 자리를 냄) — 램프 · 구간 이름도 같이 옮긴다
export const ZONE_DX = { skip: -3.5 };

/** 램프 기본 자리(3D) — 위 줄은 설비 위, 아래 줄은 설비 앞 바닥 */
function basePos(l) {
  const x = sx(l.x) + (ZONE_DX[l.zone] ?? 0);
  return l.row === 'top' ? [x, TOP_Y[l.zone] ?? 4.5, -0.2] : [x, 0.05, 2.7];
}

/*
 * 램프 간격 넓히기 — 같은 줄 · 비슷한 높이(LAMP_DY 안)끼리 LAMP_GAP보다 가까우면 서로 밀어 벌린다(되풀이).
 * 자기 설비에서 LAMP_SHIFT 넘게는 안 밀려 어느 설비 램프인지 그대로 보인다. 처음 한 번만 계산
 */
const LAMP_GAP = 2.4; // 기본 시점에서 약 60px — 이름표(두 줄)끼리 안 붙게
const LAMP_SHIFT = 1.3;
const LAMP_DY = 1.4;
const LAMP_POS = (() => {
  const out = new Map();
  ['top', 'bottom'].forEach((row) => {
    const items = LAMPS.filter((l) => l.row === row)
      .map((l) => { const p = basePos(l); return { id: l.id, p, x0: p[0], x: p[0] }; })
      .sort((a, b) => a.x0 - b.x0);
    for (let it = 0; it < 80; it += 1) {
      let moved = false;
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = items[i];
          const b = items[j];
          const d = b.x - a.x;
          if (Math.abs(a.p[1] - b.p[1]) < LAMP_DY && d < LAMP_GAP - 1e-6) {
            const push = (LAMP_GAP - d) / 2;
            a.x -= push;
            b.x += push;
            moved = true;
          }
        }
      }
      items.forEach((q) => { q.x = Math.min(q.x0 + LAMP_SHIFT, Math.max(q.x0 - LAMP_SHIFT, q.x)); });
      if (!moved) break;
    }
    items.forEach((q) => out.set(q.id, [q.x, q.p[1], q.p[2]]));
  });
  return out;
})();

/** 램프 자리(3D) — 기본 자리에서 이웃과 간격을 벌린 자리 */
export function lampPos(l) {
  return LAMP_POS.get(l.id) ?? basePos(l);
}
export { LAMPS };
