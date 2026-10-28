import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * MBF3호기 3D 그림의 기본 부품 — 재질 · 상자 · 원통 · 보(두 점 사이) · 받침대 · 난간 · 모터 · 메시 벨트.
 * 좌표: X = 라인 방향(왼쪽 → 오른쪽 공정 순서), Y = 위, Z = 앞(+, 카메라 쪽). 단위는 대략 m.
 */

const std = (color, metalness = 0.45, roughness = 0.55, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

// 재질 — 모듈에서 한 번 만들어 같이 쓴다(CAD 화면처럼 회색 강철 위주, 유조는 초록, 블로워 모터는 빨강)
export const MAT = {
  steel: std('#aab1ba', 0.55, 0.45),
  steelLight: std('#cfd4da', 0.45, 0.5),
  steelDark: std('#6c747e', 0.55, 0.5),
  frame: std('#5d656f', 0.5, 0.55),
  dark: std('#3a4048', 0.5, 0.55),
  panel: std('#9da4ad', 0.35, 0.6),
  panelDark: std('#4b525b', 0.35, 0.6),
  roofBox: std('#4f565f', 0.4, 0.6),
  grille: std('#2b3036', 0.4, 0.7),
  green: std('#6ea873', 0.25, 0.6),
  greenDark: std('#4f8656', 0.25, 0.6),
  greenLight: std('#bfe0b8', 0.2, 0.6),
  red: std('#c2382c', 0.35, 0.45),
  teal: std('#3f9f9a', 0.4, 0.45),
  yellowGlass: new THREE.MeshStandardMaterial({ color: '#e7d35a', transparent: true, opacity: 0.45, roughness: 0.3, metalness: 0.1 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#b9c9d8', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, depthWrite: false }),
  pitGlass: new THREE.MeshStandardMaterial({ color: '#c6ccd6', transparent: true, opacity: 0.18, depthWrite: false }),
  water: new THREE.MeshStandardMaterial({ color: '#6fb9de', transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.1 }),
  oil: new THREE.MeshStandardMaterial({ color: '#c3913b', transparent: true, opacity: 0.88, roughness: 0.2, metalness: 0.15 }),
  oilBath: new THREE.MeshStandardMaterial({ color: '#ecd98a', transparent: true, opacity: 0.85, roughness: 0.06, metalness: 0.1, depthWrite: false }),
  fanBlade: std('#3a4048', 0.5, 0.45),
  monitor: std('#1c2128', 0.3, 0.6),
  fanVane: std('#9aa3ad', 0.75, 0.3),
  oilDrop: new THREE.MeshStandardMaterial({ color: '#d8bf5c', roughness: 0.1, metalness: 0.1 }),
  rust: new THREE.MeshStandardMaterial({ color: '#8ccaa0', transparent: true, opacity: 0.8, roughness: 0.2, metalness: 0.1 }),
  refractory: std('#c9b39d', 0, 0.9),
  belt: std('#80878f', 0.6, 0.5),
  rubber: std('#2a2e33', 0.1, 0.8),
  brass: std('#b9a06a', 0.6, 0.4),
  floorMark: std('#d6dbe1', 0, 0.9),
  yellow: std('#f2c230', 0.2, 0.5),
  concrete: std('#9ea4aa', 0, 0.95),
  concreteDark: std('#7d838a', 0, 0.95),
};

// 볼트 · 너트 공용 형상(한 번 만들어 같이 씀)
const BOLT_G = {
  shank: new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8),
  head: new THREE.CylinderGeometry(0.064, 0.064, 0.05, 6),
  nut: new THREE.CylinderGeometry(0.072, 0.072, 0.056, 6),
  hole: new THREE.CylinderGeometry(0.033, 0.033, 0.058, 10),
};
// 한 뭉치 배치 — [종류, x, y, z, 수평 방향(rad), 기울기(rad)]
const PILE = [
  ['bolt', -0.07, 0.064, -0.06, 0.3, 0],
  ['bolt', 0.06, 0.064, 0.08, 2.1, 0],
  ['bolt', 0.0, 0.15, -0.0, 1.2, 0.2],
  ['bolt', -0.05, 0.064, 0.13, 2.9, 0],
  ['nut', 0.14, 0.03, -0.09, 0, 0],
  ['nut', -0.16, 0.03, 0.05, 0.4, 0],
  ['nut', 0.04, 0.2, 0.06, 0.2, 0.35],
];

/** 볼트 · 너트 뭉치(제품 한 덩어리) — 육각 머리 볼트 넷 + 너트 셋을 아무렇게나 쌓은 모양. m: 재질(색이 바뀌는 흐름 덩어리는 따로) */
export function BoltPile({ p = [0, 0, 0], s = 1, m = MAT.steel, rot = 0 }) {
  return (
    <group position={p} scale={s} rotation={[0, rot, 0]}>
      {PILE.map(([k, x, y, z, yaw, tilt]) => (k === 'bolt' ? (
        <group key={`${x}${z}`} position={[x, y, z]} rotation={[tilt, yaw, 0]}>
          <mesh geometry={BOLT_G.shank} material={m} rotation={[0, 0, Math.PI / 2]} />
          <mesh geometry={BOLT_G.head} material={m} position={[-0.17, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
        </group>
      ) : (
        <group key={`${x}${z}`} position={[x, y, z]} rotation={[tilt, yaw, 0]}>
          <mesh geometry={BOLT_G.nut} material={m} />
          <mesh geometry={BOLT_G.hole} material={MAT.dark} />
        </group>
      )))}
    </group>
  );
}

/** 상자 — p: 가운데, s: [가로(X), 높이(Y), 깊이(Z)] */
export function Box({ p, s, m = MAT.steel, r, cast = true }) {
  return (
    <mesh position={p} rotation={r} material={m} castShadow={cast} receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  );
}

/** 원통 — 기본은 세운 것(Y축). rot로 눕힌다 */
export function Cyl({ p, r = 0.1, rt, rb, h = 1, m = MAT.steel, rot, seg = 20, open = false }) {
  return (
    <mesh position={p} rotation={rot} material={m} castShadow receiveShadow>
      <cylinderGeometry args={[rt ?? r, rb ?? r, h, seg, 1, open]} />
    </mesh>
  );
}

const UP = new THREE.Vector3(0, 1, 0);
/** 두 점 사이 각진 보(형강) */
export function Beam({ a, b, t = 0.08, m = MAT.frame }) {
  const [ax, ay, az] = a;
  const [bx, by, bz] = b;
  const { pos, len, quat } = useMemo(() => {
    const va = new THREE.Vector3(ax, ay, az);
    const vb = new THREE.Vector3(bx, by, bz);
    const dir = vb.clone().sub(va);
    return {
      pos: va.clone().add(vb).multiplyScalar(0.5).toArray(),
      len: dir.length(),
      quat: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
    };
  }, [ax, ay, az, bx, by, bz]);
  return (
    <mesh position={pos} quaternion={quat} material={m} castShadow receiveShadow>
      <boxGeometry args={[t, len, t]} />
    </mesh>
  );
}

/** 받침대 — 네 다리 + 위 테두리 보(+ 가운데 가로대) */
export function Stand({ x0, x1, z0 = -0.9, z1 = 0.9, y, t = 0.09, m = MAT.frame, brace = true }) {
  if (x1 - x0 < 0.2) return null;
  const legs = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]];
  return (
    <group>
      {legs.map(([x, z]) => <Beam key={`${x}-${z}`} a={[x, 0, z]} b={[x, y, z]} t={t} m={m} />)}
      <Beam a={[x0, y, z0]} b={[x1, y, z0]} t={t} m={m} />
      <Beam a={[x0, y, z1]} b={[x1, y, z1]} t={t} m={m} />
      {brace && <Beam a={[x0, y * 0.35, z1]} b={[x1, y * 0.35, z1]} t={t * 0.8} m={m} />}
      {brace && <Beam a={[x0, y * 0.35, z0]} b={[x1, y * 0.35, z0]} t={t * 0.8} m={m} />}
    </group>
  );
}

/** 난간 — x0~x1, 높이 y 위에 기둥 + 위 · 가운데 손잡이 */
export function Railing({ x0, x1, y, z, h = 0.9 }) {
  const n = Math.max(2, Math.round((x1 - x0) / 1.4) + 1);
  return (
    <group>
      {Array.from({ length: n }, (_, i) => x0 + ((x1 - x0) * i) / (n - 1)).map((x) => (
        <Beam key={x} a={[x, y, z]} b={[x, y + h, z]} t={0.04} m={MAT.brass} />
      ))}
      <Beam a={[x0, y + h, z]} b={[x1, y + h, z]} t={0.045} m={MAT.brass} />
      <Beam a={[x0, y + h / 2, z]} b={[x1, y + h / 2, z]} t={0.035} m={MAT.brass} />
    </group>
  );
}

/**
 * 모터 — 원통 몸통(방열 핀 줄) + 끝 덮개. axis: 'x' | 'y' | 'z'(몸통 방향). spin이면 끝 냉각팬 덮개의 무늬가 돈다
 */
export function Motor({ p, axis = 'x', len = 0.6, r = 0.2, m = MAT.teal, spin }) {
  const rot = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  const fan = useRef();
  useFrame((_, d) => { if (spin && fan.current) fan.current.rotation.y += d * 9; });
  return (
    <group position={p} rotation={rot}>
      <Cyl p={[0, 0, 0]} r={r} h={len} m={m} seg={24} />
      {[0.35, 0.15, -0.05, -0.25].map((f) => <Cyl key={f} p={[0, len * f, 0]} r={r * 1.05} h={0.025} m={MAT.steelDark} seg={24} />)}
      <Cyl p={[0, len / 2 + 0.06, 0]} r={r * 0.95} h={0.12} m={MAT.steelDark} seg={24} />
      <group ref={fan} position={[0, len / 2 + 0.125, 0]}>
        {[0, 1, 2, 3].map((k) => <Box key={k} p={[0, 0, 0]} s={[r * 1.6, 0.012, 0.05]} r={[0, (k * Math.PI) / 4, 0]} m={MAT.grille} cast={false} />)}
      </group>
      <Box p={[r * 0.9, -len * 0.15, 0]} s={[0.12, 0.16, 0.16]} m={MAT.steelDark} />
    </group>
  );
}

/** 메시 벨트용 무늬(가는 망 + 굵은 가로 줄) — 한 번 만들어 벨트마다 복제해 반복 수만 바꾼다 */
let meshBase = null;
function meshTexture() {
  if (!meshBase && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#8a9199';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#646b73';
    g.lineWidth = 2;
    for (let i = -64; i < 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); }
    g.strokeStyle = '#4a5058';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, 2); g.lineTo(64, 2); g.stroke();
    meshBase = new THREE.CanvasTexture(c);
    meshBase.wrapS = THREE.RepeatWrapping;
    meshBase.wrapT = THREE.RepeatWrapping;
    meshBase.colorSpace = THREE.SRGBColorSpace;
  }
  return meshBase;
}

/**
 * 메시 벨트 컨베이어 — a → b(Z는 가운데), 폭 w. 옆판 두 장 + 벨트 면(운전 중이면 무늬가 흐른다) + 양 끝 롤러.
 * side: 옆판 재질
 */
export function Belt({ a, b, w = 1.2, on, side = MAT.steelDark, speed = 0.5, rails = true }) {
  const [ax, ay, az = 0] = a;
  const [bx, by] = b;
  const len = Math.hypot(bx - ax, by - ay);
  const ang = Math.atan2(by - ay, bx - ax);
  const tex = useMemo(() => {
    const t = meshTexture()?.clone();
    if (t) { t.repeat.set(len / 0.5, w / 0.5); t.needsUpdate = true; }
    return t;
  }, [len, w]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.5 }), [tex]);
  useFrame((_, d) => { if (on && tex) tex.offset.x -= (d * speed) / 0.5; });
  return (
    <group position={[(ax + bx) / 2, (ay + by) / 2, az]} rotation={[0, 0, ang]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat} receiveShadow>
        <planeGeometry args={[len, w]} />
      </mesh>
      <Box p={[0, -0.06, 0]} s={[len, 0.08, w * 0.96]} m={MAT.dark} />
      {rails && [w / 2 + 0.04, -(w / 2 + 0.04)].map((z) => <Box key={z} p={[0, 0.06, z]} s={[len + 0.1, 0.28, 0.06]} m={side} />)}
      {[-len / 2, len / 2].map((x) => <Cyl key={x} p={[x, -0.04, 0]} r={0.09} h={w + 0.02} m={MAT.steelLight} rot={[Math.PI / 2, 0, 0]} />)}
    </group>
  );
}

const FILLET = 0.22; // 슈트 머리 모서리 둥글기(짧은 수평 머리 → 기울기로 넘어가는 반경 정도)

/**
 * 슈트 선(X-Y 면) — a → b 곧은 선. 앞 컨베이어에서 넘어오는 머리만 수평으로 아주 짧게 나와 살짝 둥글게 꺾인다
 * (각진 이음 대신). 끝은 a→b 기울기 그대로
 */
export function chuteCurve([ax, ay], [bx, by]) {
  const A = new THREE.Vector3(ax, ay, 0);
  const B = new THREE.Vector3(bx, by, 0);
  const K = new THREE.Vector3(ax + Math.sign(bx - ax) * FILLET, ay, 0); // 모서리
  const M = K.clone().addScaledVector(B.clone().sub(K).normalize(), FILLET);
  const path = new THREE.CurvePath();
  path.add(new THREE.QuadraticBezierCurve3(A, K, M));
  path.add(new THREE.LineCurve3(M, B));
  return path;
}

// 홈통 단면 — [폭 방향(-1~1 비율), 바닥에서 높이]. 바닥 모서리를 살짝 둥글게
const TROUGH = [[-1, 1], [-1, 0.32], [-0.97, 0.12], [-0.9, 0.03], [-0.78, 0], [0.78, 0], [0.9, 0.03], [0.97, 0.12], [1, 0.32], [1, 1]];
const dblMat = new Map();
const doubleSided = (m) => {
  if (!dblMat.has(m)) { const c = m.clone(); c.side = THREE.DoubleSide; dblMat.set(m, c); }
  return dblMat.get(m);
};

/** 홈통(슈트) — chuteCurve 선을 따라 바닥 모서리가 살짝 둥근 U 단면, 옆판 윗테는 둥근 봉. 폭 w, 옆판 높이 h, Z 자리 z */
export function Chute({ a, b, w = 0.8, h = 0.26, z = 0, m = MAT.steel }) {
  const { geo, rims } = useMemo(() => {
    const curve = chuteCurve(a, b);
    const n = 28;
    const pos = [];
    const idx = [];
    const rimPts = [[], []];
    for (let i = 0; i <= n; i += 1) {
      const p = curve.getPoint(i / n);
      const tg = curve.getTangent(i / n);
      const nx = -tg.y; // 진행 방향 왼쪽 법선(오른쪽으로 내려가는 슈트에선 위쪽) — 옆판이 서는 쪽
      const ny = tg.x;
      TROUGH.forEach(([s, k]) => pos.push(p.x + nx * k * h, p.y + ny * k * h, z + (s * w) / 2));
      rimPts[0].push(new THREE.Vector3(p.x + nx * h, p.y + ny * h, z - w / 2));
      rimPts[1].push(new THREE.Vector3(p.x + nx * h, p.y + ny * h, z + w / 2));
    }
    const c = TROUGH.length;
    for (let i = 0; i < n; i += 1) {
      for (let k = 0; k < c - 1; k += 1) {
        const p0 = i * c + k;
        idx.push(p0, p0 + c, p0 + 1, p0 + 1, p0 + c, p0 + c + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { geo: g, rims: rimPts.map((pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.025, 6, false)) };
  }, [a[0], a[1], b[0], b[1], w, h, z]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { geo.dispose(); rims.forEach((r) => r.dispose()); }, [geo, rims]);
  return (
    <group>
      <mesh geometry={geo} material={doubleSided(m)} castShadow receiveShadow />
      {rims.map((r, i) => <mesh key={i} geometry={r} material={m} castShadow />)}
    </group>
  );
}
