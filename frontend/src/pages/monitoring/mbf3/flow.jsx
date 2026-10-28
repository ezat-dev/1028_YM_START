import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EQ, BELT_Y, VEST, PIT, CHUTES, feedY } from './layout3d';
import { BoltPile, chuteCurve } from './parts';

/*
 * MBF3호기 제품 흐름(3D) — 호퍼 배출구부터 제품 상자까지 장비 윗면을 지나는 한 줄 경로. LOT = 5덩어리, LOT 사이는 넓게.
 *  - 점: [x, y, 보임(false면 장비 속), 속도 배수, 이름(색 바뀌는 시점)]
 *  - 떨어짐 · 슈트는 빠르게(FALL), 진동 피더는 트레이처럼 천천히(FEED), 로 안은 천천히(SLOW) — 로 안은 앞 유리 점검창으로 보인다
 *  - 색: 소입로에서 달아올라(주황 + 빛) 기름 속에서 식음, 유조에서 기름 막 → 중간세정기에서 씻김, 소려로에서 은은한 호박색 → 방청조에서 식음
 */

const FALL = 3;
const FEED = 0.5;
const SLOW = 0.55;
const SPEED = 0.8; // 기본 속도(단위/초)
const pt = (x, y, show = true, speed = 1, mark) => ({ x, y, show, speed, mark });

const { hopper, conv, feeder, fwash, quench, oil, sep, mwash, temper, rust, bin } = EQ;
/** 연결 슈트(CHUTES) 곡선 위 — 바닥에서 조금 띄운 점 n개(첫 점 제외), 마지막 점에 이름 */
function onChute(key, speed, mark, n = 8) {
  const [a, b] = CHUTES[key];
  const c = chuteCurve(a, b);
  return Array.from({ length: n }, (_, k) => {
    const u = (k + 1) / n;
    const p = c.getPoint(u);
    const tg = c.getTangent(u);
    return pt(p.x - tg.y * 0.06, p.y + tg.x * 0.06, true, speed, k === n - 1 ? mark : undefined);
  });
}
const PTS = [
  pt(hopper.x, hopper.out + 0.3),
  pt(hopper.x, hopper.out - 0.25, false, 1), //                          호퍼 목 속
  pt(hopper.x + 0.12, conv.y + 0.06, true, FALL), //                    투입 컨베이어 위로
  pt(conv.x1 - 0.05, conv.y + 0.06, true, 1),
  pt(conv.x1 + 0.3, feedY(conv.x1 + 0.3) + 0.1, true, FALL), //          진동 피더 아래 끝으로
  pt(feeder.x1 - 0.1, feedY(feeder.x1 - 0.1) + 0.1, true, FEED),
  ...onChute('feeder', 2),
  pt(fwash.x0 + 0.7, 0.71 - PIT, false, FALL),
  pt(fwash.outX, fwash.outY + 0.06),
  pt(fwash.outX + 0.3, BELT_Y + 0.06, true, FALL),
  pt(quench.x0 - VEST - 0.05, BELT_Y + 0.06),
  pt(quench.x0 + 0.12, BELT_Y + 0.06, false, 1, 'qIn'),
  pt(quench.x1 - 0.12, BELT_Y + 0.06, true, SLOW, 'qOut'),
  pt(quench.x1 + 0.05, BELT_Y + 0.11, false),
  ...onChute('quench', 1.6, 'oilIn'), //      열린 소입 슈트를 미끄러져 기름 면까지(보임)
  pt(oil.conv[0], oil.conv[1] + 0.06, false, FALL),
  pt(oil.top[0], oil.top[1] + 0.06, true, 1, 'oilOut'),
  pt(sep.x1, sep.y + 0.06),
  ...onChute('sep', 2),
  pt(mwash.x0 + 0.75, 1.15 - PIT, true, FALL, 'mwIn'),
  pt(mwash.x0 + 0.8, 0.71 - PIT, false, FALL),
  pt(mwash.outX, mwash.outY + 0.06, true, 1, 'mwOut'),
  pt(mwash.outX + 0.3, BELT_Y + 0.06, true, FALL),
  pt(temper.x0 - VEST - 0.05, BELT_Y + 0.06),
  pt(temper.x0 + 0.12, BELT_Y + 0.06, false, 1, 'tIn'),
  pt(temper.x1 - 0.12, BELT_Y + 0.06, true, SLOW, 'tOut'),
  pt(temper.x1 + 0.12, BELT_Y + 0.06, false),
  pt(rust.x0 + 0.1, BELT_Y + 0.06),
  pt(rust.x0 + 0.7, rust.convY + 0.06, true, FALL, 'rsIn'), //   방청조 컨베이어(액면 바로 아래) 위로
  pt(rust.outX, rust.outY + 0.06, true, 1, 'rsOut'),
  pt(bin.x, 0.75, true, FALL),
  pt(bin.x, 0.55, false, FALL),
];

// 구간별 시간 · 누적 · 이름 붙은 시점(시간 비율)
const SEG = PTS.slice(1).map((p, i) => {
  const a = PTS[i];
  const len = Math.hypot(p.x - a.x, p.y - a.y);
  return { a, b: p, len, time: len / (SPEED * p.speed), show: p.show };
});
const TOTAL = SEG.reduce((n, s) => n + s.time, 0);
const START = [];
SEG.reduce((t, s) => { START.push(t); return t + s.time; }, 0);
const MARK = {};
PTS.forEach((p, i) => { if (p.mark) MARK[p.mark] = i === 0 ? 0 : START[i - 1] + SEG[i - 1].time; });

const LOT_SIZE = 5;
const PITCH = 0.75; // LOT 안 덩어리 사이(초)
const LOT_COUNT = Math.max(1, Math.round(TOTAL / 20));
const LOT_PERIOD = TOTAL / LOT_COUNT;
const SPREAD = [-0.16, 0.12, -0.04, 0.17, -0.1]; // 벨트 위 앞뒤로 조금씩

const CHUNKS = Array.from({ length: LOT_COUNT * LOT_SIZE }, (_, n) => {
  const j = n % LOT_SIZE;
  return { offset: Math.floor(n / LOT_SIZE) * LOT_PERIOD + j * PITCH, z: SPREAD[j] };
});
const pathTime = (now, offset) => (now + TOTAL - (offset % TOTAL)) % TOTAL;


/** 유조 — 덩어리가 기름에 빠지는 자리(X)와, 지금(now)부터 within초 안에 빠진 덩어리의 [지난 초, Z] 목록. 기름 출렁임용 */
export const OIL_DROP_X = oil.x0 + 0.8;
export function oilDrops(now, within) {
  const out = [];
  CHUNKS.forEach(({ offset, z }) => {
    const age = (pathTime(now, offset) - MARK.oilIn + TOTAL) % TOTAL;
    if (age < within) out.push([age, z]);
  });
  return out;
}

/** t초 → 위치 · 보임 */
function locate(t, out) {
  let i = SEG.length - 1;
  for (let k = 0; k < SEG.length; k += 1) { if (t < START[k] + SEG[k].time) { i = k; break; } }
  const s = SEG[i];
  const u = Math.min(1, Math.max(0, (t - START[i]) / s.time));
  out.set(s.a.x + (s.b.x - s.a.x) * u, s.a.y + (s.b.y - s.a.y) * u, 0);
  return s.show;
}

// 색 바뀜 비율(0~1) — 오르고 · 머물고 · 내리는 구간
const ramp = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
function tints(t) {
  const heat = t < MARK.qIn ? 0
    : t < MARK.qOut ? ramp(t, MARK.qIn, MARK.qOut)
      : t < MARK.oilIn ? 1 : 1 - ramp(t, MARK.oilIn, MARK.oilIn + (MARK.oilOut - MARK.oilIn) * 0.45);
  const film = t < MARK.oilIn ? 0 : t < MARK.mwIn ? 0.55 : 0.55 * (1 - ramp(t, MARK.mwIn, MARK.mwIn + (MARK.mwOut - MARK.mwIn) * 0.5));
  const warm = t < MARK.tIn ? 0
    : t < MARK.tOut ? 0.7 * ramp(t, MARK.tIn, MARK.tOut)
      : t < MARK.rsIn ? 0.7 : 0.7 * (1 - ramp(t, MARK.rsIn, MARK.rsIn + (MARK.rsOut - MARK.rsIn) * 0.6));
  return { heat, film, warm };
}

const BASE = new THREE.Color('#b3bcc6');
const HOT = new THREE.Color('#ff6a2a');
const OILY = new THREE.Color('#6b4a1f');
const WARM = new THREE.Color('#f0a33a');
const EMIT = new THREE.Color('#ff4a10');

/** 흐르는 LOT — 덩어리(볼트 · 너트 뭉치)마다 재질 하나(색이 따로 바뀌므로). 움직임 줄이기 설정이면 그리지 않는다 */
export default function ProductFlow({ running }) {
  const refs = useRef([]);
  const reduce = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
  const chunks = useMemo(() => CHUNKS.map((c, n) => ({
    ...c,
    key: n,
    mat: new THREE.MeshStandardMaterial({ color: BASE.clone(), metalness: 0.6, roughness: 0.4, emissive: EMIT.clone(), emissiveIntensity: 0 }),
  })), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    chunks.forEach((c, n) => {
      const m = refs.current[n];
      if (!m) return;
      const t = pathTime(now, c.offset);
      const show = locate(t, tmp);
      m.visible = show;
      m.position.set(tmp.x, tmp.y, c.z);
      const { heat, film, warm } = tints(t);
      c.mat.color.copy(BASE).lerp(OILY, film).lerp(WARM, warm).lerp(HOT, heat * 0.85);
      c.mat.emissiveIntensity = heat * 0.9;
    });
  });
  if (!running || reduce) return null;
  return (
    <group>
      {chunks.map((c, n) => (
        <group key={c.key} ref={(el) => { refs.current[n] = el; }}>
          <BoltPile m={c.mat} rot={n * 1.3} />
        </group>
      ))}
    </group>
  );
}
