import { useEffect, useMemo, useRef, useState } from 'react';
import { LAMPS, ZONES, VIEW_W, VIEW_H } from '../mbf1/mbf1Layout';
import { SHOW_WEIGHT, WEIGH_STATE } from '../integrated/charge';
import { STATE_LABEL, iconOf } from '../integrated/lampIcons';
import '../mbf1/mbf1.css';
import './mbf2.css';

/*
 * MBF2호기 설비 그림 — 2.5D(아이소메트릭 느낌) 입체 도면. 설비 구성 · 램프 배치는 MBF1과 같다(mbf1Layout).
 *  - 앞면은 MBF1과 같은 자리, 거기에 윗면 · 오른쪽 옆면을 비스듬히(ISO 방향) 붙여 깊이를 준다. 면마다 밝기를 달리(윗면 밝게 · 옆면 어둡게)
 *  - 로: 구조 기둥 + 패널 몸체 + 지붕 슬래브 · 난간. 앞면 가운데를 잘라 내부(내화 벽돌 · 열기 · 메시 벨트 위 부품 · RC FAN 임펠러)를 보여 주고,
 *    위 띠에 존별 디지털 온도, 아래 띠에 버너 헤드 · 가스 매니폴드. 지붕 열전대 · RC FAN 모터
 *  - 구간 잇기: 승강기 → 호퍼 → 경사 벨트 → 슈트 → 전세정기 → 적재대(메시 벨트) → 소입로 → 닫힌 소입 슈트 → 유조 → … → 방청조 → 제품 상자
 *  - 탱크: 앞면 유리 단면 — 액체 부피 + 액면(윗면), 펌프 운전 중이면 액면에 잔물결
 *  - 컨베이어: 벨트 윗면 + 프레임 두께 + 끝 롤러, 진동 피더는 벨트 위 트레이가 비스듬히 올라간다
 * state: { [램프 id]: 'run' | 'stop' | 'alarm' }, temps: { quench: [존별 ℃], temper: [존별 ℃] } — 로 앞면 온도 표시,
 * charge: { phase, weight } — 재료 투입 단계(CHARGE_PHASES)와 철통 무게(kg, 무게 신호). 단계마다 철통이 들어오고 · 계량하고 · 올라가 붓고 · 나간다
 */

const LAMP_Y = { top: 62, bottom: 276 };
const FLOOR_Y = 252;
const ISO = { x: 0.82, y: -0.48 }; // 깊이 1당 화면에서 오른쪽 위로 이만큼
const zoneOf = new Map(ZONES.map((z) => [z.key, z]));
const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const off = (d) => [d * ISO.x, d * ISO.y];
const P = (arr) => arr.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');

/*
 * 제품 흐름 — 재료 투입은 승강기 버킷이 위에서 호퍼로 우수수 붓고(HoistDump), 진동 피더가 트레이마다 조금씩 나눠 올린다.
 * 호퍼 배출구부터 끝(제품 상자)까지는 LOT 단위 — 한 LOT = 5덩어리가 붙어서(진동 피더 경사를 트레이와 함께 올라감), LOT 사이는 넓게 띄워 흘러간다.
 * 점은 각 장비 윗면의 깊이 가운데. 속도는 일정(FLOW_SPEED, viewBox 단위/초). 라인 이송 중일 때만
 * 점의 세 번째 값이 false면 앞 점 → 이 점 구간은 장비 속(로 벽 · 닫힌 슈트 · 제품 상자)이라 부품을 숨긴다.
 * 네 번째 값은 그 구간 속도 배수 — 슈트 · 물/기름 속으로 떨어지는 구간은 빠르게(FALL), 로 안은 천천히(SLOW)
 */
const mid = (x, y, d, show = true, speed = 1) => [x + off(d / 2)[0], y + off(d / 2)[1], show, speed];
const mark = (pt, name) => Object.assign(pt, { mark: name }); // 제품 색 바뀌는 시점 이름
const FALL = 3.2; // 떨어짐 · 슈트 속도 배수
const SLOW = 0.55; // 로 안(열처리) 속도 배수
const FEED = 0.5; // 진동 피더 경사 — 트레이 이동 속도(한 칸 / 1.6초)에 맞춤
const FLOW_PTS = [
  [139, 226], //                                 호퍼 배출구 — 여기서 LOT로 나와
  mid(146, 242, 14, true, FALL), mid(206, 152, 14, true, FEED), // 진동 피더 경사를 트레이와 같은 속도로 올라감
  mid(210, 154, 12, true, FALL), mid(246, 184, 12, true, FALL), // 전세정기로 슈트
  mid(244, 238, 13, true, FALL), mid(390, 174, 13), //  물속으로 떨어짐 → 전세정기 컨베이어
  mid(392, 178, 12, true, FALL), mid(386, 202, 12, true, FALL), // 적재대로
  mid(386, 205, 22), mid(402, 205, 22), //       메시 벨트 적재대
  mark([431, 192, false], 'qIn'), mark([661, 192, true, SLOW], 'qOut'), //  전실 · 로 벽 속 → 소입로 안(단면 벨트, 천천히)
  [684, 186, false], mark([738, 222, false, FALL], 'oilIn'), // 로 옆면 → 닫힌 소입 슈트 속 → 기름 속으로
  mid(776, 240, 13, true, FALL), mark(mid(900, 164, 13), 'oilOut'), // 기름 속 → 유조 컨베이어
  mid(1002, 164, 13), //                         유절 컨베이어
  mid(1004, 168, 12, true, FALL), mid(1054, 192, 12, true, FALL), // 중간세정기로 슈트
  mark(mid(1052, 238, 13, true, FALL), 'mwIn'), mark(mid(1192, 180, 13), 'mwOut'), // 물속 → 중간세정기 컨베이어
  mid(1194, 184, 12, true, FALL), mid(1188, 202, 12, true, FALL), // 적재대로
  mid(1188, 205, 22), mid(1204, 205, 22), //     메시 벨트 적재대
  mark([1233, 192, false], 'tIn'), mark([1591, 192, true, SLOW], 'tOut'), // 전실 · 로 벽 속 → 소려로 안(단면 벨트, 천천히)
  mid(1600, 204, 20, false), mid(1660, 224, 20, true, FALL), // 로 벽 속 → 방청조로 슈트
  mark(mid(1660, 242, 13, true, FALL), 'rsIn'), mark(mid(1770, 198, 13), 'rsOut'), // 방청조 속 → 방청조 컨베이어
  [1777, 214, true, FALL], [1777, 224, false, FALL], // 제품 상자로 떨어짐(상자 속)
];
const FLOW_D = FLOW_PTS.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)} ${b.toFixed(1)}`).join(' ');
const FLOW_SEG = FLOW_PTS.slice(1).map(([a, b, show, speed], i) => {
  const len = Math.hypot(a - FLOW_PTS[i][0], b - FLOW_PTS[i][1]);
  return { len, show: show !== false, time: len / (speed ?? 1) };
});
const FLOW_LEN = FLOW_SEG.reduce((n, g) => n + g.len, 0);
const FLOW_TIME = FLOW_SEG.reduce((n, g) => n + g.time, 0);
const FLOW_SPEED = 22;
const FLOW_DUR = FLOW_TIME / FLOW_SPEED;
// 구간마다 [시간 비율, 거리 비율] — animateMotion keyTimes/keyPoints(구간별 속도), 보임/숨김(calcMode discrete)도 시간 비율로
const FLOW_KEYS = (() => {
  const times = [0];
  const points = [0];
  const visT = [];
  const visV = [];
  let t = 0;
  let dist = 0;
  FLOW_SEG.forEach((g) => {
    const v = g.show ? 1 : 0;
    if (visV[visV.length - 1] !== v) { visT.push(t / FLOW_TIME); visV.push(v); }
    t += g.time;
    dist += g.len;
    times.push(t / FLOW_TIME);
    points.push(dist / FLOW_LEN);
  });
  const f = (arr) => arr.map((x) => Math.min(1, x).toFixed(4)).join(';');
  return { keyTimes: f(times), keyPoints: f(points), visTimes: f(visT), visValues: visV.join(';') };
})();
// 점마다 도착 시간 비율 → 이름 붙은 시점
const MARK_T = (() => {
  const out = {};
  let t = 0;
  FLOW_PTS.forEach((pt, i) => {
    if (i > 0) t += FLOW_SEG[i - 1].time;
    if (pt.mark) out[pt.mark] = t / FLOW_TIME;
  });
  return out;
})();
/**
 * 제품 색 바뀜 — 덩어리 위에 색 막을 덧씌워 투명도를 시점마다 바꾼다(calcMode linear).
 *  - 소입로: 들어가며 점점 달아오름(주황) → 기름 속에서 식음
 *  - 유조: 기름 막(짙은 갈색) → 중간세정기에서 씻겨 나감
 *  - 소려로: 은은한 호박색 → 방청조에서 식음
 */
const tintKeys = (pairs) => {
  const ts = [];
  const vs = [];
  pairs.forEach(([t, v]) => {
    const tt = Math.min(1, Math.max(ts.length ? ts[ts.length - 1] + 0.0005 : 0, t));
    ts.push(tt);
    vs.push(v);
  });
  if (ts[ts.length - 1] < 1) { ts.push(1); vs.push(vs[vs.length - 1]); }
  return { keyTimes: ts.map((t) => t.toFixed(4)).join(';'), values: vs.join(';') };
};
const M = MARK_T;
const TINTS = [
  { color: '#f4511e', ...tintKeys([[0, 0], [M.qIn, 0], [M.qOut, 0.85], [M.oilIn, 0.85], [M.oilIn + (M.oilOut - M.oilIn) * 0.45, 0]]) },
  { color: '#3d2a0e', ...tintKeys([[0, 0], [M.oilIn, 0], [M.oilIn + 0.004, 0.4], [M.mwIn, 0.4], [M.mwIn + (M.mwOut - M.mwIn) * 0.5, 0]]) },
  { color: '#f59e0b', ...tintKeys([[0, 0], [M.tIn, 0], [M.tOut, 0.55], [M.rsIn, 0.55], [M.rsIn + (M.rsOut - M.rsIn) * 0.6, 0]]) },
];
// 볼트 · 너트 뭉치 모양 — 볼트 [x, y, 각도, 길이], 너트 [x, y, 반지름]
const PILE_BOLTS = [[-2.4, -1.3, -10, 6], [2.3, -1.2, 14, 5.4], [0.2, -3.3, -24, 5.8]];
const PILE_NUTS = [[4.5, -1.5, 1.7], [-4.7, -1.1, 1.5], [1.8, -4.4, 1.3]];
const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i;
  return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

const LOT_SIZE = 5; // 한 LOT 덩어리 수
const LOT_PITCH = 0.75; // LOT 안 덩어리 사이(초)
const LOT_COUNT = Math.max(1, Math.round(FLOW_DUR / 20)); // 경로 위 LOT 수 — 약 20초마다 한 LOT
const LOT_PERIOD = FLOW_DUR / LOT_COUNT;

const useReducedMotion = () => useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

/**
 * 제품 한 덩어리 — 볼트 · 너트 뭉치: 육각 머리 볼트 셋(나사산 줄) + 육각 너트 셋(가운데 구멍)을 아무렇게나 쌓은 모양.
 * tint: 색 막(흐름 중 열 · 기름 색)으로 같은 모양을 한 번 더 그릴 때의 색 — 그림자 · 나사산 없이 모양만
 */
function Heap({ tint }) {
  const fill = tint ?? 'url(#m2-heap)';
  const cls = tint ? undefined : 'm2-heap';
  return (
    <g>
      {!tint && <ellipse cx={0.4} cy={0.3} rx={6.6} ry={1.4} className="m2-heap-shadow" />}
      {PILE_NUTS.slice(0, 2).map(([x, y, r]) => (
        <g key={`n${x}`}>
          <polygon points={hexPts(x, y, r)} fill={fill} className={cls} />
          <circle cx={x} cy={y} r={r * 0.4} className={tint ? undefined : 'm2-nut-hole'} fill={tint} />
        </g>
      ))}
      {PILE_BOLTS.map(([x, y, ang, len]) => (
        <g key={`b${x}`} transform={`translate(${x} ${y}) rotate(${ang})`}>
          <rect x={-len / 2 + 1.4} y={-0.75} width={len - 1.4} height={1.5} rx={0.5} fill={fill} className={cls} />
          <rect x={-len / 2} y={-1.45} width={1.5} height={2.9} rx={0.35} fill={fill} className={cls} />
          {!tint && Array.from({ length: Math.floor((len - 2) / 0.9) }, (_, k) => -len / 2 + 2.2 + k * 0.9).map((tx) => (
            <line key={tx} x1={tx} x2={tx + 0.35} y1={-0.7} y2={0.7} className="m2-heap-thread" />
          ))}
        </g>
      ))}
      {PILE_NUTS.slice(2).map(([x, y, r]) => (
        <g key={`n${x}`}>
          <polygon points={hexPts(x, y, r)} fill={fill} className={cls} />
          <circle cx={x} cy={y} r={r * 0.4} className={tint ? undefined : 'm2-nut-hole'} fill={tint} />
        </g>
      ))}
    </g>
  );
}

/** LOT 흐름 — LOT마다 5덩어리를 붙여서(LOT_PITCH), LOT 사이는 LOT_PERIOD. SVG animateMotion, 시작 시각을 음수로 엇갈려 처음부터 줄지어 보이게 */
function ProductFlow() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const dur = `${FLOW_DUR.toFixed(2)}s`;
  return (
    <g className="m2-flow-parts" aria-hidden="true">
      {Array.from({ length: LOT_COUNT }, (_, k) => Array.from({ length: LOT_SIZE }, (__, j) => {
        const begin = `${(-(k * LOT_PERIOD + j * LOT_PITCH)).toFixed(2)}s`;
        return (
          <g key={`${k}-${j}`} opacity="0">
            <animateMotion dur={dur} begin={begin} repeatCount="indefinite" path={FLOW_D}
              calcMode="linear" keyPoints={FLOW_KEYS.keyPoints} keyTimes={FLOW_KEYS.keyTimes} />
            <animate attributeName="opacity" calcMode="discrete" values={FLOW_KEYS.visValues} keyTimes={FLOW_KEYS.visTimes} dur={dur} begin={begin} repeatCount="indefinite" />
            <Heap />
            {TINTS.map((tn) => (
              <g key={tn.color} opacity="0" className="m2-heap-tint">
                <animate attributeName="opacity" calcMode="linear" values={tn.values} keyTimes={tn.keyTimes} dur={dur} begin={begin} repeatCount="indefinite" />
                <Heap tint={tn.color} />
              </g>
            ))}
          </g>
        );
      }))}
    </g>
  );
}

/*
 * 재료 투입 단계(phase) — 신호를 받아 한 단계씩 넘어간다(지금은 Mbf2.jsx의 예시 순서기가 대신 넘김).
 *  arrive  철통이 왼쪽 롤러 길을 따라 저울 위로 들어옴
 *  weigh   저울 위 — 무게 신호 기다림(계량 중)
 *  weighed 무게 신호 받음 — kg 표시(계량 완료), 승강기 신호 기다림
 *  lift    승강기 신호 — 철통이 올라감
 *  dump    위에서 기울여 호퍼에 붓기(부품이 슈트를 타고 우수수)
 *  down    바로 세우고 내려와 저울 위로
 *  leave   빈 철통이 왼쪽으로 나감 → 다음 철통 arrive
 * 각 단계로 바뀌는 순간 그 단계의 움직임(SMIL beginElement / CSS 애니메이션)을 시작한다.
 * 단계 이름 · 길이 · 계량기 상태 글씨는 integrated/charge.js(3호기와 같이 씀)
 */
const HOIST_RISE = 80;
const BIN_IN = 70; // 철통이 들어오기 전 왼쪽 거리

/** 철통이 위에서 기울며 쏟는 부품 — dump 단계에 나타나 알갱이가 조금씩 엇갈려 슈트를 타고 호퍼로 우수수(CSS 애니메이션, 단계 시작에 맞춰 시작) */
function HoistDump() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <g aria-hidden="true">
      {Array.from({ length: 34 }, (_, i) => (
        <circle key={i} cx={72 + (((i * 7) % 7) - 3)} cy={151 + (((i * 3) % 5) - 2)} r={i % 3 === 0 ? 2 : 1.5}
          className={i % 2 ? 'm2-grain m2-pour' : 'm2-grain is-light m2-pour'} style={{ animationDelay: `${0.45 + i * 0.035}s` }} />
      ))}
    </g>
  );
}

function Defs() {
  const lin = (id, stops, x2 = 0, y2 = 1) => (
    <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
      {stops.map(([o, c, a]) => <stop key={o} offset={o} stopColor={c} stopOpacity={a ?? 1} />)}
    </linearGradient>
  );
  return (
    <defs>
      <pattern id="m2-grid" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#e3e8ef" /></pattern>
      {lin('m2-steel-front', [[0, '#eeece6'], [1, '#d0ccc2']])}
      {lin('m2-dark-front', [[0, '#5b6777'], [1, '#353e4a']])}
      {lin('m2-panel-front', [[0, '#f1f3f6'], [1, '#dce1e7']])}
      {lin('m2-old-front', [[0, '#e3e6e9'], [0.65, '#d3d7dc'], [1, '#c1c6cc']])}
      {lin('m2-oldcap-front', [[0, '#c9cdd2'], [1, '#aab0b8']])}
      {lin('m2-grime', [[0, '#5a4632', 0], [0.5, '#5a4632', 0.05], [1, '#3f2f1f', 0.3]])}
      {lin('m2-slate-front', [[0, '#8693a4'], [1, '#6a7789']])}
      <pattern id="m2-brick" width="14" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 0 H14 M0 4 H14 M4 0 V4 M11 4 V8" stroke="#6a5240" strokeOpacity=".22" strokeWidth=".55" fill="none" />
      </pattern>
      <pattern id="m2-insul" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 0 V5" stroke="#c9bba8" strokeWidth="1" />
      </pattern>
      <pattern id="m2-perf" width="2.4" height="2.4" patternUnits="userSpaceOnUse">
        <path d="M0 0 H2.4 V2.4 H0 Z M1.2 .62 a.58 .58 0 1 0 .001 0 Z" fill="#b5bbc3" fillRule="evenodd" />
      </pattern>
      <pattern id="m2-mesh" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="skewX(-40)">
        <path d="M0 0 L4 4 M4 0 L0 4" stroke="#9aa5b3" strokeWidth=".5" />
      </pattern>
      {lin('m2-steel-cyl', [[0, '#a9b3bf'], [0.35, '#f6f8fa'], [0.7, '#cdd4dc'], [1, '#8f9aa8']], 1, 0)}
      {lin('m2-dark-cyl', [[0, '#2c343f'], [0.35, '#6e7a8a'], [0.7, '#465160'], [1, '#262d37']], 1, 0)}
      {lin('m2-motor-cyl', [[0, '#4e5d70'], [0.35, '#a7b6c8'], [0.7, '#7889a0'], [1, '#4a586b']], 1, 0)}
      <radialGradient id="m2-port-quench" cx=".45" cy=".45" r=".6">
        <stop offset="0" stopColor="#fff1d6" />
        <stop offset=".45" stopColor="#fb923c" />
        <stop offset="1" stopColor="#c2410c" />
      </radialGradient>
      <radialGradient id="m2-port-temper" cx=".45" cy=".45" r=".6">
        <stop offset="0" stopColor="#fffbea" />
        <stop offset=".45" stopColor="#fbbf24" />
        <stop offset="1" stopColor="#b45309" />
      </radialGradient>
      {lin('m2-liq-water', [[0, '#bfe5f6'], [1, '#6fb9de']])}
      {lin('m2-liq-oil', [[0, '#eed29a'], [1, '#bf8a35']])}
      {lin('m2-liq-rust', [[0, '#d2ecd9'], [1, '#86c59a']])}
      {lin('m2-glass', [[0, '#ffffff', 0.35], [0.5, '#ffffff', 0.05], [1, '#ffffff', 0.18]], 1, 1)}
      <linearGradient id="m2-blade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f2f5f8" />
        <stop offset=".55" stopColor="#b9c1ca" />
        <stop offset="1" stopColor="#7d8894" />
      </linearGradient>
      <linearGradient id="m2-refractory" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d6c8b8" />
        <stop offset="1" stopColor="#c2ae9a" />
      </linearGradient>
      <linearGradient id="m2-heat-quench" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#f97316" stopOpacity=".75" />
        <stop offset=".55" stopColor="#ea580c" stopOpacity=".28" />
        <stop offset="1" stopColor="#ea580c" stopOpacity=".08" />
      </linearGradient>
      <linearGradient id="m2-heat-temper" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#f59e0b" stopOpacity=".55" />
        <stop offset=".55" stopColor="#d97706" stopOpacity=".2" />
        <stop offset="1" stopColor="#d97706" stopOpacity=".05" />
      </linearGradient>
      <linearGradient id="m2-spray-cone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#bae6fd" stopOpacity=".9" />
        <stop offset=".6" stopColor="#7dd3fc" stopOpacity=".45" />
        <stop offset="1" stopColor="#7dd3fc" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="m2-motor-h" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4e5d70" />
        <stop offset=".35" stopColor="#a7b6c8" />
        <stop offset=".7" stopColor="#7889a0" />
        <stop offset="1" stopColor="#4a586b" />
      </linearGradient>
      <radialGradient id="m2-heap" cx=".38" cy=".3" r=".75">
        <stop offset="0" stopColor="#f1f4f7" />
        <stop offset=".5" stopColor="#9aa6b4" />
        <stop offset="1" stopColor="#56616f" />
      </radialGradient>
      <radialGradient id="m2-flame" cx=".5" cy=".75" r=".6">
        <stop offset="0" stopColor="#fff7d6" />
        <stop offset=".45" stopColor="#fbbf24" />
        <stop offset="1" stopColor="#f97316" stopOpacity="0" />
      </radialGradient>
      <filter id="m2-stain" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
      <filter id="m2-rust-blur" x="-200%" y="-20%" width="500%" height="140%"><feGaussianBlur stdDeviation=".7" /></filter>
      <filter id="m2-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" /></filter>
    </defs>
  );
}

/** 상자 — 앞면(x, y, w, h) + 윗면 + 오른쪽 옆면. m: steel | dark | panel | slate | old(로 바랜 도장) | oldcap(로 지붕 캡) */
function Box({ x, y, w, h, d, m = 'steel', className = '', children }) {
  const [ox, oy] = off(d);
  return (
    <g className={`m2-box is-${m} ${className}`.trim()}>
      <polygon className="m2-face-top" points={P([[x, y], [x + w, y], [x + w + ox, y + oy], [x + ox, y + oy]])} />
      <polygon className="m2-face-side" points={P([[x + w, y], [x + w + ox, y + oy], [x + w + ox, y + h + oy], [x + w, y + h]])} />
      <rect className="m2-face-front" x={x} y={y} width={w} height={h} fill={`url(#m2-${m}-front)`} />
      {children}
    </g>
  );
}

/** 원통(세운 것) — 몸통(가로 그라데이션) + 윗면 타원 */
function Cyl({ cx, y1, y2, rx, m = 'steel' }) {
  const ry = rx * 0.4;
  return (
    <g className={`m2-cyl is-${m}`}>
      <path d={`M${cx - rx} ${y1} V${y2} A${rx} ${ry} 0 0 0 ${cx + rx} ${y2} V${y1} Z`} fill={`url(#m2-${m}-cyl)`} className="m2-cyl-body" />
      <ellipse cx={cx} cy={y1} rx={rx} ry={ry} className="m2-cyl-top" />
    </g>
  );
}

/** 바닥 그림자 — 발자국 평행사변형을 흐리게 */
function Shadow({ x, w, d }) {
  const [ox, oy] = off(d);
  return <polygon className="m2-shadow" filter="url(#m2-soft)" points={P([[x - 2, FLOOR_Y], [x + w + 3, FLOOR_Y], [x + w + ox + 5, FLOOR_Y + oy], [x + ox, FLOOR_Y + oy]])} />;
}

/**
 * 지붕 순환팬(RC FAN) 모터 유닛 — 받침 플랜지 · 베어링 하우징 · 방열 핀 모터(단자함) · 같은 색 상단 캡(가운데 보스).
 * 팬 날개는 로 안(단면)에서 보인다. base: 지붕 위 받침 중심
 */
function RoofFan({ cx, base }) {
  const top = base - 28;
  return (
    <g className="m2-rfan">
      <ellipse cx={cx} cy={base + 0.5} rx={15} ry={5.6} className="m2-flange" />
      <Cyl cx={cx} y1={base - 6} y2={base} rx={12} m="steel" />
      <Cyl cx={cx} y1={top + 4} y2={base - 6} rx={8.5} m="motor" />
      {[-5.5, -2.8, 0, 2.8, 5.5].map((fx) => <line key={fx} x1={cx + fx} x2={cx + fx} y1={top + 7} y2={base - 8} className="m2-rfan-fin" />)}
      <rect x={cx + 7} y={top + 9} width={5} height={6} rx={1} className="m2-rfan-tbox" />
      <Cyl cx={cx} y1={top} y2={top + 4} rx={9.2} m="motor" />
      <ellipse cx={cx} cy={top} rx={5} ry={2} className="m2-rfan-boss" />
    </g>
  );
}

/** 교반기 프로펠러(옆에서 본 날개 두 장) — 운전 중이면 날개 폭이 줄었다 늘었다 하며 도는 것처럼 */
function Impeller({ cx, cy, on }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g className={`m2-prop${on ? ' is-on' : ''}`}>
        <ellipse cx={-6} rx={6} ry={2.2} className="m2-prop-blade" />
        <ellipse cx={6} rx={6} ry={2.2} className="m2-prop-blade" />
      </g>
      <circle r={1.8} className="m2-prop-hub" />
    </g>
  );
}

/** 컨베이어 — 벨트 윗면(깊이 d) + 앞 프레임 두께 + 양 끝 롤러. 운전 중이면 벨트 가운데 줄이 흐른다 */
function Conveyor({ x1, y1, x2, y2, on, d = 13 }) {
  const [ox, oy] = off(d);
  return (
    <g className={`m2-conv${on ? ' is-on' : ''}`}>
      <polygon className="m2-conv-belt" points={P([[x1, y1], [x2, y2], [x2 + ox, y2 + oy], [x1 + ox, y1 + oy]])} />
      <line x1={x1 + ox / 2} y1={y1 + oy / 2} x2={x2 + ox / 2} y2={y2 + oy / 2} className="m2-conv-run" />
      <polygon className="m2-conv-frame" points={P([[x1, y1], [x2, y2], [x2, y2 + 5], [x1, y1 + 5]])} />
      {[[x1, y1], [x2, y2]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy + 2.5} r={4} className="m2-roller" />)}
    </g>
  );
}

/** 진동 피더 경사부 — 벨트 윗면 위 트레이(깊이 방향 막대)가 비스듬히 올라간다. 그 위로 LOT(ProductFlow)가 같은 속도로 실려 올라간다 */
const FEEDER_TRAYS = 6;
function FeederIncline({ x1, y1, x2, y2, on, d = 14 }) {
  const [ox, oy] = off(d);
  const dx = (x2 - x1) / FEEDER_TRAYS;
  const dy = (y2 - y1) / FEEDER_TRAYS;
  const bed = [[x1, y1], [x2, y2], [x2 + ox, y2 + oy], [x1 + ox, y1 + oy]];
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = (y2 - y1) / len; // 경사 위쪽 법선
  const ny = -(x2 - x1) / len;
  return (
    <g>
      {/* 트레이를 경사 양 끝에서만 자른다 — 경사 위쪽으로는 넉넉히(트레이 위 부품 더미가 잘리지 않게) */}
      <defs><clipPath id="m2-clip-feeder"><polygon points={P([[x1, y1 + 6], [x2, y2 + 6], [x2 + ox + nx * 18, y2 + oy + ny * 18], [x1 + ox + nx * 18, y1 + oy + ny * 18]])} /></clipPath></defs>
      {[0.5, 0.86].map((t) => {
        const lx = x1 + (x2 - x1) * t;
        return <line key={t} x1={lx} y1={y1 + (y2 - y1) * t + 6} x2={lx} y2={FLOOR_Y} className="m2-leg-line" />;
      })}
      <polygon className="m2-conv-belt" points={P(bed)} />
      <g clipPath="url(#m2-clip-feeder)">
        <g className={on ? 'm2-feeder-move' : undefined} style={{ '--m2-fx': `${dx}px`, '--m2-fy': `${dy}px` }}>
          {Array.from({ length: FEEDER_TRAYS + 2 }, (_, i) => i - 1).map((i) => {
            const tx = x1 + dx * (i + 0.5);
            const ty = y1 + dy * (i + 0.5);
            return (
              <g key={i}>
                <line x1={tx} y1={ty} x2={tx + ox} y2={ty + oy} className="m2-tray" />
              </g>
            );
          })}
        </g>
      </g>
      <polygon className="m2-conv-frame" points={P([[x1, y1], [x2, y2], [x2, y2 + 5], [x1, y1 + 5]])} />
      <circle cx={x1} cy={y1 + 2.5} r={4} className="m2-roller" />
      <circle cx={x2} cy={y2 + 2.5} r={4} className="m2-roller" />
    </g>
  );
}

/**
 * 열처리로(오래 쓴 설비 외관) — 바랜 회색 도장 몸체 · 아래로 갈수록 때 · 기름 얼룩 · 이음과 볼트에서 흘러내린 녹 · 덧댄 패널.
 *  - 위: 존마다 오래된 온도 조절기 함(나사 박힌 강철 테 + 붉은 LED 숫자)
 *  - 가운데(단면): 볼트 박힌 강철 테. 안쪽은 밝은 내화 벽돌 · 복사관(버너 운전 중 빨갛게) · 은은한 열기 · 노상 위 메시 벨트 · RC FAN 날개 두 장(옆모습, 운전 중 회전)
 *  - 아래: 타공 통풍구(강철 틀 · 볼트, 버너 운전 중이면 구멍 사이로 따뜻한 빛) → 녹 슨 어두운 강철 채널(바랜 글씨)
 * 지붕: 바랜 회색 캡, 녹 슨 난간, 존마다 열전대, RC FAN 모터 유닛. fans: [{ x, on }] — x는 앞면 기준(램프 자리)
 * 얼룩 · 녹 위치는 존 번호로 정해(매번 같은 자리) 화면이 새로 그려져도 흔들리지 않는다
 */
function Furnace({ id, x, w, kind, zones, hot, burnerOn, fans, temps }) {
  const d = 30;
  const y = 146;
  const h = 72;
  const zoneW = w / zones;
  const legs = Math.round(w / 70) + 1;
  const [rox, roy] = off(d + 3);
  const roofY = y - 7;
  const railY = roofY + roy;
  const posts = Math.floor((w + 6) / 28);
  const zx = (i) => x + zoneW * (i + 0.5);
  // 단면 창 — 바깥(잘린 벽 두께 포함) / 안쪽(로 내부)
  const cut = { x: x + 7, y: y + 18, w: w - 14, h: 38 };
  const wall = 4;
  const inner = { x: cut.x + wall, y: cut.y + wall, w: cut.w - wall * 2, h: cut.h - wall * 2 };
  const beltY = inner.y + inner.h - 6;
  return (
    <g className={`m2-furnace is-${kind}${hot ? ' is-hot' : ''}${burnerOn ? ' is-burn' : ''}`}>
      <Shadow x={x - 20} w={w + 20} d={d} />
      {Array.from({ length: legs }, (_, i) => x + 14 + (i * (w - 28)) / (legs - 1)).map((lx) => (
        <Box key={lx} x={lx - 3} y={y + h} w={6} h={FLOOR_Y - y - h} d={6} m="dark" />
      ))}

      {/* 입구 전실 — 개구부 안 열기, 아래 녹 슨 채널 */}
      <Box x={x - 20} y={178} w={20} h={36} d={22} m="old" />
      <rect x={x - 20} y={178} width={20} height={36} fill="url(#m2-grime)" />
      <rect x={x - 20} y={208} width={20} height={6} className="m2-channel" />
      <rect x={x - 16} y={195} width={13} height={15} rx={1.5} className="m2-mouth" />
      {hot && <rect x={x - 16} y={203} width={13} height={7} rx={1.5} fill={`url(#m2-port-${kind})`} className="m2-mouth-glow" />}

      {/* 몸체(바랜 도장) · 때 · 얼룩 · 녹 줄 · 덧댄 패널 · 이음과 볼트 · 모서리 앵글 */}
      <Box x={x} y={y} w={w} h={h} d={d} m="old" />
      <rect x={x} y={y} width={w} height={h} fill="url(#m2-grime)" />
      {Array.from({ length: zones * 2 + 1 }, (_, i) => {
        const r = hash(i + (kind === 'quench' ? 1 : 50));
        return (
          <ellipse key={`st${i}`} cx={x + 10 + r * (w - 20)} cy={y + 46 + hash(i + 9) * 18} rx={5 + hash(i + 3) * 9} ry={2.5 + hash(i + 5) * 4}
            filter="url(#m2-stain)" className="m2-stain" />
        );
      })}
      {(() => {
        const px = x + zoneW * (zones > 4 ? 3 : 1) + 8;
        return (
          <g>
            <rect x={px} y={y + 57} width={zoneW - 16} height={6.5} className="m2-patch" />
            {[[px + 1.6, y + 58.6], [px + zoneW - 17.6, y + 58.6], [px + 1.6, y + 61.9], [px + zoneW - 17.6, y + 61.9]].map(([bx, by]) => (
              <circle key={`${bx}-${by}`} cx={bx} cy={by} r={0.7} className="m2-bolt" />
            ))}
          </g>
        );
      })()}
      {Array.from({ length: zones - 1 }, (_, i) => x + zoneW * (i + 1)).map((sx, i) => (
        <g key={sx}>
          <line x1={sx} x2={sx} y1={y + 2} y2={y + h - 8} className="m2-seam-lo" />
          <line x1={sx + 1} x2={sx + 1} y1={y + 2} y2={y + h - 8} className="m2-seam-hi" />
          {Array.from({ length: 8 }, (__, k) => <circle key={k} cx={sx - 2} cy={y + 4 + k * 8} r={0.6} className="m2-bolt" />)}
          <path d={`M${sx - 2} ${y + 17} q .6 ${8 + hash(i + 21) * 6} -.2 ${16 + hash(i + 7) * 10}`} filter="url(#m2-rust-blur)" className="m2-rust" />
        </g>
      ))}
      {[x + 1.5, x + w - 1.5].map((ex) => (
        <g key={ex}>
          <rect x={ex - 1.5} y={y} width={3} height={h} className="m2-angle" />
          {Array.from({ length: 9 }, (__, k) => <circle key={k} cx={ex} cy={y + 4 + k * 8} r={0.55} className="m2-bolt" />)}
        </g>
      ))}

      {/* ── 단면: 잘린 벽 두께 → 안쪽 내화 벽돌 · 열기 → 벨트 · 부품 → 임펠러 → 존 경계 ── */}
      <rect x={cut.x} y={cut.y} width={cut.w} height={cut.h} className="m2-cut-wall" />
      <rect x={cut.x} y={cut.y} width={cut.w} height={cut.h} fill="url(#m2-insul)" />
      <defs><clipPath id={`m2-clip-in-${id}`}><rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} /></clipPath></defs>
      <g clipPath={`url(#m2-clip-in-${id})`}>
        {/* 밝은 내화 벽돌 벽 + 천장 그늘 + 바닥에서 올라오는 은은한 열기 */}
        <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill="url(#m2-refractory)" />
        <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill="url(#m2-brick)" />
        {hot && <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill={`url(#m2-heat-${kind})`} className="m2-heat" />}
        <rect x={inner.x} y={inner.y} width={inner.w} height={3.5} className="m2-in-ceiling" />
        {/* 복사관 — 천장 밑 · 바닥 쪽 가로로, 버너 운전 중이면 달아오름 */}
        {[inner.y + 6, inner.y + inner.h - 2.5].map((ty) => Array.from({ length: zones }, (_, i) => {
          const zl = x + zoneW * i + 9;
          const zr = x + zoneW * (i + 1) - 9;
          return (
            <g key={`${ty}-${i}`} className={`m2-tube${burnerOn ? ' is-hot' : ''}`}>
              {burnerOn && <line x1={zl} x2={zr} y1={ty} y2={ty} filter="url(#m2-soft)" className="m2-tube-glow" />}
              <line x1={zl} x2={zr} y1={ty} y2={ty} className="m2-tube-body" />
              {burnerOn && <line x1={zl + 2} x2={zr - 2} y1={ty} y2={ty} className="m2-tube-core" />}
            </g>
          );
        }))}
        {/* 존 경계 */}
        {Array.from({ length: zones - 1 }, (_, i) => x + zoneW * (i + 1)).map((sx) => (
          <line key={sx} x1={sx} x2={sx} y1={inner.y + 3.5} y2={beltY - 1} className="m2-in-zone" />
        ))}
        {/* 바닥(노상) + 메시 벨트(부품은 전체 흐름 ProductFlow가 지나간다) */}
        <rect x={inner.x} y={beltY + 2.5} width={inner.w} height={inner.h - (beltY - inner.y) - 2.5} className="m2-in-hearth" />
        <rect x={inner.x} y={beltY} width={inner.w} height={2.5} className="m2-in-belt" />
        {/* RC FAN — 천장에서 내려온 축 끝 날개 두 장(옆에서 본 모습). 운전 중이면 날개 폭이 천천히 줄었다 늘었다 하며 도는 것처럼 */}
        {fans.map((f) => {
          const cy = inner.y + 11;
          return (
            <g key={f.x} className={`m2-ifan${f.on ? ' is-on' : ''}`}>
              <line x1={f.x} x2={f.x} y1={inner.y} y2={cy} className="m2-in-shaft" />
              <g transform={`translate(${f.x} ${cy})`}>
                <g className={`m2-prop${f.on ? ' is-on' : ''}`}>
                  <ellipse cx={-7} rx={7} ry={2} fill="url(#m2-blade)" className="m2-fan-blade2" />
                  <ellipse cx={7} rx={7} ry={2} fill="url(#m2-blade)" className="m2-fan-blade2" />
                </g>
                <circle r={2} className="m2-fan-hub2" />
              </g>
            </g>
          );
        })}
      </g>
      <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} className="m2-in-frame" />
      <rect x={cut.x - 1.2} y={cut.y - 1.2} width={cut.w + 2.4} height={cut.h + 2.4} className="m2-frame" />
      {Array.from({ length: Math.floor(cut.w / 26) + 1 }, (_, k) => cut.x + 4 + k * ((cut.w - 8) / Math.floor(cut.w / 26))).map((bx) => (
        <g key={bx}>
          <circle cx={bx} cy={cut.y - 1.2} r={0.7} className="m2-bolt is-dark" />
          <circle cx={bx} cy={cut.y + cut.h + 1.2} r={0.7} className="m2-bolt is-dark" />
        </g>
      ))}

      {/* 위 — 존마다 오래된 온도 조절기 함(나사 박힌 강철 테 + 붉은 LED 숫자) */}
      {Array.from({ length: zones }, (_, i) => {
        const cx = zx(i);
        const t = temps?.[i];
        return (
          <g key={i}>
            <rect x={cx - 25} y={y + 2.5} width={50} height={13.5} rx={1} className="m2-ctl" />
            <circle cx={cx - 23} cy={y + 4.3} r={0.6} className="m2-bolt is-dark" />
            <circle cx={cx + 23} cy={y + 4.3} r={0.6} className="m2-bolt is-dark" />
            <circle cx={cx - 23} cy={y + 14.2} r={0.6} className="m2-bolt is-dark" />
            <circle cx={cx + 23} cy={y + 14.2} r={0.6} className="m2-bolt is-dark" />
            <rect x={cx - 20.5} y={y + 4.5} width={41} height={9.5} className="m2-ctl-win" />
            <text x={cx - 18.8} y={y + 11.4} className="m2-zone-label">{i + 1}존</text>
            <text x={cx + 12} y={y + 12.3} className="m2-lcd-text">{t != null ? Math.round(t) : '---'}</text>
            <text x={cx + 13} y={y + 12.3} className="m2-lcd-unit">℃</text>
          </g>
        );
      })}

      {/* 아래 — 존마다 타공 통풍구: 강철 틀 + 모서리 볼트, 안은 어둡고 버너 운전 중이면 구멍 사이로만 따뜻한 빛 */}
      {Array.from({ length: zones }, (_, i) => {
        const cx = zx(i);
        return (
          <g key={`v${i}`}>
            <rect x={cx - 16} y={y + 56.2} width={32} height={7.6} className="m2-vent-frame" />
            <rect x={cx - 14} y={y + 57.4} width={28} height={5.2} className="m2-vent-in" />
            {burnerOn && <rect x={cx - 14} y={y + 57.4} width={28} height={5.2} fill={`url(#m2-port-${kind})`} className="m2-vent-glow" />}
            <rect x={cx - 14} y={y + 57.4} width={28} height={5.2} fill="url(#m2-perf)" />
            {[[-15, 57.2], [15, 57.2], [-15, 62.8], [15, 62.8]].map(([bx, by]) => (
              <circle key={`${bx}-${by}`} cx={cx + bx} cy={y + by} r={0.55} className="m2-bolt is-dark" />
            ))}
          </g>
        );
      })}

      {/* 녹 슨 강철 채널 — 바랜 글씨 */}
      <rect x={x} y={y + h - 7} width={w} height={7} className="m2-channel" />
      {Array.from({ length: Math.round(w / 40) }, (_, i) => (
        <ellipse key={`r${i}`} cx={x + 12 + hash(i + 31) * (w - 24)} cy={y + h - 3.5} rx={4 + hash(i + 41) * 7} ry={1.6 + hash(i + 51) * 1.4}
          filter="url(#m2-stain)" className="m2-rust-spot" />
      ))}
      <text x={x + 9} y={y + h - 2} className="m2-stencil">{kind === 'quench' ? 'QUENCHING  FURNACE' : 'TEMPERING  FURNACE'}</text>

      {/* 지붕 캡 — 바랜 회색, 앞 모서리에 때 */}
      <Box x={x - 3} y={roofY} w={w + 6} h={7} d={d + 3} m="oldcap" />
      <rect x={x - 3} y={roofY} width={w + 6} height={7} fill="url(#m2-grime)" />

      {/* 지붕 뒤쪽 점검 통로 난간 */}
      <g className="m2-rail">
        {Array.from({ length: posts + 1 }, (_, i) => x - 3 + rox + (i * (w + 6)) / posts).map((px) => (
          <line key={px} x1={px} x2={px} y1={railY} y2={railY - 12} />
        ))}
        <line x1={x - 3 + rox} x2={x + w + 3 + rox} y1={railY - 12} y2={railY - 12} />
        <line x1={x - 3 + rox} x2={x + w + 3 + rox} y1={railY - 6} y2={railY - 6} />
      </g>

      {/* 열전대 · RC FAN 모터 */}
      {Array.from({ length: zones }, (_, i) => zx(i) - zoneW * 0.3).map((tx) => (
        <g key={tx} transform={`translate(${rox * 0.35} ${roy * 0.35})`}>
          <line x1={tx} x2={tx} y1={roofY} y2={roofY - 10} className="m2-tc" />
          <rect x={tx - 2.5} y={roofY - 14} width={5} height={4} rx={1} className="m2-tc-head" />
        </g>
      ))}
      {fans.map((f) => <RoofFan key={f.x} cx={f.x + rox / 2} base={roofY + roy / 2} />)}
    </g>
  );
}

/** 슈트 — 바닥판 + 앞 벽(3D 홈통). closed면 뚜껑을 덮은 단열 덕트(소입 슈트 — 로와 같은 어두운 색) */
function Chute({ x1, y1, x2, y2, d = 12, closed }) {
  const [ox, oy] = off(d);
  const bed = [[x1, y1], [x2, y2], [x2 + ox, y2 + oy], [x1 + ox, y1 + oy]];
  const wall = closed ? 8 : 5;
  return (
    <g className={`m2-chute3d${closed ? ' is-closed' : ''}`}>
      <polygon points={P(bed)} className="m2-chute-bed" />
      {closed && <polygon points={P(bed.map(([a, b]) => [a, b - wall]))} className="m2-chute-lid" />}
      <polygon points={P([[x1, y1 - wall], [x2, y2 - wall], [x2, y2 + 1.5], [x1, y1 + 1.5]])} fill={closed ? 'url(#m2-slate-front)' : 'url(#m2-steel-front)'} className="m2-chute-wall" />
    </g>
  );
}

/**
 * 소입 슈트 — 소입로 출구(옆면, 벨트 높이)에서 기름 속까지 비스듬히 내려가는 닫힌 덕트(가운데 깊이).
 * 출구 쪽 플랜지 · 덕트 몸통(로와 같은 색) · 기름에 잠긴 부분은 액체에 가려지게 자르고, 액면과 만나는 곳에 잔물결 고리
 */
const QC = { s: [684, 186], e: [738, 222], d: 14 };
const OIL = { x: 704, lv: 222, w: 128, d: 24 };
function QuenchChute() {
  const [hx, hy] = off(QC.d / 2);
  const [tox, toy] = off(OIL.d);
  const x1 = QC.s[0] - hx;
  const y1 = QC.s[1] - hy;
  const x2 = QC.e[0] - hx;
  const y2 = QC.e[1] - hy;
  // 기름에 잠긴 곳(앞면 액체 · 액면) 밖에서만 보이게
  const hole = `M0 0 H${VIEW_W} V${VIEW_H} H0 Z M${OIL.x} ${OIL.lv} H${OIL.x + OIL.w} V${FLOOR_Y} H${OIL.x} Z `
    + `M${OIL.x} ${OIL.lv} L${OIL.x + tox} ${OIL.lv + toy} H${OIL.x + OIL.w + tox} L${OIL.x + OIL.w} ${OIL.lv} Z`;
  const t = (OIL.lv + toy / 2 - QC.s[1]) / (QC.e[1] - QC.s[1]);
  const rx = QC.s[0] + (QC.e[0] - QC.s[0]) * t;
  return (
    <g>
      <defs><clipPath id="m2-clip-qc"><path d={hole} clipRule="evenodd" /></clipPath></defs>
      <g clipPath="url(#m2-clip-qc)">
        <Chute x1={x1} y1={y1} x2={x2} y2={y2} d={QC.d} closed />
        <polygon points={P([[x1, y1 - 9], [x1 + 4, y1 - 9 + 2.4], [x1 + 4, y1 + 4], [x1, y1 + 1.5]])} className="m2-qc-flange" />
      </g>
      <ellipse cx={rx} cy={OIL.lv + toy / 2} rx={9} ry={2.4} className="m2-oil-ring" />
    </g>
  );
}

/** 메시 벨트 적재대 — 로 입구 앞 벨트(망 무늬). 위로 지나가는 부품은 ProductFlow */
function LoadTable({ x1, x2, y, d = 22 }) {
  const [ox, oy] = off(d);
  const top = [[x1, y], [x2, y], [x2 + ox, y + oy], [x1 + ox, y + oy]];
  return (
    <g>
      {[x1 + 4, x2 - 5].map((lx) => <line key={lx} x1={lx} x2={lx} y1={y + 4} y2={FLOOR_Y} className="m2-leg-line" />)}
      <polygon points={P(top)} className="m2-mesh-bed" />
      <polygon points={P(top)} fill="url(#m2-mesh)" />
      <rect x={x1} y={y} width={x2 - x1} height={4} className="m2-conv-frame" />
    </g>
  );
}

/**
 * 스킵 승강기 — 기둥 두 개 + 가새 + 머리 보 · 도르래 + 아래 저울판 + 왼쪽 롤러 길(철통이 들어오고 나가는 길).
 * phase가 바뀌면 그 단계 움직임을 시작(SMIL animateTransform, begin=indefinite → beginElement). 붓고 난 뒤 철통은 비어 있다
 */
function Hoist({ on, phase }) {
  const reduce = useReducedMotion();
  const top = 146;
  const [ox, oy] = off(8);
  const run = on && !reduce;
  const anim = useRef({});
  useEffect(() => {
    if (!run) return;
    const a = anim.current;
    if (phase === 'arrive') a.arrive?.beginElement();
    if (phase === 'lift') a.lift?.beginElement();
    if (phase === 'dump') a.tilt?.beginElement();
    if (phase === 'down') { a.untilt?.beginElement(); a.down?.beginElementAt(0.4); }
    if (phase === 'leave') a.leave?.beginElement();
  }, [phase, run]);
  const empty = run && ['down', 'leave'].includes(phase);
  const ease = { calcMode: 'spline', keyTimes: '0;1', keySplines: '.45 0 .55 1', begin: 'indefinite', fill: 'freeze' };
  return (
    <g>
      <Shadow x={46} w={36} d={10} />
      {/* 롤러 길 — 왼쪽 끝에서 저울까지 */}
      <Box x={0} y={248} w={54} h={4} d={10} m="dark" />
      {Array.from({ length: 6 }, (_, k) => 5 + k * 8.8).map((rx) => <ellipse key={rx} cx={rx + off(5)[0]} cy={248 + off(5)[1]} rx={1.8} ry={0.9} className="m2-track-roller" />)}
      <line x1={66 + ox / 2} x2={66 + ox / 2} y1={top - 6} y2={FLOOR_Y - 6} className="m2-cable" />
      {/* 저울판 — 철통이 내려앉는 자리 */}
      <Box x={54} y={248} w={23} h={4} d={10} m="dark" />
      <g>
        {run && (
          <>
            <animateTransform ref={(el) => { anim.current.arrive = el; }} attributeName="transform" type="translate" from={`-${BIN_IN} 0`} to="0 0" dur="2.4s" {...ease} />
            <animateTransform ref={(el) => { anim.current.lift = el; }} attributeName="transform" type="translate" from="0 0" to={`0 -${HOIST_RISE}`} dur="2.6s" {...ease} />
            <animateTransform ref={(el) => { anim.current.down = el; }} attributeName="transform" type="translate" from={`0 -${HOIST_RISE}`} to="0 0" dur="2.3s" {...ease} />
            <animateTransform ref={(el) => { anim.current.leave = el; }} attributeName="transform" type="translate" from="0 0" to={`-${BIN_IN} 0`} dur="2s" {...ease} />
          </>
        )}
        <g>
          {run && (
            <>
              <animateTransform ref={(el) => { anim.current.tilt = el; }} attributeName="transform" type="rotate" from="0 74 228" to="38 74 228" dur=".5s" {...ease} />
              <animateTransform ref={(el) => { anim.current.untilt = el; }} attributeName="transform" type="rotate" from="38 74 228" to="0 74 228" dur=".4s" {...ease} />
            </>
          )}
          <Box x={57} y={228} w={17} h={20} d={9} m="steel" className="is-open" />
          {[61.5, 65.5, 69.5].map((rx) => <line key={rx} x1={rx} x2={rx} y1={230} y2={246.5} className="m2-bin-rib" />)}
          <rect x={57} y={228} width={17} height={2} className="m2-bin-rim" />
          {!empty && <g transform={`translate(${65.5 + off(4.5)[0]} ${229 + off(4.5)[1]}) scale(.75)`}><Heap /></g>}
        </g>
      </g>
      <Box x={50} y={top} w={5} h={FLOOR_Y - top} d={7} m="steel" />
      <Box x={76} y={top} w={5} h={FLOOR_Y - top} d={7} m="steel" />
      {[0, 1, 2].map((k) => {
        const y1 = top + 14 + k * 30;
        return <path key={k} d={`M55 ${y1} L76 ${y1 + 26} M76 ${y1} L55 ${y1 + 26}`} className="m2-brace" />;
      })}
      <Box x={46} y={top - 8} w={42} h={8} d={11} m="steel" />
      <circle cx={66 + ox / 2} cy={top - 11 + oy / 2} r={4.5} className="m2-roller" />
      <circle cx={66 + ox / 2} cy={top - 11 + oy / 2} r={1.3} className="m2-pulley-hub" />
    </g>
  );
}

/**
 * 계량기 — 기둥 위 표시기: 무게(kg, 무게 신호 값) + 상태(단계에 따라).
 * 무게 신호 전(arrive · weigh)에는 ---, 받은 뒤부터 빈 철통이 나갈 때까지 그 값. 승강기가 멈춰 있으면 '정지'
 */
function WeighIndicator({ weight, phase, on }) {
  const show = on && SHOW_WEIGHT.includes(phase) && weight != null;
  const [text, cls] = on ? (WEIGH_STATE[phase] ?? ['대기', '']) : ['정지', ''];
  return (
    <g>
      <Shadow x={22} w={14} d={8} />
      <Box x={28} y={218} w={3} h={FLOOR_Y - 218} d={4} m="dark" />
      <Box x={12} y={190} w={36} h={28} d={8} m="steel" />
      <rect x={14.5} y={193} width={31} height={12} rx={1} className="m2-scale-win" />
      <text x={39.5} y={202.6} className={`m2-scale-num${phase === 'weigh' && on ? ' is-wait' : ''}`}>{show ? Math.round(weight).toLocaleString() : '---'}</text>
      <text x={40.5} y={202.6} className="m2-scale-unit">kg</text>
      <text x={30} y={213.4} className={`m2-scale-state ${cls}`}>{text}</text>
    </g>
  );
}

/** 투입 호퍼 — 위가 넓은 깔때기(앞 사다리꼴 · 옆면 · 안쪽), 안에 부품 더미. 아래 다리 */
function Hopper({ x, y, w, h, d = 16 }) {
  const [ox, oy] = off(d);
  const bx1 = x + w * 0.3;
  const bx2 = x + w * 0.7;
  const by = y + h;
  return (
    <g>
      <Shadow x={x + 6} w={w - 12} d={d} />
      <Box x={bx1 + 1} y={by} w={3} h={FLOOR_Y - by} d={4} m="dark" />
      <Box x={bx2 - 5} y={by} w={3} h={FLOOR_Y - by} d={4} m="dark" />
      <polygon points={P([[x, y], [x + w, y], [x + w + ox, y + oy], [x + ox, y + oy]])} className="m2-hopper-in" />
      {[[0.32, 0.65], [0.55, 0.7], [0.42, 0.35], [0.66, 0.4]].map(([fx, fz]) => (
        <g key={`${fx}-${fz}`} transform={`translate(${x + w * fx + ox * fz} ${y + 2 + oy * fz}) scale(.7)`}><Heap /></g>
      ))}
      <polygon points={P([[x + w, y], [x + w + ox, y + oy], [bx2 + ox, by + oy], [bx2, by]])} className="m2-face-side m2-hopper-side" />
      <polygon points={P([[x, y], [x + w, y], [bx2, by], [bx1, by]])} fill="url(#m2-steel-front)" className="m2-face-front m2-hopper-front" />
      <polygon points={P([[x, y], [x + w, y], [x + w + ox, y + oy], [x + ox, y + oy]])} className="m2-hopper-rim" />
    </g>
  );
}

/** 제품 상자 — 위가 열린 통(안쪽에 부품 더미) */
function Bin({ x, y, w, h, d = 14 }) {
  const [ox, oy] = off(d);
  return (
    <g>
      <Shadow x={x} w={w} d={d} />
      <Box x={x} y={y} w={w} h={h} d={d} m="steel" className="is-open" />
      {[[0.35, 0.6], [0.62, 0.55], [0.48, 0.3]].map(([fx, fz]) => (
        <g key={`${fx}-${fz}`} transform={`translate(${x + w * fx + ox * fz} ${y + 2 + oy * fz}) scale(.6)`}><Heap /></g>
      ))}
      <text x={x + w / 2} y={y + h / 2 + 3} className="m2-tag">제품</text>
    </g>
  );
}

/** 버너 — 작은 강철 상자 + 연소구, 버너 블로워가 돌면 은은한 불꽃 */
function Burner({ cx, on }) {
  return (
    <g>
      <Box x={cx - 15} y={226} w={30} h={16} d={10} m="steel" />
      <circle cx={cx - 6} cy={234} r={3.4} className="m2-port" />
      {on && (
        <g className="m2-flame">
          <ellipse cx={cx + 7} cy={232} rx={7} ry={9} fill="url(#m2-flame)" filter="url(#m2-soft)" />
          <path d={`M${cx + 5} 239 q3 -7 1 -12 q6 5 4 12 z`} className="m2-flame-core" />
        </g>
      )}
    </g>
  );
}

/**
 * 탱크 — 앞면 유리 단면. 안쪽 벽(뒤 · 왼쪽) → 액체(앞면 부피 + 액면) → 오른쪽 옆면(강철) → 앞 유리 · 윗 테두리 순으로 겹친다.
 * active: 액면 잔물결, bubbles: 기포, agitator: 교반기 축 + 프로펠러(깊이 가운데)
 */
function Tank({ id, x, y, w, h, kind, active, bubbles, agitator, d = 24 }) {
  const [ox, oy] = off(d);
  const lv = y + 14;
  const bottom = y + h;
  const surface = [[x, lv], [x + w, lv], [x + w + ox, lv + oy], [x + ox, lv + oy]];
  return (
    <g className={`m2-tank is-${kind}${active ? ' is-active' : ''}`}>
      <Shadow x={x} w={w} d={d} />
      <polygon className="m2-tank-back" points={P([[x + ox, y + oy], [x + w + ox, y + oy], [x + w + ox, bottom + oy], [x + ox, bottom + oy]])} />
      <polygon className="m2-tank-left" points={P([[x, y], [x + ox, y + oy], [x + ox, bottom + oy], [x, bottom]])} />
      {/* 액체 */}
      <rect x={x} y={lv} width={w} height={bottom - lv} fill={`url(#m2-liq-${kind})`} className="m2-liquid" />
      <polygon points={P(surface)} className="m2-surface" />
      <defs><clipPath id={`m2-clip-${id}`}><polygon points={P(surface)} /></clipPath></defs>
      <g clipPath={`url(#m2-clip-${id})`}>
        <g className="m2-ripple">
          {[0.25, 0.55, 0.8].map((t) => {
            const yy = lv + oy * t;
            const xx = x + ox * t;
            return <path key={t} d={`M${xx - w} ${yy} q ${w / 8} -1.6 ${w / 4} 0 t ${w / 4} 0 t ${w / 4} 0 t ${w / 4} 0 t ${w / 4} 0 t ${w / 4} 0 t ${w / 4} 0 t ${w / 4} 0`} className="m2-ripple-line" style={{ '--m2-p': `${w / 2}px` }} />;
          })}
        </g>
      </g>
      {agitator && (
        <g>
          <line x1={agitator.x + ox / 2} x2={agitator.x + ox / 2} y1={y + oy / 2 - 4} y2={bottom - 14 + oy / 2} className="m2-shaft" />
          <Impeller cx={agitator.x + ox / 2} cy={bottom - 14 + oy / 2} on={agitator.on} />
        </g>
      )}
      {bubbles && (
        <g>
          <defs><clipPath id={`m2-clip-b-${id}`}><rect x={x} y={lv} width={w} height={bottom - lv} /></clipPath></defs>
          <g clipPath={`url(#m2-clip-b-${id})`}>
            {[0.2, 0.38, 0.6, 0.78].map((fx, i) => (
              <circle key={fx} cx={x + w * fx + ox * 0.4} cy={bottom - 4} r={1.3 + (i % 2) * 0.5} className="m2-bubble"
                style={{ '--m2-rise': `${-(bottom - lv - 8)}px`, animationDelay: `${i * 1.1}s` }} />
            ))}
          </g>
        </g>
      )}
      <polygon className="m2-face-side m2-tank-side" points={P([[x + w, y], [x + w + ox, y + oy], [x + w + ox, bottom + oy], [x + w, bottom]])} />
      <rect x={x} y={y} width={w} height={h} fill="url(#m2-glass)" className="m2-tank-glass" />
      <polygon className="m2-tank-rim" points={P([[x, y], [x + w, y], [x + w + ox, y + oy], [x + ox, y + oy]])} />
      <rect x={x} y={bottom - 4} width={w} height={4} className="m2-tank-base" />
    </g>
  );
}

/**
 * 세정 노즐줄 — 탱크 깊이 가운데 위 헤더 배관 + 노즐. 운전 중이면 노즐마다 부채꼴 물줄기(반짝임)와 떨어지는 물방울.
 * fall: 물줄기 길이
 */
function SprayBar({ x1, x2, y, nozzles, on, d = 24, fall = 20 }) {
  const [ox, oy] = off(d / 2);
  return (
    <g transform={`translate(${ox} ${oy})`} className={`m2-sprayer${on ? ' is-on' : ''}`}>
      <line x1={x1} y1={y} x2={x2} y2={y} className="m2-hdr" />
      <line x1={x1} y1={y - 0.8} x2={x2} y2={y - 0.8} className="m2-hdr-hi" />
      {nozzles.map((nx, i) => (
        <g key={nx}>
          {on && (
            <g>
              <path d={`M${nx - 1.4} ${y + 5} L${nx - 7} ${y + fall} Q${nx} ${y + fall + 3} ${nx + 7} ${y + fall} L${nx + 1.4} ${y + 5} Z`}
                fill="url(#m2-spray-cone)" className="m2-spray-cone" style={{ animationDelay: `${i * 0.3}s` }} />
              {[-4.5, -1.5, 1.5, 4.5].map((dx, k) => (
                <circle key={dx} cx={nx + dx * 0.4} cy={y + 6} r={0.8} className="m2-spray-drop"
                  style={{ '--m2-dx': `${dx * 1.4}px`, '--m2-dy': `${fall - 4}px`, animationDelay: `${(k * 0.23 + i * 0.11) % 0.9}s` }} />
              ))}
            </g>
          )}
          <rect x={nx - 2} y={y + 1} width={4} height={2.6} rx={0.6} className="m2-nozzle-body" />
          <path d={`M${nx - 1.6} ${y + 3.6} h3.2 l-0.8 1.6 h-1.6 z`} className="m2-nozzle" />
        </g>
      ))}
    </g>
  );
}

/**
 * 스프레이 펌프 — 바닥에 놓인 가로형 원심 펌프(받침판 · 모터 · 커플링 · 볼류트) + 토출 배관이 탱크 위 헤더까지.
 * x: 볼류트 중심, to: 헤더 시작점([x, y], 깊이 가운데 기준 화면 좌표), dir: 모터가 놓이는 쪽(1 오른쪽, -1 왼쪽). 운전 중이면 배관 안으로 물이 흐른다
 */
function SprayPump({ x, to, on, dir = 1 }) {
  const by = FLOOR_Y - 4;
  const cy = by - 7;
  const mx = dir > 0 ? x + 8 : x - 24;
  const pipe = `M${x} ${cy - 6} V${to[1]} H${to[0]}`;
  return (
    <g className={`m2-pump${on ? ' is-on' : ''}`}>
      <Shadow x={Math.min(x, mx) - 8} w={34} d={12} />
      <Box x={Math.min(x, mx) - 8} y={by} w={34} h={4} d={12} m="dark" />
      <path d={pipe} className="m2-pipe2" />
      <path d={pipe} className="m2-pipe2-hi" />
      {on && <path d={pipe} className="m2-pipe-flow" />}
      {/* 모터(가로 원통) + 끝 냉각팬 덮개 */}
      <rect x={mx} y={cy - 5.5} width={16} height={11} rx={1.5} fill="url(#m2-motor-h)" className="m2-pump-motor" />
      {[3, 6, 9, 12].map((fx) => <line key={fx} x1={mx + fx} x2={mx + fx} y1={cy - 4.5} y2={cy + 4.5} className="m2-pump-fin" />)}
      <ellipse cx={dir > 0 ? mx + 16 : mx} cy={cy} rx={2.2} ry={5.5} className="m2-pump-cap" />
      {/* 커플링 + 볼류트(달팽이 케이싱) */}
      <rect x={dir > 0 ? x + 4 : x - 8} y={cy - 2} width={4} height={4} className="m2-pump-coupling" />
      <circle cx={x} cy={cy} r={6.5} fill="url(#m2-steel-front)" className="m2-pump-volute" />
      <circle cx={x} cy={cy} r={2.6} className="m2-pump-eye" />
      <rect x={x - 2.2} y={cy - 9} width={4.4} height={3} rx={0.6} className="m2-pump-flange" />
    </g>
  );
}

/** 램프 — 아이콘 타일. 운전이면 배경 연초록, 정지는 흰색, 알람은 연빨강 깜박임 */
function Lamp({ lamp, state, onHover }) {
  const y = LAMP_Y[lamp.row];
  const lines = lamp.label.split('\n');
  const top = lamp.row === 'top';
  const textY = top ? y - 20 - (lines.length - 1) * 11 : y + 25;
  const Icon = iconOf(lamp);
  return (
    <g
      className={`m2-lamp is-${state}`}
      transform={`translate(${lamp.x} ${y})`}
      onMouseEnter={(e) => onHover(lamp, e.currentTarget)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      onFocus={(e) => onHover(lamp, e.currentTarget)}
      onBlur={() => onHover(null)}
      role="img"
      aria-label={`${lamp.full} ${STATE_LABEL[state] ?? '확인 불가'}`}
    >
      <rect x={-12} y={-11} width={24} height={24} rx={6} className="m2-lamp-shadow" />
      <rect x={-12} y={-12} width={24} height={24} rx={6} className="m2-lamp-tile" />
      <Icon x={-7.5} y={-7.5} size={15} stroke={1.7} className="m2-lamp-icon" aria-hidden="true" />
      <rect x={-22} y={-22} width={44} height={44} className="m2-lamp-hit" />
      <text y={textY - y} className="m2-lamp-text">
        {lines.map((t, i) => <tspan key={t} x={0} dy={i === 0 ? 0 : 11}>{t}</tspan>)}
      </text>
    </g>
  );
}

export default function Mbf2Mimic({ state, title, note, temps, charge }) {
  const wrapRef = useRef(null);
  const [tip, setTip] = useState(null);
  const on = (id) => state[id] === 'run';
  const counts = useMemo(() => {
    const c = { run: 0, stop: 0, alarm: 0 };
    LAMPS.forEach((l) => { c[state[l.id] ?? 'stop'] += 1; });
    return c;
  }, [state]);
  const lineRunning = on('L13');
  const [fox, foy] = off(36);

  const hover = (lamp, el) => {
    if (!lamp) { setTip(null); return; }
    const box = wrapRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setTip({ lamp, x: r.left + r.width / 2 - box.left, y: lamp.row === 'top' ? r.bottom - box.top + 6 : r.top - box.top - 6 });
  };

  return (
    <div className="mb-wrap m2-wrap" ref={wrapRef}>
      <div className="mb-legend m2-legend">
        {title && <b className="mb-legend-title">{title}</b>}
        <span className="m2-legend-item is-run"><i />운전 <b>{counts.run}</b></span>
        <span className="m2-legend-item is-stop"><i />정지 <b>{counts.stop}</b></span>
        <span className="m2-legend-item is-alarm"><i />알람 <b>{counts.alarm}</b></span>
        <span className={`mb-legend-flow${lineRunning ? ' is-on' : ''}`}>{lineRunning ? '라인 이송 중' : '라인 이송 정지'}</span>
        {note && <span className="mb-legend-note">{note}</span>}
      </div>

      <svg className="mb-svg m2-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="MBF2호기 설비 운전 상태(입체 도면)">
        <Defs />
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#m2-grid)" />

        {/* 구간 — 아래 이름 + 가는 구분선 */}
        {ZONES.map((z, i) => (
          <g key={z.key}>
            {i > 0 && <line x1={z.x} x2={z.x} y1={18} y2={VIEW_H - 8} className="m2-zone-line" />}
            <text x={z.x + z.w / 2} y={VIEW_H - 24} className="m2-zone-name">{z.name}</text>
            <text x={z.x + z.w / 2} y={VIEW_H - 11} className="m2-zone-en">{z.en}</text>
          </g>
        ))}

        {/* 바닥 판 — 윗면 + 앞 두께 */}
        <polygon className="m2-floor-top" points={P([[12, FLOOR_Y], [VIEW_W - 30, FLOOR_Y], [VIEW_W - 30 + fox, FLOOR_Y + foy], [12 + fox, FLOOR_Y + foy]])} />
        <rect x={12} y={FLOOR_Y} width={VIEW_W - 42} height={4} className="m2-floor-edge" />

        {/* ── 재료 투입: 롤러 길로 철통 도착 → 저울 계량(무게 신호) → 승강기 신호에 올라가 붓기 → 내려와 빈 통 배출 ── */}
        <WeighIndicator weight={charge?.weight} phase={charge?.phase} on={on('L01')} />
        <Hoist on={on('L01')} phase={charge?.phase} />
        <Chute x1={88} y1={150} x2={122} y2={192} d={11} />
        {on('L01') && charge?.phase === 'dump' && <HoistDump />}

        {/* ── 진동 피더: 호퍼 → 경사 벨트 → 전세정기로 슈트 ── */}
        <Hopper x={114} y={192} w={46} h={32} />
        <FeederIncline x1={146} y1={242} x2={206} y2={152} on={on('L03')} />
        <Box x={203} y={136} w={15} h={11} d={10} m="dark" />
        <line x1={210} y1={147} x2={206} y2={152} className="m2-shaft" />
        <Chute x1={210} y1={154} x2={246} y2={184} d={12} />

        {/* ── 전세정기 → 메시 벨트 적재대 → 소입로 입구 ── */}
        <Tank id="fwash" x={230} y={176} w={104} h={76} kind="water" active={on('L07') || on('L08')} />
        <SprayPump x={344} to={[318 + off(12)[0], 168 + off(12)[1]]} on={on('L07')} />
        <SprayBar x1={240} x2={318} y={168} nozzles={[252, 276, 300]} on={on('L07')} fall={24} />
        <Box x={352} y={190} w={12} h={16} d={8} m="steel" className={on('L05') ? 'is-on' : ''} />
        <Conveyor x1={244} y1={238} x2={390} y2={174} on={on('L06')} />
        <LoadTable x1={368} x2={402} y={205} />
        <Chute x1={392} y1={178} x2={386} y2={202} d={12} />

        {/* ── 소입로 → 소입 슈트(로 옆면에서 기름 속으로) → 유조 ── */}
        <Furnace id="q" x={420} w={252} kind="quench" zones={4} hot={on('L13') || on('L12')} burnerOn={on('L12')} temps={temps?.quench}
          fans={[{ x: 480, on: on('L09') }, { x: 600, on: on('L10') }]} />
        <Cyl cx={444} y1={96} y2={132} rx={7} m="steel" />
        {on('L11') && <g className="m2-smoke"><circle cx={446} cy={84} r={5} /><circle cx={451} cy={74} r={4} /><circle cx={445} cy={65} r={3} /></g>}
        <Burner cx={530} on={on('L12')} />

        {/* ── 유조 ── */}
        <Tank id="oil" x={704} y={208} w={128} h={44} kind="oil" active={on('L14') || on('L15') || on('L16')} bubbles={on('L14')}
          agitator={{ x: 752, on: on('L14') }} />
        <QuenchChute />
        <Box x={734} y={202} w={66} h={5} d={24} m="steel" />
        <Cyl cx={762} y1={178} y2={202} rx={9} m="dark" />
        <Conveyor x1={776} y1={240} x2={900} y2={164} on={on('L19')} />
        <Box x={856} y={226} w={24} h={26} d={12} m="steel">
          <path d="M860 234 l3.5 6 l3.5 -6 l3.5 6 l3.5 -6 l3.5 6" className={`m2-hx${on('L18') ? ' is-on' : ''}`} />
        </Box>

        {/* ── 유절 컨베이어(기름 털기) + 아래 유절 블로워 → 중간세정기로 슈트 ── */}
        <line x1={922} y1={182} x2={922} y2={FLOOR_Y} className="m2-leg-line" />
        <line x1={990} y1={182} x2={990} y2={FLOOR_Y} className="m2-leg-line" />
        <Box x={914} y={176} w={80} h={6} d={13} m="steel" />
        <Conveyor x1={900} y1={164} x2={1002} y2={164} on={on('L20')} />
        {on('L20') && [930, 954, 978].map((dx) => <circle key={dx} cx={dx} cy={188} r={1.6} className="m2-drop" />)}
        <Shadow x={942} w={30} d={12} />
        <Box x={942} y={228} w={30} h={24} d={12} m="steel" />
        <Cyl cx={950 + off(6)[0]} y1={216} y2={228 + off(6)[1]} rx={5.5} m="dark" />
        <Box x={962} y={194} w={6} h={34} d={6} m="steel" />
        <Box x={940} y={189} w={34} h={5} d={10} m="steel" />
        {on('L21') && [946, 956, 966].map((ax) => <path key={ax} d={`M${ax + 4} 186 v-6`} className="m2-air" />)}
        <Chute x1={1004} y1={168} x2={1054} y2={192} d={12} />

        {/* ── 중간세정기 → 적재대 → 소려로 입구 ── */}
        <Tank id="mwash" x={1042} y={184} w={96} h={68} kind="water" active={on('L25') || on('L26')} />
        <Box x={1158} y={196} w={12} h={16} d={8} m="steel" />
        <SprayPump x={1148} to={[1120 + off(12)[0], 176 + off(12)[1]]} on={on('L26')} />
        <SprayBar x1={1050} x2={1120} y={176} nozzles={[1062, 1086, 1110]} on={on('L26')} fall={22} />
        <Conveyor x1={1052} y1={238} x2={1192} y2={180} on={on('L24')} />
        <LoadTable x1={1170} x2={1204} y={205} />
        <Chute x1={1194} y1={184} x2={1188} y2={202} d={12} />

        {/* ── 소려로 → 슈트 → 방청조 ── */}
        <Furnace id="t" x={1222} w={380} kind="temper" zones={5} hot={on('L32') || on('L31')} burnerOn={on('L31')} temps={temps?.temper}
          fans={[['L27', 1290], ['L28', 1382], ['L29', 1474], ['L30', 1566]].map(([fid, fx]) => ({ x: fx, on: on(fid) }))} />
        <Burner cx={1350} on={on('L31')} />

        {/* ── 방청조 → 제품 상자 ── */}
        <Tank id="rust" x={1644} y={214} w={84} h={38} kind="rust" active={on('L33') || on('L35')} d={22} />
        <SprayPump x={1626} dir={-1} to={[1652 + off(11)[0], 206 + off(11)[1]]} on={on('L35')} />
        <Chute x1={1600} y1={204} x2={1660} y2={224} d={20} />
        <SprayBar x1={1652} x2={1716} y={206} nozzles={[1664, 1686, 1708]} on={on('L35')} d={22} fall={18} />
        <Conveyor x1={1660} y1={242} x2={1770} y2={198} on={on('L34')} />
        <Bin x={1758} y={222} w={26} h={30} />

        {/* 제품 흐름 — 라인 이송 중일 때만 */}
        {lineRunning && <ProductFlow />}

        {/* 램프 */}
        {LAMPS.map((l) => <Lamp key={l.id} lamp={l} state={state[l.id] ?? 'stop'} onHover={hover} />)}
      </svg>

      {tip && (
        <div className={`mb-tip is-${tip.lamp.row} is-${state[tip.lamp.id] ?? 'stop'}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
          <b>{tip.lamp.full}</b>
          <span>{zoneOf.get(tip.lamp.zone)?.name} · <em>{STATE_LABEL[state[tip.lamp.id]] ?? '확인 불가'}</em></span>
          <small>PLC 주소 {tip.lamp.tag || '미지정'}</small>
        </div>
      )}
    </div>
  );
}
