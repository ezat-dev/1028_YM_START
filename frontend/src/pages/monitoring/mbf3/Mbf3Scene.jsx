import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Html, OrbitControls } from '@react-three/drei';
import { IconMaximize, IconMinimize, IconRefresh } from '@tabler/icons-react';
import { ZONES } from '../mbf1/mbf1Layout';
import { STATE_LABEL, iconOf } from '../integrated/lampIcons';
import { CHUTES, EQ, LAMPS, PIT, VEST, lampPos, sx } from './layout3d';
import { ChargeArea, HopperFeeder, Washer, Furnace, OilTank, SepConveyor, ProductBin, PitFloor } from './equipment';
import { Belt, MAT } from './parts';
import ProductFlow from './flow';
import SimLayer, { SimHud } from './SimLayer';
import '../mbf1/mbf1.css';
import './mbf3.css';

/*
 * MBF3호기 설비 그림 — 풀 3D(three.js). 설비 구성 · 램프 36개는 MBF1 · 2와 같다.
 *  - 마우스 드래그 회전 · 휠 확대(범위 제한), '시점 초기화'로 처음 시점
 *  - 램프는 설비를 따라 붙은 아이콘 타일(운전 연초록 · 정지 흰색 · 알람 연빨강), 마우스를 올리면 이름 · 상태
 *  - 제품 LOT 흐름 · 재료 투입(철통 도착 → 계량 → 승강기 → 붓기) · 로 존 온도 · 버너 · 팬 · 컨베이어 · 스프레이가 상태대로 움직인다
 * state: 램프 상태, temps: { quench, temper } 존별 ℃, charge: { phase, weight } 재료 투입 단계
 */

const zoneOf = new Map(ZONES.map((z) => [z.key, z]));

const TIP_W = 230; // 툴팁 폭(오른쪽 끝에 닿으면 램프 왼쪽에 띄운다)

/**
 * 램프 툴팁 — 화면 맨 위(body, 전체 보기 중이면 그 요소)에 고정 위치로 띄워 다른 램프 · 표시기 · 그림 칸 경계에 가리지 않게
 */
function LampTip({ lamp, state, rect }) {
  const label = STATE_LABEL[state] ?? '확인 불가';
  const flip = rect.right + 12 + TIP_W > window.innerWidth;
  const style = flip ? { left: rect.left - 12, top: rect.top + rect.height / 2, transform: 'translate(-100%, -50%)' } : { left: rect.right + 12, top: rect.top + rect.height / 2 };
  return createPortal(
    <div className="m3-tip is-float" role="tooltip" style={style}>
      <b>{lamp.full}</b>
      <span>{zoneOf.get(lamp.zone)?.name ?? ''} · 램프 {lamp.id}</span>
      <dl>
        <dt>현재 상태</dt>
        <dd><em className={`is-${state}`}>{label}</em> <small>신호 {state === 'run' ? 1 : 0}</small></dd>
        <dt>PLC 주소</dt>
        <dd>{lamp.tag ? <code>{lamp.tag}</code> : <span className="is-none">미지정 (연결 전)</span>}</dd>
      </dl>
    </div>,
    document.fullscreenElement ?? document.body,
  );
}

/**
 * 램프 — 설비를 따라 붙은 아이콘 타일 + 이름(위 줄은 이름이 위, 아래 줄은 이름이 아래).
 * 마우스를 올리면 패널 원래 이름 · 구간 · 현재 상태(신호 값) · PLC 매핑 주소(tag, 연결 전엔 미지정). 올린 램프는 맨 앞으로
 */
function Lamp3({ lamp, state }) {
  const Icon = iconOf(lamp);
  const [rect, setRect] = useState(null);
  return (
    <Html position={lampPos(lamp)} center zIndexRange={rect ? [200, 190] : [40, 10]}>
      <div
        className={`m3-lamp is-${state} is-${lamp.row}`}
        onMouseEnter={(e) => setRect(e.currentTarget.querySelector('.m3-lamp-tile').getBoundingClientRect())}
        onMouseLeave={() => setRect(null)}
      >
        <span className="m3-lamp-tile"><Icon size={13} stroke={1.8} /></span>
        <span className="m3-lamp-label">{lamp.label}</span>
        {rect && <LampTip lamp={lamp} state={state} rect={rect} />}
      </div>
    </Html>
  );
}

/*
 * 기본 시점 — 라인 전체(설비 · 위 램프 · 앞 아래 줄 램프까지 담는 상자 FIT_BOX)의 꼭짓점을 실제로 화면에 투영해 보고,
 * 화면 가운데 오도록 옮기고 · 가장자리에 여백(FIT_MARGIN)만 남도록 거리를 맞춘다(몇 번 되풀이하면 수렴).
 * 라인 정면에서 조금 높이 서서 바라보는 시점(FIT_DIR — 약 13° 위).
 * 칸 크기가 바뀌면(전체 보기 포함) 다시 맞추고, '시점 초기화'도 이 시점으로 돌아온다
 */
// 가로: 롤러 길 왼쪽 끝 ~ 제품 상자 오른쪽 끝(라인이 가로로 길어 가로에 맞춰짐 — 꼭 맞게 잡을수록 크게 보임)
const FIT_BOX = new THREE.Box3(new THREE.Vector3(-36.0, -0.4, -1.8), new THREE.Vector3(29.7, 6.5, 3.4));
const FIT_DIR = new THREE.Vector3(0, 0.23, 1).normalize();
const FIT_MARGIN = 0.98; // 화면(NDC ±1) 중 그림이 차지하는 비율 — 양 끝 램프 이름 표(HTML)가 잘리지 않을 만큼만 여백
const cornersOf = (box) => [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new THREE.Vector3(
  k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z,
));
function fitCamera(camera, box) {
  const corners = cornersOf(box);
  const target = box.getCenter(new THREE.Vector3());
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let dist = 60;
  const place = () => camera.position.copy(target).addScaledVector(FIT_DIR, dist);
  for (let n = 0; n < 10; n += 1) {
    place();
    camera.lookAt(target);
    camera.updateMatrixWorld();
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    corners.forEach((c) => {
      p.copy(c).project(camera);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    });
    // 가운데로 — 화면 어긋남을 대상 거리의 실제 길이로 바꿔 대상점을 옮긴다
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    target.addScaledVector(right, ((x0 + x1) / 2) * tanV * camera.aspect * dist);
    target.addScaledVector(up, ((y0 + y1) / 2) * tanV * dist);
    dist *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) / FIT_MARGIN;
  }
  place();
  camera.lookAt(target);
  return target;
}
function CameraFit({ controls }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    camera.aspect = size.width / Math.max(1, size.height);
    camera.updateProjectionMatrix();
    const target = fitCamera(camera, FIT_BOX);
    const c = controls.current;
    if (c) { c.target.copy(target); c.update(); c.saveState(); }
  }, [camera, size.width, size.height, controls]);
  return null;
}

/** WebGL을 못 쓰는 PC — 안내만 */
class GLBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (this.state.failed) return <div className="m3-fail">이 PC에서는 3D 그림을 표시할 수 없습니다(WebGL 미지원).</div>;
    return this.props.children;
  }
}

function Scene({ state, temps, charge, sim, simHidden, onTap, onStop, onHide, simHud, simBus }) {
  const on = (id) => state[id] === 'run';
  // 시뮬레이션 레이어(SimLayer) — 켜고 숨기기는 Mbf3Scene(상어 3번 · Esc)
  const simLights = useMemo(() => ({ boom: { current: null }, nuke: { current: null }, flame: { current: null } }), []); // 시뮬레이션 레이어 빛 — 처음부터 두고(세기 0) 필요할 때 씀
  const line = on('L13');
  // 화면 흔들림 — 시뮬레이션 신호(simBus.shake)만큼 장면 전체를 살짝 흔듦(카메라는 그대로 — 시점 조작과 안 엉킴)
  const shakeRoot = useRef();
  useFrame((_, dt) => {
    const g = shakeRoot.current;
    if (!g || !simBus) return;
    const k = simBus.shake;
    if (k > 0.002) {
      const a = Math.min(0.5, k * 0.2);
      g.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.6, (Math.random() - 0.5) * a);
      simBus.shake = Math.max(0, k - dt * 2.4);
    } else if (g.position.x || g.position.y || g.position.z) {
      g.position.set(0, 0, 0);
    }
  });
  return (
    <group ref={shakeRoot}>
      <color attach="background" args={['#f3f5f8']} />
      <hemisphereLight args={['#ffffff', '#aeb6c0', 0.75]} />
      <ambientLight intensity={0.2} />
      <directionalLight
        position={[-14, 26, 18]}
        intensity={1.35}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={36}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[20, 10, -12]} intensity={0.35} />

      {/* 바닥(줄눈) — 전세정기 · 유조 · 중간세정기 자리는 구덩이 */}
      <PitFloor />

      {/* ── 재료 투입 · 진동 피더 ── */}
      <ChargeArea on={on('L01')} phase={charge?.phase} weight={charge?.weight} />
      <HopperFeeder on={on('L03')} />

      {/* ── 전세정기 ── */}
      <Washer x0={EQ.fwash.x0} x1={EQ.fwash.x1} outX={EQ.fwash.outX} outY={EQ.fwash.outY} sink={PIT} inletX={CHUTES.feeder[1][0]}
        on={{ spray: on('L07'), pump: on('L07'), conv: on('L06'), skim: on('L05') }} />

      {/* ── 소입로 ── */}
      <Furnace kind="quench" charge={EQ.quench.charge} x0={EQ.quench.x0} x1={EQ.quench.x1} zones={EQ.quench.zones}
        hot={on('L13') || on('L12')} burnerOn={on('L12')} beltOn={line} temps={temps?.quench}
        fans={[{ x: sx(480), on: on('L09') }, { x: sx(600), on: on('L10') }]} stacks={[{ x: EQ.quench.x0 - VEST / 2, h: 1.7, base: 2.95, smoke: on('L11') }]}
        blowerX={sx(470)} />

      {/* ── 유조 · 유절 컨베이어 ── */}
      <OilTank on={{ agit: on('L14'), conv: on('L19'), hx: on('L18'), flow: line }} onFinTap={onTap} />
      <SepConveyor on={{ conv: on('L20'), blower: on('L21') }} />

      {/* ── 중간세정기 ── */}
      <Washer x0={EQ.mwash.x0} x1={EQ.mwash.x1} outX={EQ.mwash.outX} outY={EQ.mwash.outY} sink={PIT} inletX={CHUTES.sep[1][0]}
        on={{ spray: on('L26'), pump: on('L26'), conv: on('L24'), skim: on('L23') }} />

      {/* ── 소려로 ── */}
      <Furnace kind="temper" charge={EQ.temper.charge} x0={EQ.temper.x0} x1={EQ.temper.x1} zones={EQ.temper.zones}
        hot={on('L32') || on('L31')} burnerOn={on('L31')} beltOn={line} temps={temps?.temper} exitVestibule
        fans={[['L27', 1290], ['L28', 1382], ['L29', 1474], ['L30', 1566]].map(([id, x]) => ({ x: sx(x), on: on(id) }))}
        stacks={[{ x: EQ.temper.x0 - VEST / 2, h: 1.4, base: 2.95 }, { x: EQ.temper.x1 + VEST / 2, h: 1.4, base: 2.95 }]}
        blowerX={sx(1300)} />

      {/* ── 방청조 · 제품 상자 ── */}
      <Belt a={[EQ.temper.x1 + VEST, 1.6, 0]} b={[EQ.rust.x0 + 0.3, 1.6]} w={1.4} on={line} />
      <Washer x0={EQ.rust.x0} x1={EQ.rust.x1} outX={EQ.rust.outX} outY={EQ.rust.outY} convY={EQ.rust.convY} liquid={MAT.rust} h={EQ.rust.h}
        on={{ spray: on('L35'), pump: on('L35'), conv: on('L34') }} />
      <ProductBin />

      {/* 제품 흐름 · 램프 */}
      <ProductFlow running={line} />
      {sim && <SimLayer drop={sim} paused={simHidden} onClear={onStop} onHide={onHide} lights={simLights} hud={simHud} bus={simBus} />}
      <pointLight ref={simLights.boom} intensity={0} color="#ffa040" distance={9} decay={1.6} />
      <pointLight ref={simLights.nuke} intensity={0} color="#ff9a3c" distance={70} decay={1.2} />
      <pointLight ref={simLights.flame} intensity={0} color="#ff8a2a" distance={16} decay={1.4} />
      {LAMPS.map((l) => <Lamp3 key={l.id} lamp={l} state={state[l.id] ?? 'stop'} />)}
    </group>
  );
}

export default function Mbf3Scene({ state, title, note, temps, charge }) {
  // 시뮬레이션 레이어 — 유조 상어를 1.5초 안에 3번 누르면 켜짐(한 번은 아무 일 없음).
  // Esc는 그 자리에서 멈추고 숨김(시점도 처음으로) — 다시 상어 3번이면 하던 데서 이어서. 차가 터지거나 다 깨면 끝(다음엔 처음부터)
  const [sim, setSim] = useState(null);
  const [simHidden, setSimHidden] = useState(false);
  const taps = useRef([]);
  const onTap = useCallback(() => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 1500), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      setSim((cur) => cur ?? { id: Date.now(), x: -4.7, z: 4.2 });
      setSimHidden(false);
    }
  }, []);
  const onStop = useCallback(() => { setSim(null); setSimHidden(false); controls.current?.reset(); }, []);
  const onHide = useCallback(() => { setSimHidden(true); controls.current?.reset(); }, []);
  const simHud = useMemo(() => ({ sk: [] }), []);
  const simBus = useMemo(() => ({ shake: 0, flash: 0, flashColor: '255, 255, 255' }), []);
  const controls = useRef();
  const wrap = useRef();
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  // 전체 보기 — 그림 칸만 화면 가득(F11처럼), 다시 누르거나 Esc로 돌아온다
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else wrap.current?.requestFullscreen?.().catch(() => {});
  };
  const counts = useMemo(() => {
    const c = { run: 0, stop: 0, alarm: 0 };
    LAMPS.forEach((l) => { c[state[l.id] ?? 'stop'] += 1; });
    return c;
  }, [state]);
  const line = state.L13 === 'run';
  return (
    <div className={`mb-wrap m3-wrap${full ? ' is-full' : ''}`} ref={wrap}>
      <div className="mb-legend m3-legend">
        {title && <b className="mb-legend-title">{title}</b>}
        <span className="m3-legend-item is-run"><i />운전 <b>{counts.run}</b></span>
        <span className="m3-legend-item is-stop"><i />정지 <b>{counts.stop}</b></span>
        <span className="m3-legend-item is-alarm"><i />알람 <b>{counts.alarm}</b></span>
        <span className={`mb-legend-flow${line ? ' is-on' : ''}`}>{line ? '라인 이송 중' : '라인 이송 정지'}</span>
        <span className="m3-hint">드래그 회전 · 휠 확대</span>
        <button type="button" className="m3-reset" onClick={() => controls.current?.reset()} title="처음 시점으로">
          <IconRefresh size={13} />시점 초기화
        </button>
        <button type="button" className="m3-reset" onClick={toggleFull} title={full ? '원래 크기로 (Esc)' : '그림을 화면 가득'}>
          {full ? <IconMinimize size={13} /> : <IconMaximize size={13} />}{full ? '전체 보기 종료' : '전체 보기'}
        </button>
        {note && <span className="mb-legend-note">{note}</span>}
      </div>
      <div className="m3-canvas">
        <GLBoundary>
          <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 10, 42], fov: 34, near: 0.5, far: 400 }} gl={{ antialias: true }}>
            <Scene state={state} temps={temps} charge={charge} sim={sim} simHidden={simHidden} onTap={onTap} onStop={onStop} onHide={onHide} simHud={simHud} simBus={simBus} />
            <OrbitControls ref={controls} makeDefault target={[0, 2.1, 0.6]} enableDamping dampingFactor={0.08}
              minDistance={8} maxDistance={260} minPolarAngle={0.25} maxPolarAngle={1.5} enablePan screenSpacePanning />
            <CameraFit controls={controls} />
          </Canvas>
        </GLBoundary>
        {sim && !simHidden && <SimHud hud={simHud} />}
      </div>
    </div>
  );
}
