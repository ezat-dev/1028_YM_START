import * as THREE from 'three';
import { Box } from './parts';

/*
 * 시뮬레이션 레이어(SimLayer)의 좀비 모델 — 앞(+X)을 본다. 발 바닥이 y 0, 키 약 1.75.
 * 움직임(다리 · 팔 · 머리 · 쓰러짐)은 SimLayer가 매 프레임 parts의 그룹을 돌려서 — 이 파일은 모양만.
 * parts: { body, legL, legR, armL, armR, head, acc } 를 채울 빈 객체(ref 묶음). 한꺼번에 20명까지라 그림자는 몸통 · 다리 · 머리만
 * mats: makeFigureMats()로 만든 좀비마다 따로인 재질 — 맞을 때 그 좀비만 번쩍이게(emissive). 눈 · 입 · 장신구는 같이 씀
 * 생김새(LOOKS): 나올 때 applyLook()으로 옷 · 피부 · 머리 색을 바꾸고 그 유형의 장신구(parts.acc[이름])만 보이게 한다
 */

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.02, ...extra });
const eye = std('#3a0000', { emissive: '#ff2a1a', emissiveIntensity: 1.6 });
const mouth = std('#1a1010');
// 장신구 재질(같이 씀)
const A = {
  helmet: std('#f5c518', { roughness: 0.45 }),
  vest: std('#ff7a1a'),
  reflect: std('#e8eef2', { emissive: '#9aa6b0', emissiveIntensity: 0.3, roughness: 0.3 }),
  tie: std('#c62828'),
  collar: std('#f1f1ee'),
  coat: std('#eef0f2'),
  mask: std('#9fd3e6'),
  chefHat: std('#fafafa'),
  apron: std('#f3f1ec'),
  mohawk: std('#e0263d'),
  leather: std('#1c1c20', { roughness: 0.4, metalness: 0.2 }),
  band: std('#e53935'),
  stripe: std('#f5f5f5'),
};

/** 생김새 — 옷(shirt · shirtTorn · pants) · 피부 · 머리 색과 장신구 이름 */
export const LOOKS = {
  worker: { shirt: '#3d5a80', torn: '#2f4766', pants: '#2f3b52', hair: '#3a2f25', acc: 'worker' },
  office: { shirt: '#5b5f66', torn: '#474a50', pants: '#3e4147', hair: '#1f1a16', acc: 'office' },
  doctor: { shirt: '#7fb3c4', torn: '#6b9aa9', pants: '#6d8fa0', hair: '#4a3b2c', acc: 'doctor' },
  chef: { shirt: '#ecebe6', torn: '#d6d4cc', pants: '#2b2b2e', hair: '#2e2a24', acc: 'chef' },
  punk: { shirt: '#1c1c20', torn: '#2a2a30', pants: '#30343c', hair: '#e0263d', acc: 'punk' },
  athlete: { shirt: '#2f5fd0', torn: '#244ca8', pants: '#2f5fd0', hair: '#2e2a24', acc: 'athlete' },
  bigguy: { shirt: '#8a8f7a', torn: '#6e7362', pants: '#4a4036', hair: '#6f8c5d', acc: 'bigguy' },
};
const SKINS = [['#8fae7a', '#6f8c5d'], ['#9fb48a', '#7b9466'], ['#7fa58c', '#5f876d'], ['#a3ab7c', '#828a5c']];

/** 좀비 한 명 몫 재질(번쩍임용으로 따로) — 다 쓰면 Object.values(...).forEach(m => m.dispose()) */
export function makeFigureMats() {
  return {
    skin: std('#8fae7a'),
    skinDark: std('#6f8c5d'),
    shirt: std('#5e6f4a'),
    shirtTorn: std('#47553a'),
    pants: std('#3b4a6b'),
    shoe: std('#2a2622'),
    hair: std('#2e2a24'),
  };
}

/** 생김새 입히기 — 색 바꾸고 그 유형 장신구만 보이게 */
export function applyLook(parts, mats, look) {
  const L = LOOKS[look] ?? LOOKS.worker;
  const [sk, skd] = SKINS[Math.floor(Math.random() * SKINS.length)];
  mats.skin.color.set(sk);
  mats.skinDark.color.set(skd);
  mats.shirt.color.set(L.shirt);
  mats.shirtTorn.color.set(L.torn);
  mats.pants.color.set(L.pants);
  mats.hair.color.set(L.hair);
  // 그 유형 몸 · 머리(…Head) · 소매(…Arm…) 장신구만, 머리칼은 모자 · 올백 · 모히칸 · 민머리면 숨김
  Object.entries(parts.acc ?? {}).forEach(([name, g]) => {
    if (!g) return;
    if (name === 'hair') { g.visible = ['doctor', 'athlete'].includes(L.acc); return; }
    g.visible = name === L.acc || name === `${L.acc}Head` || name.startsWith(`${L.acc}Arm`);
  });
}

export function Figure({ parts, mats }) {
  const { skin, skinDark, shirt, shirtTorn, pants, shoe, hair } = mats;
  parts.acc = parts.acc ?? {};
  const acc = (name) => (el) => { parts.acc[name] = el; };
  return (
    <group ref={(el) => { parts.body = el; }}>
      {/* 다리 — 엉덩이 높이에서 앞뒤로 흔듦 */}
      {[['legL', 0.11], ['legR', -0.11]].map(([key, z]) => (
        <group key={key} ref={(el) => { parts[key] = el; }} position={[0, 0.82, z]}>
          <Box p={[0, -0.4, 0]} s={[0.15, 0.8, 0.14]} m={pants} />
          <Box p={[0.05, -0.79, 0]} s={[0.26, 0.07, 0.15]} m={shoe} cast={false} />
        </group>
      ))}
      {/* 몸통 — 해진 옷(찢어진 틈으로 살) */}
      <Box p={[0, 1.13, 0]} s={[0.26, 0.6, 0.44]} m={shirt} />
      <Box p={[0.131, 1.02, 0.09]} s={[0.012, 0.2, 0.12]} m={skinDark} cast={false} />
      <Box p={[0.131, 1.24, -0.12]} s={[0.012, 0.12, 0.1]} m={shirtTorn} cast={false} />
      <Box p={[0, 0.86, 0]} s={[0.27, 0.06, 0.45]} m={shirtTorn} cast={false} />
      {/* 팔 — 어깨에서 앞으로 쭉(좀비 자세), 소매 + 맨팔 */}
      {[['armL', 0.29], ['armR', -0.29]].map(([key, z]) => (
        <group key={key} ref={(el) => { parts[key] = el; }} position={[0, 1.36, z]}>
          <Box p={[0.09, 0, 0]} s={[0.2, 0.14, 0.14]} m={shirt} cast={false} />
          <Box p={[0.33, -0.01, 0]} s={[0.36, 0.11, 0.11]} m={skin} cast={false} />
          <Box p={[0.54, -0.02, 0]} s={[0.08, 0.1, 0.13]} m={skinDark} cast={false} />
          {/* 운동선수 — 소매 흰 줄 */}
          <group ref={acc(`athleteArm${key}`)} visible={false}><Box p={[0.09, 0.072, 0]} s={[0.2, 0.012, 0.142]} m={A.stripe} cast={false} /></group>
        </group>
      ))}
      {/* 머리 — 빨간 눈 · 벌린 입 · 헝클어진 머리칼 */}
      <group ref={(el) => { parts.head = el; }} position={[0, 1.5, 0]}>
        <Box p={[0, 0.06, 0]} s={[0.1, 0.1, 0.1]} m={skinDark} cast={false} />
        <Box p={[0.01, 0.2, 0]} s={[0.28, 0.3, 0.28]} m={skin} />
        {[0.065, -0.065].map((z) => <Box key={z} p={[0.152, 0.24, z]} s={[0.012, 0.045, 0.055]} m={eye} cast={false} />)}
        <Box p={[0.152, 0.11, 0]} s={[0.012, 0.05, 0.13]} m={mouth} cast={false} />
        <group ref={acc('hair')}>
          <Box p={[-0.02, 0.36, 0.03]} s={[0.24, 0.05, 0.2]} m={hair} cast={false} />
          <Box p={[-0.1, 0.3, -0.08]} s={[0.1, 0.1, 0.12]} m={hair} cast={false} />
        </group>
        {/* 작업자 — 노란 안전모(챙) */}
        <group ref={acc('workerHead')} visible={false}>
          <mesh material={A.helmet} position={[0.01, 0.35, 0]} castShadow><sphereGeometry args={[0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
          <mesh material={A.helmet} position={[0.04, 0.35, 0]}><cylinderGeometry args={[0.21, 0.21, 0.02, 18]} /></mesh>
        </group>
        {/* 회사원 — 올백 */}
        <group ref={acc('officeHead')} visible={false}><Box p={[-0.03, 0.36, 0]} s={[0.26, 0.05, 0.28]} m={hair} cast={false} /></group>
        {/* 의사 — 마스크 */}
        <group ref={acc('doctorHead')} visible={false}><Box p={[0.15, 0.12, 0]} s={[0.02, 0.1, 0.22]} m={A.mask} cast={false} /></group>
        {/* 요리사 — 높은 모자 */}
        <group ref={acc('chefHead')} visible={false}>
          <mesh material={A.chefHat} position={[0, 0.44, 0]}><cylinderGeometry args={[0.14, 0.14, 0.22, 16]} /></mesh>
          <mesh material={A.chefHat} position={[0, 0.58, 0]}><sphereGeometry args={[0.19, 14, 10]} /></mesh>
        </group>
        {/* 펑크 — 빨간 모히칸 */}
        <group ref={acc('punkHead')} visible={false}>
          {[-0.1, -0.03, 0.04, 0.11].map((x) => (
            <mesh key={x} material={A.mohawk} position={[x, 0.42, 0]}><coneGeometry args={[0.035, 0.16, 6]} /></mesh>
          ))}
        </group>
        {/* 운동선수 — 머리띠 */}
        <group ref={acc('athleteHead')} visible={false}><mesh material={A.band} position={[0.01, 0.3, 0]}><cylinderGeometry args={[0.148, 0.148, 0.04, 16, 1, true]} /></mesh></group>
      </group>
      {/* 몸 장신구 */}
      <group ref={acc('worker')} visible={false}>
        <Box p={[0, 1.15, 0]} s={[0.28, 0.5, 0.46]} m={A.vest} cast={false} />
        <Box p={[0.141, 1.05, 0]} s={[0.006, 0.04, 0.44]} m={A.reflect} cast={false} />
        <Box p={[0.141, 1.22, 0]} s={[0.006, 0.04, 0.44]} m={A.reflect} cast={false} />
      </group>
      <group ref={acc('office')} visible={false}>
        <Box p={[0.132, 1.35, 0]} s={[0.012, 0.06, 0.16]} m={A.collar} cast={false} />
        <Box p={[0.134, 1.17, 0]} s={[0.012, 0.32, 0.06]} m={A.tie} cast={false} />
      </group>
      <group ref={acc('doctor')} visible={false}>
        <Box p={[0, 1.0, 0]} s={[0.29, 0.86, 0.47]} m={A.coat} cast={false} />
      </group>
      <group ref={acc('chef')} visible={false}>
        <Box p={[0.134, 0.95, 0]} s={[0.012, 0.55, 0.32]} m={A.apron} cast={false} />
      </group>
      <group ref={acc('punk')} visible={false}>
        <Box p={[0, 1.18, 0]} s={[0.28, 0.46, 0.46]} m={A.leather} cast={false} />
      </group>
      <group ref={acc('athlete')} visible={false} />
      <group ref={acc('bigguy')} visible={false} />
    </group>
  );
}
