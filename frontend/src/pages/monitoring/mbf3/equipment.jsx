import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { MAT, Box, Cyl, Beam, Stand, Railing, Motor, Belt, Chute, BoltPile, chuteCurve } from './parts';
import { EQ, BELT_Y, VEST, PIT, PITS, CHUTES, LIP_Y } from './layout3d';
import { SHOW_WEIGHT, WEIGH_STATE } from '../integrated/charge';
import { OIL_DROP_X, oilDrops } from './flow';

/*
 * MBF3호기 3D 설비 — CAD 참고 그림(소입로 · 유조 · 진동 피더 · 세정기 · 소려로 · 컨베이어)을 단순화해 옮긴 것.
 * 각 설비는 라인 위 자기 자리(EQ)에 놓이고, 운전 상태(on · hot …)에 따라 움직인다.
 */

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ease = (v) => { const k = Math.min(1, Math.max(0, v)); return k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2; };
const now = () => performance.now() / 1000;

/* ───────────────────────── 재료 투입: 롤러 길 · 저울 · 승강기 · 철통 · 계량기 ───────────────────────── */

const BIN_IN = 3.9; // 철통이 들어오기 전 왼쪽 거리
const POUR = 48; // 쏟아지는 볼트 · 너트 수
const G = 7.5; // 보기 좋게 줄인 중력(단위/초²)
const TILT = 1.05; // 붓는 기울기(rad)
const TILT_S = 0.9; // 기울이는 시간(초)
const GRAIN_G = {
  shank: new THREE.CylinderGeometry(0.024, 0.024, 0.2, 8),
  head: new THREE.CylinderGeometry(0.05, 0.05, 0.04, 6),
  nut: new THREE.TorusGeometry(0.04, 0.02, 6, 6),
};
const rnd = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

/**
 * 붓는 알갱이 하나의 길 — 철통 입구에서 튀어나와 포물선으로 떨어져 받는 슈트에 닿고(1),
 * 슈트 곡선을 따라 점점 빨라지며 미끄러져(2), 끝에서 슈트 방향 그대로 호퍼 속으로 떨어진다(3). 시각은 쏟기 시작부터(초)
 */
function pourPlan(i, lipX, curve, hopTop) {
  const len = curve.getLength();
  const lut = Array.from({ length: 41 }, (_, k) => curve.getPointAt(k / 40));
  const surfY = (x) => {
    for (let k = 0; k < 40; k += 1) {
      const a = lut[k];
      const b = lut[k + 1];
      if (x <= b.x) return a.y + ((b.y - a.y) * Math.max(0, x - a.x)) / Math.max(1e-4, b.x - a.x);
    }
    return lut[40].y;
  };
  const start = 0.32 + (i / POUR) * 0.95 + rnd(i, 1) * 0.06; // 기울어지는 동안부터 엇갈려 나온다
  const p0 = [lipX + rnd(i, 2) * 0.12, LIP_Y + 0.02 + rnd(i, 3) * 0.06];
  const v0 = [1.3 + rnd(i, 4) * 0.6, 0.15 + rnd(i, 5) * 0.35];
  let t1 = 0.6;
  for (let tt = 0.02; tt < 1.2; tt += 0.01) {
    const x = p0[0] + v0[0] * tt;
    if (x > lut[0].x && p0[1] + v0[1] * tt - (G * tt * tt) / 2 <= surfY(x) + 0.05) { t1 = tt; break; }
  }
  const landX = p0[0] + v0[0] * t1;
  let s1 = 0;
  for (let k = 0; k < 40; k += 1) if (lut[k + 1].x <= landX) s1 = ((k + 1) / 40) * len;
  const vs = 0.9;
  const as = 4.5;
  const t2 = (-vs + Math.sqrt(vs * vs + 2 * as * (len - s1))) / as; // 슈트 미끄러짐 시간
  const vEnd = vs + as * t2;
  const tEnd = curve.getTangentAt(1);
  const fallY = curve.getPointAt(1).y - (hopTop - 0.3);
  const vy = -tEnd.y * vEnd;
  const t3 = (-vy + Math.sqrt(vy * vy + 2 * G * fallY)) / G; // 호퍼 속까지
  return { start, p0, v0, t1, s1, len, vs, as, t2, vEnd, tEnd, t3, z0: (rnd(i, 6) - 0.5) * 0.6, z1: (rnd(i, 7) - 0.5) * 0.7, spin: [2 + rnd(i, 8) * 6, 3 + rnd(i, 9) * 5] };
}

/**
 * 재료 투입 — 철통이 롤러 길로 들어와 저울에서 계량 → 승강기 신호에 올라가 기울여 슈트로 붓고 → 내려와 빈 통으로 나간다.
 * phase · weight는 integrated/charge.js 단계. 철통 움직임은 단계가 바뀐 시각부터 계산(useFrame)
 */
export function ChargeArea({ on, phase, weight }) {
  const { x: X, top, rise } = EQ.hoist;
  const bin = useRef();
  const tilt = useRef();
  const fill = useRef();
  const grains = useRef([]);
  const t0 = useRef(now());
  const dumpAt = useRef(-99);
  const reduce = useMemo(reduceMotion, []);
  useEffect(() => {
    t0.current = now();
    if (phase === 'dump') dumpAt.current = t0.current;
  }, [phase]);
  // 받는 슈트 — 탑 오른쪽 바로 바깥, 철통 입구 조금 아래에서 호퍼 위까지(둥근 곡선)
  const [chuteA, chuteB] = CHUTES.hoist;
  const curve = useMemo(() => chuteCurve(chuteA, chuteB), [chuteA, chuteB]);
  const plans = useMemo(() => Array.from({ length: POUR }, (_, i) => pourPlan(i, X + 0.45, curve, EQ.hopper.top)), [X, curve]);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    let x = 0;
    let y = 0;
    let a = 0;
    let fillK = 1;
    const t = now() - t0.current;
    const run = on && !reduce;
    if (run) {
      if (phase === 'arrive') x = -BIN_IN * (1 - ease(t / 2.4));
      if (phase === 'lift') y = rise * ease(t / 2.6);
      if (phase === 'dump') { y = rise; a = -TILT * ease(t / TILT_S); fillK = 1 - Math.min(1, Math.max(0, (t - 0.3) / 1.1)); }
      if (phase === 'down') { a = -TILT * (1 - ease(t / 0.5)); y = rise * (1 - ease((t - 0.5) / 2.2)); fillK = 0; }
      if (phase === 'leave') { x = -BIN_IN * ease(t / 2); fillK = 0; }
    }
    if (bin.current) bin.current.position.set(X + x, 0.2 + y, 0);
    if (tilt.current) tilt.current.rotation.z = a;
    // 철통 속 더미 — 쏟는 만큼 줄어든다
    if (fill.current) {
      fill.current.visible = fillK > 0.02;
      fill.current.scale.set(1, Math.max(0.02, fillK), 1);
    }
    // 쏟아지는 볼트 · 너트 — 쏟기 시작부터 시간으로 계산(내려오는 동안에도 마저 떨어진다)
    const td = now() - dumpAt.current;
    const pouring = run && (phase === 'dump' || phase === 'down');
    grains.current.forEach((g, i) => {
      if (!g) return;
      const pl = plans[i];
      const tau = td - pl.start;
      g.visible = pouring && tau > 0 && tau < pl.t1 + pl.t2 + pl.t3;
      if (!g.visible) return;
      let z = pl.z0;
      if (tau < pl.t1) { // 1. 포물선
        g.position.set(pl.p0[0] + pl.v0[0] * tau, pl.p0[1] + pl.v0[1] * tau - (G * tau * tau) / 2, 0);
      } else if (tau < pl.t1 + pl.t2) { // 2. 슈트 따라 미끄러짐
        const u = tau - pl.t1;
        const s = Math.min(pl.len, pl.s1 + pl.vs * u + (pl.as * u * u) / 2);
        curve.getPointAt(s / pl.len, tmp);
        g.position.set(tmp.x, tmp.y + 0.05, 0);
        z = pl.z0 + (pl.z1 - pl.z0) * Math.min(1, u / pl.t2);
      } else { // 3. 호퍼 속으로
        const u = tau - pl.t1 - pl.t2;
        curve.getPointAt(1, tmp);
        g.position.set(tmp.x + pl.tEnd.x * pl.vEnd * u * 0.7, tmp.y + 0.05 + pl.tEnd.y * pl.vEnd * u - (G * u * u) / 2, 0);
        z = pl.z1;
      }
      g.position.z = z;
      g.rotation.set(tau * pl.spin[0], 0, tau * pl.spin[1]);
    });
  });

  const cols = [[X - 0.7, -0.55], [X + 0.7, -0.55], [X - 0.7, 0.55], [X + 0.7, 0.55]];
  // 탑 X 가새 — 바닥부터 머리 보까지 1.3 높이씩 고르게
  const nb = Math.max(1, Math.round((top - 0.5) / 1.4));
  const braces = Array.from({ length: nb }, (_, k) => 0.45 + (k * (top - 0.5 - 1.3)) / Math.max(1, nb - 1));
  const show = on && SHOW_WEIGHT.includes(phase) && weight != null;
  const [stText, stCls] = on ? (WEIGH_STATE[phase] ?? ['대기', '']) : ['정지', ''];
  return (
    <group>
      {/* 롤러 길 — 왼쪽에서 저울까지 */}
      <Box p={[X - 2.75, 0.14, 0]} s={[3.9, 0.12, 1.2]} m={MAT.frame} />
      {Array.from({ length: 10 }, (_, i) => X - 4.5 + i * 0.38).map((rx) => (
        <Cyl key={rx} p={[rx, 0.24, 0]} r={0.06} h={1.1} m={MAT.steelLight} rot={[Math.PI / 2, 0, 0]} />
      ))}
      {/* 저울판 */}
      <Box p={[X, 0.1, 0]} s={[1.3, 0.2, 1.15]} m={MAT.dark} />
      {/* 승강기 탑 — 기둥 넷 · 가새 · 머리 보 · 도르래 */}
      {cols.map(([cx, cz]) => <Box key={`${cx}${cz}`} p={[cx, top / 2, cz]} s={[0.16, top, 0.16]} m={MAT.steel} />)}
      {[-0.55, 0.55].map((cz) => braces.map((y0) => (
        <group key={`${cz}-${y0}`}>
          <Beam a={[X - 0.7, y0, cz]} b={[X + 0.7, y0 + 1.3, cz]} t={0.05} m={MAT.steelLight} />
          <Beam a={[X + 0.7, y0, cz]} b={[X - 0.7, y0 + 1.3, cz]} t={0.05} m={MAT.steelLight} />
        </group>
      )))}
      <Box p={[X + 0.25, top + 0.12, 0]} s={[2.0, 0.24, 1.35]} m={MAT.steelDark} />
      <Cyl p={[X, top + 0.42, 0]} r={0.28} h={0.18} m={MAT.steelLight} rot={[Math.PI / 2, 0, 0]} />
      {/* 받는 슈트 + 뒤 막이판(철통에서 쏟아진 부품을 받아 슈트로) */}
      <Chute a={chuteA} b={chuteB} w={1.0} h={0.3} />
      <Box p={[chuteA[0] + 0.02, chuteA[1] + 0.34, 0]} s={[0.05, 0.62, 1.04]} m={MAT.steel} r={[0, 0, -0.2]} />
      {/* 받는 슈트 받침 — 탑 기둥에 걸친 까치발 */}
      {[-0.45, 0.45].map((bz) => <Beam key={bz} a={[X + 0.7, chuteA[1] - 1.1, bz]} b={[chuteA[0] + 0.35, chuteA[1] - 0.12, bz]} t={0.06} m={MAT.steelLight} />)}
      {/* 철통 — 이동(bin) 안에 기울기(tilt, 오른쪽 위 모서리 축) */}
      <group ref={bin} position={[X, 0.2, 0]}>
        <group ref={tilt} position={[0.5, 1.0, 0]}>
          <group position={[-0.5, -1.0, 0]}>
            <Box p={[0, 0.03, 0]} s={[1.0, 0.06, 0.9]} m={MAT.steelDark} />
            <Box p={[0, 0.5, 0.43]} s={[1.0, 1.0, 0.04]} m={MAT.steel} />
            <Box p={[0, 0.5, -0.43]} s={[1.0, 1.0, 0.04]} m={MAT.steel} />
            <Box p={[0.48, 0.5, 0]} s={[0.04, 1.0, 0.9]} m={MAT.steel} />
            <Box p={[-0.48, 0.5, 0]} s={[0.04, 1.0, 0.9]} m={MAT.steel} />
            {[-0.25, 0, 0.25].map((rx) => <Box key={rx} p={[rx, 0.5, 0.46]} s={[0.05, 0.92, 0.03]} m={MAT.steelDark} />)}
            <Box p={[0, 1.0, 0.45]} s={[1.04, 0.06, 0.04]} m={MAT.steelDark} />
            <group ref={fill}>
              {[[-0.2, -0.15], [0.2, 0.12], [0, 0], [-0.1, 0.2], [0.22, -0.18]].map(([hx, hz]) => <BoltPile key={`${hx}${hz}`} p={[hx, 0.8, hz]} s={1.1} rot={hx * 7} />)}
            </group>
          </group>
        </group>
      </group>
      {/* 쏟아지는 볼트(긴 봉 + 육각 머리) · 너트(육각 고리) */}
      {Array.from({ length: POUR }, (_, i) => (
        <group key={i} ref={(el) => { grains.current[i] = el; }} visible={false}>
          {i % 3 === 0 ? (
            <mesh geometry={GRAIN_G.nut} material={MAT.steelLight} castShadow />
          ) : (
            <>
              <mesh geometry={GRAIN_G.shank} material={i % 2 ? MAT.steelLight : MAT.steel} castShadow />
              <mesh geometry={GRAIN_G.head} material={MAT.steelDark} position={[0, 0.09, 0]} />
            </>
          )}
        </group>
      ))}
      {/* 계량기 — 기둥 위 표시기 */}
      <Box p={[X - 2.2, 0.8, 1.25]} s={[0.12, 1.6, 0.12]} m={MAT.dark} />
      <Box p={[X - 2.2, 2.0, 1.25]} s={[1.6, 0.95, 0.3]} m={MAT.steel} />
      <Html transform position={[X - 2.2, 2.0, 1.41]} distanceFactor={5.8} zIndexRange={[20, 0]}>
        <div className="m3-scale">
          <div className={`m3-scale-num${on && phase === 'weigh' ? ' is-wait' : ''}`}>{show ? Math.round(weight).toLocaleString() : '---'}<small>kg</small></div>
          <div className={`m3-scale-state ${stCls}`}>{stText}</div>
        </div>
      </Html>
    </group>
  );
}

/* ───────────────────────── 노란 안전 난간 · 바닥(구덩이) ───────────────────────── */

/** 노란 안전 난간 — 꺾은선 [[x, z], …]을 따라 기둥 + 위 · 가운데 손잡이(바닥 y 위) */
export function YRail({ pts, y = 0, h = 1.0 }) {
  return (
    <group>
      {pts.slice(1).map(([bx, bz], i) => {
        const [ax, az] = pts[i];
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.3));
        return (
          <group key={`${ax}${az}`}>
            {Array.from({ length: n + 1 }, (_, k) => [ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]).map(([px, pz]) => (
              <Beam key={`${px}${pz}`} a={[px, y, pz]} b={[px, y + h, pz]} t={0.06} m={MAT.yellow} />
            ))}
            <Beam a={[ax, y + h, az]} b={[bx, y + h, bz]} t={0.06} m={MAT.yellow} />
            <Beam a={[ax, y + h * 0.5, az]} b={[bx, y + h * 0.5, bz]} t={0.05} m={MAT.yellow} />
          </group>
        );
      })}
    </group>
  );
}

/** 바닥 — 구덩이 자리를 뚫은 판(5칸마다 굵은 줄) + 구덩이 벽 · 바닥(콘크리트) + 노란 테두리 + 앞쪽 노란 난간 */
export function PitFloor() {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-90, -70); s.lineTo(90, -70); s.lineTo(90, 30); s.lineTo(-90, 30); s.closePath(); // 눈높이 시점에서 앞 · 뒤 끝이 안 보이게 넓게
    PITS.forEach((p) => {
      const h = new THREE.Path();
      h.moveTo(p.x0, -p.hz); h.lineTo(p.x1, -p.hz); h.lineTo(p.x1, p.hz); h.lineTo(p.x0, p.hz); h.closePath();
      s.holes.push(h);
    });
    return new THREE.ShapeGeometry(s);
  }, []);
  const mat = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#e9ecf0';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#d9dee4';
    g.lineWidth = 1;
    for (let i = 0; i <= 256; i += 51.2) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    g.strokeStyle = '#c6ccd4';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(0.2, 0.2);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  }, []);
  return (
    <group>
      <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
      {PITS.map((p) => {
        const L = p.x1 - p.x0;
        const cx = (p.x0 + p.x1) / 2;
        return (
          <group key={p.x0}>
            <Box p={[cx, -PIT - 0.05, 0]} s={[L, 0.1, p.hz * 2]} m={MAT.concreteDark} />
            <Box p={[cx, -PIT / 2, -p.hz]} s={[L, PIT, 0.08]} m={MAT.concrete} />
            <Box p={[cx, -PIT / 2, p.hz]} s={[L, PIT, 0.08]} m={MAT.concrete} />
            <Box p={[p.x0, -PIT / 2, 0]} s={[0.08, PIT, p.hz * 2]} m={MAT.concrete} />
            <Box p={[p.x1, -PIT / 2, 0]} s={[0.08, PIT, p.hz * 2]} m={MAT.concrete} />
            {/* 노란 테두리 */}
            <Box p={[cx, 0.01, p.hz + 0.08]} s={[L + 0.32, 0.03, 0.16]} m={MAT.yellow} cast={false} />
            <Box p={[cx, 0.01, -p.hz - 0.08]} s={[L + 0.32, 0.03, 0.16]} m={MAT.yellow} cast={false} />
            <Box p={[p.x0 - 0.08, 0.01, 0]} s={[0.16, 0.03, p.hz * 2]} m={MAT.yellow} cast={false} />
            <Box p={[p.x1 + 0.08, 0.01, 0]} s={[0.16, 0.03, p.hz * 2]} m={MAT.yellow} cast={false} />
            <YRail pts={[[p.x0 + 0.3, p.hz + 0.25], [p.x1 - 0.3, p.hz + 0.25]]} h={0.95} />
          </group>
        );
      })}
    </group>
  );
}

/* ───────────────────────── 호퍼 + 경사 진동 피더(현장 사진) ───────────────────────── */

const funnelMat = MAT.steel.clone();
funnelMat.side = THREE.DoubleSide;
const FEED_V = 0.4; // 부품이 올라가는 속도(제품 흐름 FEED와 같음)
const SPREAD_N = 16; // 피더 바닥에 흩어져 올라가는 부품 더미 수
const FEED_LEGS = [0.1, 0.52, 0.92]; // 받침 다리 자리(피더 길이 비율) — 아래 끝(받는 쪽)도 받친다

/**
 * 투입 호퍼(위 넓은 사각 깔때기) → 투입 컨베이어 → 경사 진동 피더. 피더는 칸막이 없는 낮은 테두리 홈통이라
 * 부품이 진동으로 통통 튀며 조금씩 엇갈려 올라가는 게 보인다. 아래는 막힌 하부 케이스, 받침 다리 위 방진 스프링.
 * 위 끝: 구동부와 노란 타원 벨트 덮개, 위 프레임 위 블로워, 아래쪽엔 노란 안전 난간
 */
export function HopperFeeder({ on }) {
  const { x: hx, top, out } = EQ.hopper;
  const { x0, y0, x1, y1 } = EQ.feeder;
  const cv = EQ.conv;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const W = 1.2;
  const parts = useRef();
  const deck = useRef();
  const reduce = useMemo(reduceMotion, []);
  // 더미마다 출발 자리 · 폭 자리 · 속도(조금씩 달라 엇갈림) · 튐 위상
  const seeds = useMemo(() => Array.from({ length: SPREAD_N }, (_, i) => ({
    u0: (i / SPREAD_N) * len, z: (rnd(i, 11) - 0.5) * (W - 0.35), v: FEED_V * (0.85 + rnd(i, 12) * 0.3), ph: rnd(i, 13) * 6.28,
  })), [len]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const run = on && !reduce;
    // 진동 — 바닥이 아주 작게 떨리고, 부품은 짧게 튀며 경사를 따라 올라간다
    if (deck.current) deck.current.position.y = run ? Math.sin(t * 90) * 0.004 : 0;
    parts.current?.children.forEach((c, i) => {
      const s = seeds[i];
      const u = run ? (s.u0 + t * s.v) % len : s.u0;
      c.position.set(-len / 2 + u, 0.03 + (run ? Math.abs(Math.sin(t * 14 + s.ph)) * 0.035 : 0), s.z);
      c.rotation.y = s.ph + (run ? Math.sin(t * 7 + s.ph) * 0.15 : 0);
      c.visible = on && u > 0.15 && u < len - 0.2;
    });
  });
  const at = (t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  return (
    <group>
      {/* 경사 몸통 — 기울인 그룹(X = 경사 방향) */}
      <group position={[(x0 + x1) / 2, (y0 + y1) / 2, 0]} rotation={[0, 0, ang]}>
        <group ref={deck}>
          <Box p={[0, -0.02, 0]} s={[len, 0.04, W]} m={MAT.belt} />
          {/* 낮은 테두리 + 둥근 윗테 — 칸막이 없음 */}
          {[W / 2 + 0.03, -(W / 2 + 0.03)].map((z) => (
            <group key={z}>
              <Box p={[0, 0.08, z]} s={[len + 0.06, 0.2, 0.05]} m={MAT.steel} />
              <Cyl p={[0, 0.19, z]} r={0.035} h={len + 0.06} m={MAT.steelLight} rot={[0, 0, Math.PI / 2]} />
            </group>
          ))}
          <Cyl p={[-len / 2, 0.03, 0]} r={0.06} h={W + 0.06} m={MAT.steelLight} rot={[Math.PI / 2, 0, 0]} />
          {/* 올라가는 부품 */}
          <group ref={parts}>
            {seeds.map((s, i) => <group key={i} visible={false}><BoltPile s={0.75} rot={s.ph} /></group>)}
          </group>
        </group>
        <Box p={[0, -0.24, 0]} s={[len - 0.1, 0.36, W - 0.05]} m={MAT.steelDark} />
        {/* 아래 테 · 방진 스프링(다리 위) */}
        {FEED_LEGS.map((k) => [0.5, -0.5].map((sz) => (
          <group key={`${k}${sz}`} position={[-len / 2 + len * k, -0.47, sz]}>
            {[0, 0.06, 0.12].map((sy) => (
              <mesh key={sy} position={[0, -sy, 0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.yellow}><torusGeometry args={[0.07, 0.018, 6, 14]} /></mesh>
            ))}
          </group>
        )))}
      </group>
      {/* 받침 다리 */}
      {FEED_LEGS.map((t) => {
        // 스프링 아래 끝(기울인 몸통 기준 법선 -0.62)에 닿는 세운 다리
        const [px, py] = at(t);
        const lx = px + 0.62 * Math.sin(ang);
        const ly = py - 0.62 * Math.cos(ang);
        return (
          <group key={t}>
            <Beam a={[lx, 0, 0.5]} b={[lx, ly, 0.5]} t={0.1} m={MAT.frame} />
            <Beam a={[lx, 0, -0.5]} b={[lx, ly, -0.5]} t={0.1} m={MAT.frame} />
            <Box p={[lx, ly, 0]} s={[0.22, 0.05, 1.12]} m={MAT.frame} />
            {ly > 0.6 && <Beam a={[lx, ly * 0.45, 0.5]} b={[lx, ly * 0.45, -0.5]} t={0.07} m={MAT.frame} />}
          </group>
        );
      })}
      {/* 위 끝 — 구동부 + 노란 타원 벨트 덮개 + 위 프레임 · 블로워 */}
      <Cyl p={[x1, y1, 0]} r={0.16} h={W + 0.2} m={MAT.steelLight} rot={[Math.PI / 2, 0, 0]} />
      <Motor p={[x1 + 0.1, y1 + 0.55, -0.95]} axis="z" len={0.4} r={0.15} m={MAT.steelDark} spin={on} />
      {[[x1 - 0.05, y1 + 0.25, -W / 2 - 0.2, 0.9], [x1 - 0.9, y1 + 0.05, -W / 2 - 0.2, 0.7]].map(([gx, gy, gz, sc]) => (
        <group key={gx} position={[gx, gy, gz]} rotation={[0, 0, Math.PI / 2.4]} scale={[sc * 1.6, sc, 1]}>
          <mesh material={MAT.yellow} castShadow><torusGeometry args={[0.32, 0.07, 10, 28]} /></mesh>
          <mesh material={MAT.grille}><circleGeometry args={[0.3, 24]} /></mesh>
        </group>
      ))}
      {[[x1 - 0.6, -0.5], [x1 + 0.25, -0.5], [x1 - 0.6, 0.5], [x1 + 0.25, 0.5]].map(([fx, fz]) => (
        <Beam key={`${fx}${fz}`} a={[fx, y1 - 0.2, fz]} b={[fx, y1 + 1.25, fz]} t={0.08} m={MAT.steelLight} />
      ))}
      <Box p={[x1 - 0.18, y1 + 1.28, 0]} s={[1.0, 0.08, 1.15]} m={MAT.steelLight} />
      <Cyl p={[x1 - 0.35, y1 + 1.6, -0.2]} r={0.32} h={0.28} m={MAT.steel} rot={[Math.PI / 2, 0, 0]} />
      <Motor p={[x1 - 0.35, y1 + 1.6, 0.3]} axis="z" len={0.4} r={0.15} m={MAT.steelDark} spin={on} />
      {/* 위 끝 → 전세정기로 슈트 */}
      <Chute a={CHUTES.feeder[0]} b={CHUTES.feeder[1]} w={1.0} />
      {/* 투입 컨베이어 — 호퍼 배출구 아래 → 머리가 진동 피더 아래 끝 바로 위(받침 · 꼬리 구동 모터 · 벨트 덮개) */}
      <Belt a={[cv.x0, cv.y, 0]} b={[cv.x1, cv.y]} w={0.9} on={on} />
      <Stand x0={cv.x0 + 0.3} x1={cv.x1 - 0.35} z0={-0.42} z1={0.42} y={cv.y - 0.12} />
      <Motor p={[cv.x0 + 0.12, cv.y - 0.05, -0.75]} axis="z" len={0.4} r={0.14} m={MAT.teal} spin={on} />
      <Box p={[cv.x0 + 0.12, cv.y - 0.05, -0.58]} s={[0.36, 0.42, 0.06]} m={MAT.yellowGlass} cast={false} />
      {/* 호퍼 배출구 — 짧은 사각 목(컨베이어 위) */}
      <Box p={[hx, out - 0.14, 0]} s={[0.5, 0.3, 0.5]} m={MAT.steelDark} />
      {/* 아래쪽 노란 안전 난간 */}
      <YRail pts={[[x0 - 0.5, 1.3], [x0 + 1.9, 1.3], [x0 + 1.9, 0.95]]} h={1.0} />
      {/* 호퍼 — 사각 깔때기 + 윗테 + 다리 */}
      <mesh position={[hx, (top + out) / 2, 0]} rotation={[0, Math.PI / 4, 0]} material={funnelMat} castShadow>
        <cylinderGeometry args={[0.88, 0.34, top - out, 4, 1, true]} />
      </mesh>
      <Box p={[hx, top, 0]} s={[1.3, 0.08, 1.3]} m={MAT.steelDark} />
      <Box p={[hx, top - 0.02, 0]} s={[1.14, 0.04, 1.14]} m={MAT.dark} />
      {[[-0.4, -0.28], [0.25, 0.18], [0, -0.05], [-0.18, 0.3], [0.32, -0.26]].map(([dx, dz]) => <BoltPile key={`${dx}${dz}`} p={[hx + dx, top - 0.06, dz]} s={1.1} rot={dx * 9} />)}
      {[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([dx, dz]) => (
        <Beam key={`${dx}${dz}`} a={[hx + dx, top - 0.05, dz]} b={[hx + dx * 1.15, 0, dz * 1.15]} t={0.07} />
      ))}
    </group>
  );
}

/* ───────────────────────── 세정기(전세정 · 중간세정 · 방청조) ───────────────────────── */

/** 스프레이 — 노즐마다 반투명 부채꼴 물줄기(반짝임) + 떨어지는 물방울 */
function SprayFX({ points, y, len = 0.7, on }) {
  const cones = useRef([]);
  const drops = useRef([]);
  const reduce = useMemo(reduceMotion, []);
  const coneMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9fd8f5', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    cones.current.forEach((c, i) => { if (c) c.material.opacity = on ? 0.25 + Math.sin(t * 7 + i) * 0.08 : 0; });
    drops.current.forEach((d, i) => {
      if (!d) return;
      d.visible = on && !reduce;
      if (!d.visible) return;
      const u = ((t * 1.3 + i * 0.137) % 1);
      const [px, pz] = points[i % points.length];
      const sp = ((i * 37) % 11) / 11 - 0.5;
      d.position.set(px + sp * 0.5 * u, y - u * len, pz + (((i * 13) % 7) / 7 - 0.5) * 0.5 * u);
    });
  });
  if (!on) return null;
  return (
    <group>
      {points.map(([px, pz], i) => (
        <mesh key={`${px}${pz}`} ref={(el) => { cones.current[i] = el; }} position={[px, y - len / 2, pz]} material={coneMat}>
          <cylinderGeometry args={[0.02, 0.32, len, 16, 1, true]} />
        </mesh>
      ))}
      {Array.from({ length: points.length * 8 }, (_, i) => (
        <mesh key={i} ref={(el) => { drops.current[i] = el; }} material={MAT.water}>
          <sphereGeometry args={[0.025, 6, 4]} />
        </mesh>
      ))}
    </group>
  );
}

/** 가로형 원심 펌프(받침 · 모터 · 볼류트) + 토출 배관이 탱크 위 헤더까지 */
function Pump({ x, z, toY, toX, on }) {
  const flow = useRef();
  useFrame((_, d) => { if (on && flow.current) flow.current.rotation.x += d * 10; });
  return (
    <group>
      <Box p={[x + 0.3, 0.06, z]} s={[1.1, 0.12, 0.6]} m={MAT.dark} />
      <Motor p={[x + 0.5, 0.32, z]} axis="x" len={0.55} r={0.17} m={MAT.teal} spin={on} />
      <group ref={flow} position={[x - 0.05, 0.32, z]}>
        <Cyl p={[0, 0, 0]} r={0.2} h={0.22} m={MAT.steel} rot={[0, 0, Math.PI / 2]} />
      </group>
      <Beam a={[x - 0.05, 0.5, z]} b={[x - 0.05, toY, z]} t={0.07} m={MAT.steelLight} />
      <Beam a={[x - 0.05, toY, z]} b={[toX, toY, z]} t={0.07} m={MAT.steelLight} />
    </group>
  );
}

/**
 * 세정기 — 탱크(어두운 회색 몸통 · 연두 덮개 · 앞 점검창 · 액면) + 안에서 비스듬히 올라오는 메시 컨베이어(위 끝 구동 모터 · 벨트 덮개)
 * + 스프레이 헤더(운전 중 분사) + 스프레이 펌프. on: { spray, conv, pump, skim }
 * sink: 바닥 구덩이에 묻힌 깊이 — 탱크는 그만큼 내려가고, 컨베이어 위 끝 · 펌프는 바닥 위 그대로
 */
export function Washer({ x0, x1, outX, outY, liquid = MAT.water, on = {}, h = 1.45, sink = 0, inletX, convY = 0.65 }) {
  const L = x1 - x0;
  const cx = (x0 + x1) / 2;
  const D = 2.2;
  const surf = useRef();
  const reduce = useMemo(reduceMotion, []);
  useFrame(({ clock }) => {
    if (surf.current && !reduce) surf.current.position.y = h - 0.22 + Math.sin(clock.elapsedTime * 1.4) * (on.spray || on.pump ? 0.012 : 0.003);
  });
  const conveyorA = [x0 + 0.7, convY - sink]; // 액 속 시작(convY) — 너무 깊지 않게(배출 기울기가 완만하도록)
  const openX0 = x0 + L * 0.45;
  const nozzles = [0.25, 0.55, 0.85].map((f) => [openX0 + (x1 - openX0) * f - 0.1, 0]);
  return (
    <group>
      <group position={[0, -sink, 0]}>
      {/* 탱크 몸통 */}
      <Box p={[cx, 0.04, 0]} s={[L, 0.08, D]} m={MAT.panelDark} />
      <Box p={[cx, h / 2, -D / 2]} s={[L, h, 0.06]} m={MAT.panelDark} />
      <Box p={[cx, h / 2, D / 2]} s={[L, h, 0.06]} m={MAT.panelDark} />
      <Box p={[x0, h / 2, 0]} s={[0.06, h, D]} m={MAT.panelDark} />
      <Box p={[x1, h / 2, 0]} s={[0.06, h, D]} m={MAT.panelDark} />
      <Box p={[cx, h + 0.03, D / 2]} s={[L + 0.08, 0.06, 0.1]} m={MAT.steelLight} />
      <Box p={[cx, h + 0.03, -D / 2]} s={[L + 0.08, 0.06, 0.1]} m={MAT.steelLight} />
      {/* 앞 점검창(볼트 테 + 유리) */}
      <Box p={[cx + L * 0.15, h * 0.42, D / 2 + 0.04]} s={[1.0, 0.62, 0.04]} m={MAT.dark} />
      <Box p={[cx + L * 0.15, h * 0.42, D / 2 + 0.065]} s={[0.86, 0.5, 0.02]} m={MAT.glass} cast={false} />
      {/* 액면 */}
      <mesh ref={surf} position={[cx, h - 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]} material={liquid}>
        <planeGeometry args={[L - 0.1, D - 0.1]} />
      </mesh>
      {/* 덮개(왼쪽 절반) + 손잡이 */}
      <Box p={[x0 + L * 0.225, h + 0.07, 0]} s={[L * 0.45, 0.08, D + 0.06]} m={MAT.greenLight} />
      {inletX == null && [-0.4, 0.4].map((dz) => <Box key={dz} p={[x0 + L * 0.225, h + 0.14, dz]} s={[0.5, 0.05, 0.05]} m={MAT.steelDark} />)}
      {/* 투입구 — 앞 구간 슈트가 덮개 구멍으로 들어오는 테 */}
      {inletX != null && (
        <group position={[inletX, h + 0.17, 0]}>
          <Box p={[0, 0, 0.55]} s={[0.9, 0.14, 0.06]} m={MAT.steelDark} />
          <Box p={[0, 0, -0.55]} s={[0.9, 0.14, 0.06]} m={MAT.steelDark} />
          <Box p={[-0.42, 0, 0]} s={[0.06, 0.14, 1.1]} m={MAT.steelDark} />
          <Box p={[0.42, 0, 0]} s={[0.06, 0.14, 1.1]} m={MAT.steelDark} />
          <Box p={[0, -0.06, 0]} s={[0.78, 0.02, 0.98]} m={MAT.dark} cast={false} />
        </group>
      )}
      {/* 스프레이 헤더 + 노즐 + 분사 */}
      <Beam a={[openX0, h + 0.45, 0]} b={[x1 - 0.1, h + 0.45, 0]} t={0.07} m={MAT.steelLight} />
      {nozzles.map(([nx]) => <Cyl key={nx} p={[nx, h + 0.38, 0]} r={0.04} h={0.1} m={MAT.brass} />)}
      <SprayFX points={nozzles} y={h + 0.32} len={0.6} on={!!on.spray} />
      {/* 스키머 */}
      {on.skim !== undefined && <Box p={[x1 - 0.35, h + 0.2, -D / 2 + 0.25]} s={[0.4, 0.3, 0.3]} m={on.skim ? MAT.greenDark : MAT.steelDark} />}
      </group>
      {/* 메시 컨베이어 — 탱크 안에서 위로 + 받침 + 위 끝 구동부 */}
      <Belt a={[...conveyorA, 0]} b={[outX, outY]} w={1.15} on={on.conv} side={MAT.greenDark} />
      <Beam a={[outX - 0.4, 0, 0.7]} b={[outX - 0.4, outY - 0.25, 0.7]} t={0.08} m={MAT.greenDark} />
      <Beam a={[outX - 0.4, 0, -0.7]} b={[outX - 0.4, outY - 0.25, -0.7]} t={0.08} m={MAT.greenDark} />
      <Motor p={[outX - 0.15, outY + 0.4, -0.85]} axis="z" len={0.45} r={0.15} m={MAT.teal} spin={on.conv} />
      <Box p={[outX - 0.1, outY + 0.2, -0.72]} s={[0.36, 0.7, 0.08]} m={MAT.yellowGlass} cast={false} />
      {/* 스프레이 펌프(바닥 위) — 배관이 헤더까지 */}
      <Pump x={x0 + 0.7} z={D / 2 + (sink ? 0.95 : 0.7)} toY={Math.max(h + 0.45 - sink, 0.6)} toX={openX0} on={!!on.pump} />
    </group>
  );
}

/* ───────────────────────── 열처리로(소입로 · 소려로) ───────────────────────── */

const SLOT_BOT = BELT_Y - 0.12; // 로 끝 벽 제품 구멍 — 아래 · 위
const SLOT_TOP = BELT_Y + 0.42;

const FAN_ANGLES = [0, 1, 2, 3].map((k) => (k * Math.PI) / 2);
const FAN_Y = 2.6; // 날개 높이 — 천장(3.4) 가까이, 점검창(1.45~2.9) 위쪽에 보이게

/**
 * 로 안 RC FAN — 천장 선풍기 모양: 천장 받침 · 내림 봉 · 모터 몸통 아래로 긴 납작 날개 4장이 수평으로 천천히 돈다.
 * 위에서 비스듬히 내려다보는 기본 시점에서 날개가 도는 게 그대로 보인다
 */
function InFan({ x, on }) {
  const ref = useRef();
  const reduce = useMemo(reduceMotion, []);
  useFrame((_, d) => { if (on && !reduce && ref.current) ref.current.rotation.y += d * 2.6; });
  return (
    <group position={[x, 0, 0.45]}>
      <Cyl p={[0, 3.36, 0]} r={0.12} h={0.06} m={MAT.fanBlade} />
      <Cyl p={[0, (3.36 + FAN_Y + 0.12) / 2, 0]} r={0.03} h={3.36 - FAN_Y - 0.12} m={MAT.steelDark} />
      <Cyl p={[0, FAN_Y + 0.08, 0]} rt={0.12} rb={0.17} h={0.13} m={MAT.fanBlade} seg={28} />
      <group ref={ref} position={[0, FAN_Y, 0]}>
        {FAN_ANGLES.map((a) => (
          <group key={a} rotation={[0, a, 0]}>
            <Box p={[0.19, 0, 0]} s={[0.14, 0.025, 0.05]} m={MAT.dark} />
            <Box p={[0.43, -0.005, 0]} s={[0.46, 0.03, 0.2]} r={[0.28, 0, 0]} m={MAT.fanBlade} />
          </group>
        ))}
        <Cyl p={[0, -0.03, 0]} r={0.15} h={0.05} m={MAT.fanBlade} seg={28} />
        <mesh position={[0, -0.055, 0]} rotation={[Math.PI, 0, 0]} material={MAT.steelLight}><sphereGeometry args={[0.07, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      </group>
    </group>
  );
}

/** 굴뚝 — 받침 함 + 원통 + 나팔 끝. smoke면 연기가 천천히 피어오른다 */
function Stack({ x, h, base = 3.5, z = 0, smoke }) {
  const puffs = useRef([]);
  const reduce = useMemo(reduceMotion, []);
  useFrame(({ clock }) => {
    puffs.current.forEach((p, i) => {
      if (!p) return;
      const u = (clock.elapsedTime * 0.25 + i / 4) % 1;
      p.visible = !!smoke && !reduce;
      p.position.set(x + u * 0.5, base + 0.55 + h + u * 1.4, z);
      p.scale.setScalar(0.18 + u * 0.35);
      p.material.opacity = 0.35 * (1 - u);
    });
  });
  return (
    <group>
      <Box p={[x, base + 0.25, z]} s={[0.9, 0.5, 0.9]} m={MAT.steelLight} />
      <Cyl p={[x, base + 0.5 + h / 2, z]} r={0.24} h={h} m={MAT.steelLight} />
      <Cyl p={[x, base + 0.55 + h, z]} rt={0.38} rb={0.24} h={0.22} m={MAT.steelLight} open />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(el) => { puffs.current[i] = el; }} visible={false}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color="#c4cad2" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 열처리로 — 받침 프레임 · 다리 위 회색 몸통, 앞면은 아래 어두운 띠 · 가운데 유리 점검창 · 위 띠(존 온도 표시).
 * 점검창 안: 내화 벽(운전 중 열기 빛) · 복사관(버너 운전 중 달아오름) · 메시 벨트 · RC FAN 날개.
 * 지붕: RC FAN 모터, 열전대, 앞쪽 난간 · 굴뚝(stacks). 입구 쪽 장입 벨트 + 전실, 앞 바닥에 버너 블로워(빨강)
 */
export function Furnace({ kind, charge, x0, x1, zones, hot, burnerOn, beltOn, fans, stacks, temps, blowerX, exitVestibule }) {
  const L = x1 - x0;
  const cx = (x0 + x1) / 2;
  const zoneW = L / zones;
  const zx = (i) => x0 + zoneW * (i + 0.5);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9b39d', roughness: 0.9, emissive: kind === 'quench' ? '#ff5a14' : '#f2a024', emissiveIntensity: 0 }), [kind]);
  const tubeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8a8f96', metalness: 0.5, roughness: 0.5, emissive: kind === 'quench' ? '#ff4a10' : '#ffb020', emissiveIntensity: 0 }), [kind]);
  const reduce = useMemo(reduceMotion, []);
  useFrame(({ clock }) => {
    const b = reduce ? 0 : Math.sin(clock.elapsedTime * 0.9) * 0.08;
    glow.emissiveIntensity = hot ? 0.38 + b : 0;
    tubeMat.emissiveIntensity = burnerOn ? 1.1 + b * 2 : 0;
  });
  return (
    <group>
      {/* 장입 벨트(입구 앞) + 받침 */}
      <Belt a={[charge, BELT_Y, 0]} b={[x0 - VEST, BELT_Y]} w={1.5} on={beltOn} />
      <Stand x0={charge + 0.2} x1={x0 - VEST - 0.2} z0={-0.7} z1={0.7} y={BELT_Y - 0.12} brace={false} />
      {/* 입구 전실 */}
      <Box p={[x0 - VEST / 2, 2.15, 0]} s={[VEST, 1.6, 2.2]} m={MAT.panel} />
      <Box p={[x0 - VEST - 0.01, BELT_Y + 0.12, 0]} s={[0.03, 0.36, 1.5]} m={MAT.dark} />
      {exitVestibule && (
        <group>
          <Box p={[x1 + VEST / 2, 2.15, 0]} s={[VEST, 1.6, 2.2]} m={MAT.panel} />
          <Box p={[x1 + VEST + 0.01, BELT_Y + 0.12, 0]} s={[0.03, 0.36, 1.5]} m={MAT.dark} />
        </group>
      )}
      {/* 다리 · 받침 프레임 */}
      {Array.from({ length: Math.round(L / 2.2) + 1 }, (_, i) => x0 + 0.2 + (i * (L - 0.4)) / Math.round(L / 2.2)).map((lx) => (
        <group key={lx}>
          <Box p={[lx, 0.35, 1.05]} s={[0.16, 0.7, 0.16]} m={MAT.dark} />
          <Box p={[lx, 0.35, -1.05]} s={[0.16, 0.7, 0.16]} m={MAT.dark} />
        </group>
      ))}
      <Box p={[cx, 0.78, 0]} s={[L + 0.2, 0.16, 2.5]} m={MAT.frame} />
      {/* 몸통 — 뒤 · 양끝 · 지붕 · 앞 아래 띠 · 앞 위 띠 */}
      <Box p={[cx, 2.12, -1.18]} s={[L, 2.6, 0.06]} m={MAT.panel} />
      {/* 양 끝 벽 — 벨트 높이에 제품이 드나드는 구멍(어두운 틈)을 남긴다 */}
      {[x0, x1].map((ex) => (
        <group key={ex}>
          <Box p={[ex, (SLOT_TOP + 3.42) / 2, 0]} s={[0.08, 3.42 - SLOT_TOP, 2.4]} m={MAT.panel} />
          <Box p={[ex, (0.82 + SLOT_BOT) / 2, 0]} s={[0.08, SLOT_BOT - 0.82, 2.4]} m={MAT.panel} />
          {[1, -1].map((sz) => <Box key={sz} p={[ex, (SLOT_BOT + SLOT_TOP) / 2, sz * 0.95]} s={[0.08, SLOT_TOP - SLOT_BOT, 0.5]} m={MAT.panel} />)}
          <Box p={[ex, SLOT_TOP + 0.03, 0]} s={[0.14, 0.06, 1.5]} m={MAT.steelDark} />
        </group>
      ))}
      <Box p={[cx, 3.45, 0]} s={[L + 0.12, 0.1, 2.5]} m={MAT.steelLight} />
      <Box p={[cx, 1.17, 1.18]} s={[L, 0.6, 0.06]} m={MAT.panelDark} />
      {Array.from({ length: zones * 2 }, (_, i) => x0 + (L / (zones * 2)) * (i + 0.5)).map((px) => (
        <Box key={px} p={[px, 1.17, 1.22]} s={[L / (zones * 2) - 0.25, 0.4, 0.02]} m={MAT.grille} cast={false} />
      ))}
      <Box p={[cx, 3.16, 1.18]} s={[L, 0.5, 0.06]} m={MAT.panel} />
      {/* 점검창 — 유리 + 존 경계 기둥 */}
      <Box p={[cx, 2.18, 1.19]} s={[L - 0.1, 1.46, 0.02]} m={MAT.glass} cast={false} />
      {Array.from({ length: zones + 1 }, (_, i) => x0 + zoneW * i).map((px) => (
        <Box key={px} p={[px, 2.18, 1.18]} s={[0.12, 1.46, 0.1]} m={MAT.panel} />
      ))}
      {/* 안 — 내화 벽(열기) · 바닥 · 메시 벨트 · 복사관 · 팬 날개 */}
      <mesh position={[cx, 2.12, -1.1]} material={glow}><boxGeometry args={[L - 0.16, 2.4, 0.04]} /></mesh>
      <Box p={[cx, 1.46, 0]} s={[L - 0.16, 0.08, 2.2]} m={MAT.refractory} />
      {/* 로 안 불빛 — 지붕 그늘로 어두운 속을 밝혀 팬 · 제품이 보이게(운전 중 따뜻한 색) */}
      {fans.map((f) => (
        <pointLight key={`l${f.x}`} position={[f.x, 3.0, 0.85]} color={kind === 'quench' ? '#ffb27a' : '#ffd59a'} intensity={hot ? 5 : 2.2} distance={4.5} decay={1.2} />
      ))}
      <Belt a={[x0 + 0.08, BELT_Y, 0]} b={[x1 - 0.08, BELT_Y]} w={1.6} on={beltOn} rails={false} />
      {[-0.55, 0.45].map((tz) => (
        <mesh key={tz} position={[cx, 2.62, tz]} rotation={[0, 0, Math.PI / 2]} material={tubeMat}>
          <cylinderGeometry args={[0.06, 0.06, L - 0.3, 12]} />
        </mesh>
      ))}
      {fans.map((f) => <InFan key={f.x} x={f.x} on={f.on} />)}
      {/* 위 띠 — 존 온도 표시(오래된 조절기 함) */}
      {Array.from({ length: zones }, (_, i) => (
        <Html key={i} transform position={[zx(i), 3.16, 1.22]} distanceFactor={5.6} zIndexRange={[20, 0]}>
          <div className="m3-ctl"><span>{i + 1}존</span><b>{temps?.[i] != null ? Math.round(temps[i]) : '---'}</b><small>℃</small></div>
        </Html>
      ))}
      {/* 지붕 — RC FAN 모터 · 열전대 · 난간 · 굴뚝 */}
      {fans.map((f) => (
        <group key={`m${f.x}`}>
          <Cyl p={[f.x, 3.56, 0.6]} r={0.34} h={0.12} m={MAT.steelDark} />
          <Cyl p={[f.x, 3.72, 0.6]} r={0.26} h={0.2} m={MAT.steelLight} />
          <Motor p={[f.x, 4.1, 0.6]} axis="y" len={0.6} r={0.2} m={MAT.steel} spin={f.on} />
        </group>
      ))}
      {Array.from({ length: zones }, (_, i) => zx(i) - zoneW * 0.3).map((tx) => (
        <group key={tx}>
          <Cyl p={[tx, 3.75, 1.06]} r={0.025} h={0.6} m={MAT.steelDark} />
          <Box p={[tx, 4.08, 1.06]} s={[0.1, 0.08, 0.1]} m={MAT.dark} />
        </group>
      ))}
      <Railing x0={x0 + 0.2} x1={x1 - 0.2} y={3.5} z={1.12} h={0.75} />
      {stacks.map((s) => <Stack key={s.x} {...s} />)}
      {/* 버너 블로워(빨강 모터 + 볼류트 + 덕트) */}
      <group>
        <Box p={[blowerX, 0.08, 2.1]} s={[1.5, 0.16, 1.0]} m={MAT.dark} />
        <Motor p={[blowerX + 0.35, 0.48, 2.1]} axis="x" len={0.6} r={0.22} m={MAT.red} spin={burnerOn} />
        <Cyl p={[blowerX - 0.35, 0.55, 2.1]} r={0.38} h={0.3} m={MAT.red} rot={[Math.PI / 2, 0, 0]} />
        <Box p={[blowerX - 0.35, 0.95, 1.65]} s={[0.3, 0.3, 0.9]} m={MAT.steel} />
      </group>
    </group>
  );
}

/* ───────────────────────── 유조(초록 탱크 + 기름 위로 올라오는 컨베이어) ───────────────────────── */

const SLOSH_S = 4; // 덩어리가 빠진 뒤 출렁임이 이어지는 시간(초)
const SPLASH = 10; // 튀는 기름 방울 수
const RINGS = 6; // 물결 고리 수(동시에)
const RING_S = 1.6; // 물결 고리가 보이는 시간(초)

// 유조 물고기 — 기름 면 바로 아래(등만 살짝 보이게) 타원을 그리며 헤엄. 컨베이어가 올라오는 오른쪽은 피해 왼쪽~가운데에서.
// [몸 색, 무늬 색, 크기, 돌기 속도(rad/s, 음수 = 반대 방향), 시작 위상, 타원 반지름 X · Z]. 첫 마리는 가끔 뛰어오른다
const FISH = [
  { color: '#f08a24', spot: '#ffffff', size: 1.0, speed: 0.34, phase: 0, rx: 1.1, rz: 0.82 },
  { color: '#f6f1e7', spot: '#e0452b', size: 0.85, speed: -0.27, phase: 2.2, rx: 0.85, rz: 0.62 },
  { color: '#e9b72e', spot: '#f6f1e7', size: 0.78, speed: 0.41, phase: 4.1, rx: 0.95, rz: 0.48 },
];
const FISH_CX = -4.95; // 헤엄치는 타원 가운데 X
const JUMP_EVERY = 14; // 첫 마리가 뛰어오르는 간격(초)
const JUMP_S = 1.1;
// 상어 — 물고기보다 큰 타원을 반대 방향으로 천천히. 몸은 기름 속, 등지느러미만 기름 위로
const SHARK = { cx: -4.75, rx: 1.6, rz: 0.95, speed: -0.2, phase: 1.0 };
const HUNT_EVERY = 24; // 상어가 사냥하는 간격(초)
const HUNT_BITE = 2.2; // 돌진해서 무는 시각(주기 시작부터 초)
const HUNT_BACK = 2.4; // 물고 나서 돌던 길로 돌아가는 시간
const EATEN_S = 8; // 먹힌 물고기가 다시 나타나기까지

/** 물고기 k의 time 시각 자리(기름 면 OIL_LV 바로 아래)와 가는 쪽(Y축 회전) */
function fishAt(k, time, oilLv) {
  const f = FISH[k];
  const a = f.phase + time * f.speed;
  const sg = Math.sign(f.speed || 1);
  return {
    x: FISH_CX + Math.cos(a) * f.rx,
    y: oilLv - 0.035 + Math.sin(time * 1.7 + k * 2) * 0.012,
    z: Math.sin(a) * f.rz,
    heading: Math.atan2(-Math.cos(a) * f.rz * sg, -Math.sin(a) * f.rx * sg),
  };
}

// 상어 등지느러미 — 납작한 삼각형(뒤로 휜)
const SHARK_FIN = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(-0.11, 0);
  sh.quadraticCurveTo(-0.02, 0.1, -0.06, 0.24);
  sh.quadraticCurveTo(0.06, 0.1, 0.12, 0);
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false, curveSegments: 8 });
})();
const SHARK_TOP = new THREE.MeshStandardMaterial({ color: '#66788a', roughness: 0.45, metalness: 0.1 });
const SHARK_BELLY = new THREE.MeshStandardMaterial({ color: '#e8ecef', roughness: 0.5 });

/** 상어 — 앞(+X)이 머리. 긴 몸통(회청색 등 · 흰 배) · 주둥이 · 등지느러미 · 가슴지느러미 · 초승달 꼬리(따로 흔들림) · 눈 */
function Shark({ tailRef }) {
  return (
    <group>
      <mesh material={SHARK_TOP} scale={[0.52, 0.12, 0.14]} castShadow><sphereGeometry args={[1, 24, 16]} /></mesh>
      <mesh material={SHARK_BELLY} position={[0.04, -0.035, 0]} scale={[0.44, 0.08, 0.12]}><sphereGeometry args={[1, 20, 12]} /></mesh>
      <mesh material={SHARK_TOP} position={[0.46, -0.01, 0]} scale={[0.14, 0.07, 0.09]}><sphereGeometry args={[1, 14, 10]} /></mesh>
      <mesh geometry={SHARK_FIN} material={SHARK_TOP} position={[0.02, 0.09, -0.01]} castShadow />
      {[1, -1].map((s) => (
        <mesh key={s} material={SHARK_TOP} position={[0.12, -0.06, s * 0.15]} rotation={[s * 0.5, 0.5 * s, -0.35]} scale={[0.14, 0.012, 0.07]}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      ))}
      <group ref={tailRef} position={[-0.5, 0, 0]}>
        <mesh material={SHARK_TOP} position={[-0.06, 0.08, 0]} rotation={[0, 0, -0.7]} scale={[0.12, 0.03, 0.015]}><sphereGeometry args={[1, 10, 8]} /></mesh>
        <mesh material={SHARK_TOP} position={[-0.05, -0.05, 0]} rotation={[0, 0, 0.6]} scale={[0.08, 0.025, 0.015]}><sphereGeometry args={[1, 10, 8]} /></mesh>
      </group>
      {[1, -1].map((s) => (
        <mesh key={`e${s}`} position={[0.4, 0.03, s * 0.08]} material={MAT.dark}><sphereGeometry args={[0.016, 8, 6]} /></mesh>
      ))}
    </group>
  );
}

/** 물고기 한 마리 — 앞(+X)이 머리. 몸통(납작한 타원) · 등지느러미 · 꼬리(따로 흔들림) · 눈 · 무늬 */
function Fish({ color, spot, size, tailRef }) {
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 }), [color]);
  const mark = useMemo(() => new THREE.MeshStandardMaterial({ color: spot, roughness: 0.4 }), [spot]);
  return (
    <group scale={size}>
      <mesh material={body} scale={[0.24, 0.075, 0.09]} castShadow><sphereGeometry args={[1, 20, 14]} /></mesh>
      <mesh material={mark} position={[0.02, 0.045, 0]} scale={[0.09, 0.035, 0.06]}><sphereGeometry args={[1, 14, 10]} /></mesh>
      <mesh material={body} position={[-0.02, 0.075, 0]} rotation={[0, 0, -0.5]} scale={[0.07, 0.05, 0.012]}><sphereGeometry args={[1, 12, 8]} /></mesh>
      <group ref={tailRef} position={[-0.22, 0, 0]}>
        <mesh material={body} position={[-0.07, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.18]}>
          <coneGeometry args={[0.075, 0.15, 14]} />
        </mesh>
      </group>
      {[0.035, -0.035].map((ez) => (
        <mesh key={ez} position={[0.17, 0.02, ez * 1.6]} material={MAT.dark}><sphereGeometry args={[0.014, 8, 6]} /></mesh>
      ))}
    </group>
  );
}

/** 유조 — 바닥 구덩이에 묻힌 위가 열린 초록 판넬 탱크(격자 리브) · 가득 찬 기름 · 기름 속에서 올라오는 컨베이어(위 빨강 구동 모터) · 열린 소입 슈트 · 열교환기(바닥 위) */
export function OilTank({ on, onFinTap }) {
  const { x0, x1, conv, top } = EQ.oil;
  const L = x1 - x0;
  const cx = (x0 + x1) / 2;
  const D = 2.6;
  const H = 1.75;
  const OIL_LV = H - 0.1; // 기름 높이 — 가득
  const surf = useRef();
  const drops = useRef();
  const rings = useRef();
  const fish = useRef([]);
  const tails = useRef([]);
  const shark = useRef();
  const sharkTail = useRef();
  const reduce = useMemo(reduceMotion, []);
  useFrame(({ clock }) => {
    const g = surf.current;
    if (!g) return;
    const t = clock.elapsedTime;
    // 사냥 — HUNT_EVERY초마다 상어가 돌던 길을 벗어나 물고기 하나(2 · 3번째 번갈아)에게 돌진해 물고 돌아온다. 먹힌 물고기는 잠시 뒤 다시 나타남
    const cycle = Math.floor(t / HUNT_EVERY);
    const hu = t - cycle * HUNT_EVERY; // 이번 사냥 주기 안의 시각
    const prey = 1 + (cycle % 2);
    const biteT = cycle * HUNT_EVERY + HUNT_BITE;
    const bite = fishAt(prey, biteT, OIL_LV);
    const hunting = !reduce && hu < HUNT_BITE + HUNT_BACK;
    const eaten = !reduce && hu >= HUNT_BITE && hu < HUNT_BITE + EATEN_S;
    // 물결 원인 — [지난 초, X, Z]: 제품이 빠진 자리 + 상어가 문 자리
    const hits = on.flow && !reduce ? oilDrops(t, SLOSH_S).map(([age, z]) => [age, OIL_DROP_X, z]) : [];
    if (!reduce && hu >= HUNT_BITE && hu - HUNT_BITE < SLOSH_S) hits.push([hu - HUNT_BITE, bite.x, bite.z]);
    const pos = g.attributes.position;
    // 기름 면 높이 — 잔물결 + 물결 원인마다 퍼지는 동심 물결 + 탱크 전체가 살짝 앞뒤로 출렁임(점점 잦아듦)
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      let h = Math.sin(px * 2.3 + t * 1.6) * Math.cos(py * 2.1 - t * 1.1) * (on.agit ? 0.006 : 0.002);
      hits.forEach(([age, hx, z]) => {
        const r = Math.hypot(px - (hx - cx), py + z);
        const front = 0.2 + age * 1.5;
        const reach = r < front ? 1 : Math.exp(-(r - front) * 7);
        h += 0.07 * Math.exp(-age * 1.5) * Math.exp(-r * 0.45) * Math.cos(10 * r - 13 * age) * reach;
        h += 0.016 * Math.exp(-age * 0.9) * Math.sin(age * 3.2) * Math.cos((Math.PI * (px + L / 2)) / L);
      });
      pos.setZ(i, h);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    // 퍼지는 물결 고리 — 물결 원인마다 하나, 커지며 옅어진다
    rings.current?.children.forEach((m, k) => {
      const hit = hits[k];
      m.visible = !!hit && hit[0] < RING_S;
      if (!m.visible) return;
      const [age, hx, z] = hit;
      const r = 0.15 + age * 0.9;
      m.position.set(hx, OIL_LV + 0.012, z);
      m.scale.set(r, r, 1);
      m.material.opacity = 0.55 * (1 - age / RING_S);
    });
    // 물고기 — 타원을 따라 헤엄(가는 쪽을 봄) · 꼬리 흔들기 · 등이 오르내림. 첫 마리는 JUMP_EVERY초마다 기름 위로 뛰어오른다.
    // 먹힌 물고기는 EATEN_S초 숨었다가 1초 동안 커지며 다시 나타난다
    FISH.forEach((f, k) => {
      const m = fish.current[k];
      if (!m) return;
      const at = reduce ? 0 : t;
      const p = fishAt(k, at, OIL_LV);
      let { y } = p;
      let pitch = 0;
      const j = t % JUMP_EVERY;
      if (k === 0 && !reduce && j < JUMP_S) {
        const u = j / JUMP_S;
        y += 4 * 0.5 * u * (1 - u);
        pitch = (0.5 - u) * 1.8;
      }
      m.position.set(p.x, y, p.z);
      m.rotation.set(0, p.heading, pitch);
      const back = hu - HUNT_BITE - EATEN_S; // 다시 나타난 뒤 지난 초
      const grow = k !== prey || reduce ? 1 : eaten ? 0 : back >= 0 && back < 1 ? back : 1;
      m.visible = grow > 0.01;
      m.scale.setScalar(Math.max(0.01, grow));
      if (tails.current[k]) tails.current[k].rotation.y = reduce ? 0 : Math.sin(t * 9 + k * 1.3) * 0.45;
    });
    // 상어 — 평소엔 등지느러미만 기름 위로 내놓고 천천히 돈다. 사냥 때는 물고기에게 돌진 → 솟아오르며 물기 → 돌던 길로 돌아감
    const sh = shark.current;
    if (sh) {
      const a = SHARK.phase + (reduce ? 0 : t * SHARK.speed);
      const ring = { x: SHARK.cx + Math.cos(a) * SHARK.rx, z: Math.sin(a) * SHARK.rz };
      let x = ring.x;
      let z = ring.z;
      let lift = 0;
      if (hunting) {
        if (hu < HUNT_BITE) {
          const k = ease(hu / HUNT_BITE);
          const prey0 = fishAt(prey, t, OIL_LV);
          x = ring.x + (prey0.x - ring.x) * k;
          z = ring.z + (prey0.z - ring.z) * k;
        } else {
          const k = ease((hu - HUNT_BITE) / HUNT_BACK);
          x = bite.x + (ring.x - bite.x) * k;
          z = bite.z + (ring.z - bite.z) * k;
        }
        const lu = (hu - (HUNT_BITE - 0.35)) / 0.7; // 무는 순간 앞뒤 0.35초 솟아오름
        if (lu > 0 && lu < 1) lift = Math.sin(lu * Math.PI) * 0.16;
      }
      const dx = x - sh.position.x;
      const dz = z - sh.position.z;
      if (Math.hypot(dx, dz) > 1e-4) sh.rotation.y = Math.atan2(-dz, dx);
      sh.rotation.z = lift * 1.2;
      sh.position.set(x, OIL_LV - 0.12 + lift + (reduce ? 0 : Math.sin(t * 0.9) * 0.01), z);
      if (sharkTail.current) sharkTail.current.rotation.y = reduce ? 0 : Math.sin(t * (hunting ? 11 : 4.5)) * (hunting ? 0.5 : 0.35);
    }
    // 튀는 기름 방울 — 가장 최근 물결 원인, 0.6초
    const last = hits.reduce((acc, b) => (!acc || b[0] < acc[0] ? b : acc), null);
    drops.current?.children.forEach((m, k) => {
      const age = last?.[0] ?? 9;
      m.visible = age < 0.6;
      if (!m.visible) return;
      const th = (k / SPLASH) * Math.PI * 2 + k;
      const v = 0.5 + (k % 3) * 0.18;
      m.position.set(last[1] + Math.cos(th) * v * age, OIL_LV + (1.5 + (k % 2) * 0.5) * age - 4.9 * age * age, last[2] + Math.sin(th) * v * age);
    });
  });
  return (
    <group>
      <group position={[0, -PIT, 0]}>
      <Box p={[cx, 0.05, 0]} s={[L, 0.1, D]} m={MAT.greenDark} />
      <Box p={[cx, H / 2, -D / 2]} s={[L, H, 0.06]} m={MAT.green} />
      <Box p={[cx, H / 2, D / 2]} s={[L, H, 0.06]} m={MAT.green} />
      <Box p={[x0, H / 2, 0]} s={[0.06, H, D]} m={MAT.green} />
      <Box p={[x1, H / 2, 0]} s={[0.06, H, D]} m={MAT.green} />
      {/* 격자 리브 */}
      {Array.from({ length: Math.round(L / 1.2) + 1 }, (_, i) => x0 + (i * L) / Math.round(L / 1.2)).map((rx) => (
        <Box key={rx} p={[rx, H / 2, D / 2 + 0.04]} s={[0.08, H, 0.06]} m={MAT.greenDark} />
      ))}
      {[0.55, 1.15].map((ry) => <Box key={ry} p={[cx, ry, D / 2 + 0.04]} s={[L, 0.08, 0.06]} m={MAT.greenDark} />)}
      {/* 위가 열린 탱크 — 테두리만 */}
      <Box p={[cx, H + 0.03, D / 2]} s={[L + 0.1, 0.06, 0.12]} m={MAT.greenDark} cast={false} />
      <Box p={[cx, H + 0.03, -D / 2]} s={[L + 0.1, 0.06, 0.12]} m={MAT.greenDark} cast={false} />
      <Box p={[x0, H + 0.03, 0]} s={[0.12, 0.06, D]} m={MAT.greenDark} cast={false} />
      <Box p={[x1, H + 0.03, 0]} s={[0.12, 0.06, D]} m={MAT.greenDark} cast={false} />
      {/* 기름 면(제품이 빠지면 출렁임) · 튀는 방울 */}
      <mesh position={[cx, OIL_LV, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.oilBath}>
        <planeGeometry ref={surf} args={[L - 0.1, D - 0.1, 56, 24]} />
      </mesh>
      <group ref={rings}>
        {Array.from({ length: RINGS }, (_, k) => (
          <mesh key={k} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.86, 1, 40]} />
            <meshBasicMaterial color="#fff6d6" transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}
      </group>
      {/* 상어 · 물고기 */}
      <group
        ref={shark}
        onClick={(e) => { e.stopPropagation(); onFinTap?.(); }}
      >
        <Shark tailRef={sharkTail} />
        {/* 보이지 않는 판정 공(몸 대부분이 기름 속이라) */}
        <mesh scale={[0.75, 0.35, 0.45]}><sphereGeometry args={[1, 12, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
      </group>
      {FISH.map((f, k) => (
        <group key={f.color} ref={(el) => { fish.current[k] = el; }}>
          <Fish color={f.color} spot={f.spot} size={f.size} tailRef={(el) => { tails.current[k] = el; }} />
        </group>
      ))}
      <group ref={drops}>
        {Array.from({ length: SPLASH }, (_, k) => (
          <mesh key={k} visible={false} material={MAT.oilDrop}><sphereGeometry args={[0.035, 8, 6]} /></mesh>
        ))}
      </group>
      </group>
      {/* 소입 슈트 — 소입로 출구에서 구덩이 속 기름 면까지 열린 홈통(제품이 미끄러져 내려가는 게 보인다) */}
      <Chute a={CHUTES.quench[0]} b={CHUTES.quench[1]} w={1.3} />
      {/* 컨베이어 — 기름 속 → 위(유절 컨베이어로) + 받침 + 위 구동 */}
      <Belt a={[...conv, 0]} b={top} w={1.2} on={on.conv} side={MAT.greenDark} />
      <Beam a={[top[0] - 0.5, 0, 0.75]} b={[top[0] - 0.5, top[1] - 0.25, 0.75]} t={0.09} m={MAT.greenDark} />
      <Beam a={[top[0] - 0.5, 0, -0.75]} b={[top[0] - 0.5, top[1] - 0.25, -0.75]} t={0.09} m={MAT.greenDark} />
      <Motor p={[top[0] - 0.2, top[1] + 0.35, -0.9]} axis="z" len={0.45} r={0.16} m={MAT.red} spin={on.conv} />
      {/* 열교환기 */}
      <Box p={[x1 - 0.2, 0.45, D / 2 + 0.95]} s={[0.9, 0.9, 0.6]} m={on.hx ? MAT.teal : MAT.steel} />
      {[-0.2, 0.2].map((py) => <Beam key={py} a={[x1 - 0.2, 0.45 + py, D / 2 + 0.5]} b={[x1 - 0.2, 0.45 + py - PIT, D / 2]} t={0.06} m={MAT.steelLight} />)}
    </group>
  );
}

/* ───────────────────────── 유절 컨베이어(홈통 컨베이어) + 유절 블로워 ───────────────────────── */

/** 유절 컨베이어 — 높은 옆판 홈통 + 벨트 + 다리 + 끝 구동 모터(벨트 덮개) + 아래 받이 판, 앞 바닥 블로워 → 중간세정기로 슈트 */
export function SepConveyor({ on }) {
  const { x0, x1, y } = EQ.sep;
  const cx = (x0 + x1) / 2;
  const bx = x0 + 1.1; // 블로워 · 에어 나이프 자리
  const BZ = 1.5; // 블로워 앞 바닥
  const duY = y + 1.0; // 덕트가 벨트 위로 건너는 높이
  return (
    <group>
      <Belt a={[x0, y, 0]} b={[x1, y]} w={1.0} on={on.conv} />
      {[0.55, -0.55].map((z) => <Box key={z} p={[cx + 0.3, y + 0.28, z]} s={[x1 - x0 - 0.8, 0.5, 0.05]} m={MAT.steel} />)}
      <Stand x0={x0 + 0.4} x1={x1 - 0.3} z0={-0.5} z1={0.5} y={y - 0.12} />
      <Box p={[cx, y - 0.5, 0]} s={[x1 - x0 - 0.6, 0.06, 1.1]} m={MAT.oil} />
      <Motor p={[x1 + 0.2, y + 0.55, -0.75]} axis="z" len={0.45} r={0.16} m={MAT.teal} spin={on.conv} />
      <Box p={[x1, y + 0.25, -0.6]} s={[0.4, 0.75, 0.08]} m={MAT.yellowGlass} cast={false} />
      {/* 블로워 — 바닥 받침 위 볼류트 + 모터, 세운 덕트 → 꺾여 벨트 위로 → 에어 나이프(벨트 폭만큼, 기름을 불어 냄) */}
      <Box p={[bx + 0.2, 0.08, BZ]} s={[1.1, 0.16, 0.7]} m={MAT.dark} />
      <Motor p={[bx + 0.5, 0.42, BZ]} axis="x" len={0.45} r={0.16} m={MAT.steelLight} spin={on.blower} />
      <Cyl p={[bx, 0.45, BZ]} r={0.28} h={0.24} m={MAT.steel} rot={[Math.PI / 2, 0, 0]} />
      <Cyl p={[bx, (0.7 + duY) / 2, BZ]} r={0.1} h={duY - 0.7} m={MAT.steel} />
      <Cyl p={[bx, duY, BZ / 2]} r={0.1} h={BZ} m={MAT.steel} rot={[Math.PI / 2, 0, 0]} />
      {[[bx, duY, BZ], [bx, duY, 0]].map(([ex, ey, ez]) => (
        <mesh key={ez} position={[ex, ey, ez]} material={MAT.steel} castShadow><sphereGeometry args={[0.1, 16, 12]} /></mesh>
      ))}
      <Cyl p={[bx, duY - 0.11, 0]} r={0.1} h={0.22} m={MAT.steel} />
      <Box p={[bx, y + 0.72, 0]} s={[0.22, 0.14, 1.05]} m={MAT.steelLight} />
      <Box p={[bx + 0.1, y + 0.64, 0]} s={[0.05, 0.05, 1.0]} m={MAT.dark} cast={false} />
      {/* 덕트 고정 클램프 — 컨베이어 다리에 */}
      {[(y - 0.12) * 0.35, y - 0.12].map((cy) => <Box key={cy} p={[bx, cy, (BZ + 0.5) / 2]} s={[0.06, 0.06, BZ - 0.5]} m={MAT.steelDark} cast={false} />)}
      <Chute a={CHUTES.sep[0]} b={CHUTES.sep[1]} w={0.9} />
    </group>
  );
}

/* ───────────────────────── 끝 — 소려로 출구 벨트 · 방청조 · 제품 상자 ───────────────────────── */

/** 제품 상자(위가 열린 통, 안에 부품 더미) */
export function ProductBin() {
  const x = EQ.bin.x;
  return (
    <group>
      <Box p={[x, 0.04, 0]} s={[1.2, 0.08, 1.1]} m={MAT.steelDark} />
      <Box p={[x, 0.45, 0.53]} s={[1.2, 0.9, 0.04]} m={MAT.steel} />
      <Box p={[x, 0.45, -0.53]} s={[1.2, 0.9, 0.04]} m={MAT.steel} />
      <Box p={[x - 0.58, 0.45, 0]} s={[0.04, 0.9, 1.1]} m={MAT.steel} />
      <Box p={[x + 0.58, 0.45, 0]} s={[0.04, 0.9, 1.1]} m={MAT.steel} />
      {[[-0.25, -0.2], [0.2, 0.15], [0, -0.05], [0.25, -0.25], [-0.2, 0.25]].map(([dx, dz]) => <BoltPile key={`${dx}${dz}`} p={[x + dx, 0.55, dz]} s={1.1} rot={dz * 8} />)}
    </group>
  );
}
