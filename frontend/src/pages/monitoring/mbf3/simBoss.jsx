import * as THREE from 'three';
import { Box } from './parts';

/*
 * 시뮬레이션 레이어(SimLayer)의 큰 상대 모양 — Rex(공룡, 땅을 걸음) · Wyrm(드래곤, 날아다님). 앞(+X)을 본다.
 * 움직임(다리 · 꼬리 · 턱 · 날개 · 목)은 SimLayer가 매 프레임 parts의 그룹을 돌려서 — 이 파일은 모양만.
 * parts: 채울 빈 객체 — Rex { root, body, head, jaw, armL, armR, legL, legR, tail1, tail2 },
 *        Wyrm { root, body, neck, head, jaw, mouth(불 뿜는 자리), wingL, wingR, tail1, tail2 }
 * 재질은 한 번에 하나만 나오므로 같이 씀 — 맞을 때 번쩍임(emissive)은 FLASH 목록(눈 빼고)을 SimLayer가 바꿈
 */

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...extra });

export const REX_MATS = {
  skin: std('#5b7a3a'),
  belly: std('#a7b878'),
  dark: std('#3e5528'),
  tooth: std('#f2efe4', { roughness: 0.4 }),
  claw: std('#2a2620'),
  mouth: std('#5a1a1a'),
  eye: std('#3a2a00', { emissive: '#ffcc33', emissiveIntensity: 2 }),
};
export const WYRM_MATS = {
  skin: std('#7a1e2b'),
  belly: std('#d9a066'),
  dark: std('#4a1019'),
  horn: std('#e8e0cc', { roughness: 0.4 }),
  wing: std('#a3283a', { side: THREE.DoubleSide, roughness: 0.6 }),
  eye: std('#3a1500', { emissive: '#ff8a1a', emissiveIntensity: 2.4 }),
};
/** 번쩍임을 바꿀 재질(눈은 늘 빛나므로 뺌) */
export const FLASH = {
  rex: Object.entries(REX_MATS).filter(([k]) => k !== 'eye').map(([, m]) => m),
  wyrm: Object.entries(WYRM_MATS).filter(([k]) => k !== 'eye').map(([, m]) => m),
};

// 날개 막 — 어깨(0, 0, 0)에서 +Z로 펼친 판(손가락 뼈 사이가 패인 모양)
const WING_G = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(0.5, 0);
  sh.lineTo(0.9, 1.0);
  sh.lineTo(0.3, 3.0);
  sh.lineTo(-0.7, 3.5);
  sh.lineTo(-1.0, 2.6);
  sh.lineTo(-1.9, 2.2);
  sh.lineTo(-1.6, 1.3);
  sh.lineTo(-2.0, 0.6);
  sh.lineTo(-1.2, 0);
  sh.closePath();
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(Math.PI / 2); // 판을 눕혀 +Z 쪽으로
  return g;
})();

const set = (parts, k) => (el) => { parts[k] = el; };

/** 공룡 — 엉덩이 높이 1.75, 발바닥 y 0. 큰 머리(턱이 벌어짐) · 작은 팔 · 두 마디 꼬리 · 등 돌기 */
export function Rex({ parts }) {
  const M = REX_MATS;
  return (
    <group ref={set(parts, 'root')} visible={false}>
      <group ref={set(parts, 'body')}>
        <Box p={[0, 2.0, 0]} s={[2.2, 1.25, 1.2]} m={M.skin} />
        <Box p={[0.85, 2.25, 0]} s={[1.0, 1.25, 1.08]} r={[0, 0, 0.35]} m={M.skin} />
        <Box p={[0.2, 1.45, 0]} s={[1.9, 0.3, 1.0]} m={M.belly} cast={false} />
        {[-0.8, -0.3, 0.2, 0.7].map((x) => <Box key={x} p={[x, 2.7, 0]} s={[0.24, 0.26, 0.12]} r={[0, 0, 0.3]} m={M.dark} cast={false} />)}
        <Box p={[1.45, 2.8, 0]} s={[0.75, 0.85, 0.8]} r={[0, 0, 0.5]} m={M.skin} />
        <group ref={set(parts, 'head')} position={[1.75, 3.15, 0]}>
          <Box p={[0.55, 0.12, 0]} s={[1.35, 0.6, 0.78]} m={M.skin} />
          <Box p={[1.2, 0.02, 0]} s={[0.5, 0.45, 0.62]} m={M.skin} />
          <Box p={[0.35, 0.47, 0]} s={[0.6, 0.12, 0.72]} m={M.dark} cast={false} />
          {[0.395, -0.395].map((z) => <Box key={z} p={[0.5, 0.28, z]} s={[0.16, 0.1, 0.02]} m={M.eye} cast={false} />)}
          <Box p={[0.75, -0.17, 0]} s={[1.3, 0.04, 0.5]} m={M.mouth} cast={false} />
          {[0.4, 0.6, 0.8, 1.0, 1.2, 1.38].map((x) => [0.26, -0.26].map((z) => (
            <mesh key={`${x}${z}`} material={M.tooth} position={[x, -0.24, z]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.045, 0.16, 5]} /></mesh>
          )))}
          <group ref={set(parts, 'jaw')} position={[0.05, -0.2, 0]}>
            <Box p={[0.65, -0.12, 0]} s={[1.35, 0.22, 0.66]} m={M.skin} />
            <Box p={[0.65, 0.0, 0]} s={[1.25, 0.03, 0.5]} m={M.mouth} cast={false} />
            {[0.45, 0.7, 0.95, 1.2].map((x) => [0.24, -0.24].map((z) => (
              <mesh key={`${x}${z}`} material={M.tooth} position={[x, 0.06, z]}><coneGeometry args={[0.04, 0.13, 5]} /></mesh>
            )))}
          </group>
        </group>
        {[['armL', 0.55], ['armR', -0.55]].map(([k, z]) => (
          <group key={k} ref={set(parts, k)} position={[1.15, 2.05, z]}>
            <Box p={[0.18, -0.1, 0]} s={[0.42, 0.14, 0.14]} r={[0, 0, -0.6]} m={M.skin} cast={false} />
            <Box p={[0.36, -0.28, 0]} s={[0.12, 0.1, 0.14]} m={M.claw} cast={false} />
          </group>
        ))}
        <group ref={set(parts, 'tail1')} position={[-1.05, 2.05, 0]}>
          <Box p={[-0.75, -0.05, 0]} s={[1.6, 0.85, 0.85]} m={M.skin} />
          {[-0.4, -1.1].map((x) => <Box key={x} p={[x, 0.42, 0]} s={[0.22, 0.2, 0.1]} r={[0, 0, 0.3]} m={M.dark} cast={false} />)}
          <group ref={set(parts, 'tail2')} position={[-1.5, -0.12, 0]}>
            <Box p={[-0.6, -0.05, 0]} s={[1.3, 0.55, 0.55]} m={M.skin} />
            <Box p={[-1.5, -0.12, 0]} s={[0.9, 0.3, 0.32]} m={M.skin} />
          </group>
        </group>
      </group>
      {[['legL', 0.45], ['legR', -0.45]].map(([k, z]) => (
        <group key={k} ref={set(parts, k)} position={[-0.15, 1.75, z]}>
          <Box p={[0.05, -0.4, 0]} s={[0.8, 1.05, 0.5]} m={M.skin} />
          <Box p={[-0.15, -1.15, 0]} s={[0.36, 0.85, 0.36]} m={M.skin} />
          <Box p={[0.15, -1.66, 0]} s={[0.75, 0.18, 0.48]} m={M.dark} />
          {[0.15, 0, -0.15].map((cz) => (
            <mesh key={cz} material={M.claw} position={[0.56, -1.66, cz]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.05, 0.16, 5]} /></mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** 날개 한쪽 — 막 · 앞 뼈 · 손가락 뼈 둘 */
function Wing({ M }) {
  return (
    <>
      <mesh geometry={WING_G} material={M.wing} castShadow />
      <Box p={[0.62, 0.02, 1.5]} s={[0.12, 0.1, 3.0]} r={[0, 0.07, 0]} m={M.dark} cast={false} />
      <Box p={[-0.2, 0.02, 3.2]} s={[1.1, 0.07, 0.07]} r={[0, -0.3, 0]} m={M.dark} cast={false} />
      <Box p={[-0.8, 0.02, 2.2]} s={[2.2, 0.07, 0.07]} r={[0, -0.75, 0]} m={M.dark} cast={false} />
    </>
  );
}

/** 드래곤 — 몸 가운데가 원점(날아다님). 두 마디 목 · 뿔 달린 머리(턱) · 큰 날개 둘(오른쪽은 거울) · 뾰족 꼬리 · 접은 다리 */
export function Wyrm({ parts }) {
  const M = WYRM_MATS;
  return (
    <group ref={set(parts, 'root')} visible={false}>
      <group ref={set(parts, 'body')}>
        <Box p={[0, 0, 0]} s={[2.2, 0.95, 0.95]} m={M.skin} />
        <Box p={[0.1, -0.36, 0]} s={[1.9, 0.3, 0.8]} m={M.belly} cast={false} />
        {[-0.8, -0.3, 0.2, 0.7].map((x) => (
          <mesh key={x} material={M.horn} position={[x, 0.58, 0]} rotation={[0, 0, 0.35]}><coneGeometry args={[0.08, 0.3, 5]} /></mesh>
        ))}
        <group ref={set(parts, 'neck')} position={[1.0, 0.25, 0]}>
          <Box p={[0.45, 0.3, 0]} s={[1.0, 0.5, 0.5]} r={[0, 0, 0.6]} m={M.skin} />
          <Box p={[1.05, 0.75, 0]} s={[0.8, 0.42, 0.42]} r={[0, 0, 0.3]} m={M.skin} />
          <group ref={set(parts, 'head')} position={[1.45, 0.92, 0]}>
            <Box p={[0.3, 0.05, 0]} s={[0.75, 0.42, 0.5]} m={M.skin} />
            <Box p={[0.8, -0.02, 0]} s={[0.5, 0.3, 0.38]} m={M.skin} />
            {[0.18, -0.18].map((z) => (
              <mesh key={z} material={M.horn} position={[0.05, 0.32, z]} rotation={[z > 0 ? 0.25 : -0.25, 0, 2.2]}><coneGeometry args={[0.06, 0.6, 6]} /></mesh>
            ))}
            {[0.255, -0.255].map((z) => <Box key={z} p={[0.45, 0.14, z]} s={[0.14, 0.07, 0.02]} m={M.eye} cast={false} />)}
            <group ref={set(parts, 'mouth')} position={[1.08, -0.08, 0]} />
            <group ref={set(parts, 'jaw')} position={[0.15, -0.16, 0]}>
              <Box p={[0.5, -0.06, 0]} s={[1.0, 0.13, 0.4]} m={M.dark} />
            </group>
          </group>
        </group>
        <group ref={set(parts, 'wingL')} position={[0.35, 0.3, 0.42]}><Wing M={M} /></group>
        <group ref={set(parts, 'wingR')} position={[0.35, 0.3, -0.42]} scale={[1, 1, -1]}><Wing M={M} /></group>
        <group ref={set(parts, 'tail1')} position={[-1.05, 0, 0]}>
          <Box p={[-0.7, 0, 0]} s={[1.5, 0.6, 0.6]} m={M.skin} />
          <group ref={set(parts, 'tail2')} position={[-1.4, 0, 0]}>
            <Box p={[-0.7, 0, 0]} s={[1.4, 0.36, 0.36]} m={M.skin} />
            <mesh material={M.dark} position={[-1.55, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.3]}><coneGeometry args={[0.32, 0.55, 4]} /></mesh>
          </group>
        </group>
        {[[0.6, 0.35], [0.6, -0.35], [-0.6, 0.35], [-0.6, -0.35]].map(([x, z]) => (
          <Box key={`${x}${z}`} p={[x, -0.6, z]} s={[0.25, 0.45, 0.2]} r={[0, 0, 0.5]} m={M.dark} cast={false} />
        ))}
      </group>
    </group>
  );
}
