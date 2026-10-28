import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MAT, Box, Cyl } from './parts';
import { Booms, Debris, Fire, GLOW_TEX, Glows, NukeBlast, Smoke, Sparks } from './simFx';
import { Figure, applyLook, makeFigureMats } from './simFigure';
import { FLASH, Rex, Wyrm } from './simBoss';

/*
 * 시뮬레이션 레이어 — 유조 상어를 1.5초 안에 3번 누르면 RC카가 하늘에서 떨어져 바닥에 튕기며 내려앉고, 방향키로 몬다.
 *  - Esc: 그 자리에서 멈추고 모두 숨김 · 시점도 처음으로(Mbf3Scene). 상어를 다시 3번 누르면 하던 데서 이어서
 *  - ↑ ↓ 가속 · 후진, ← → 방향(달릴 때만 돈다, 후진이면 반대로). 바퀴가 구르고 앞바퀴가 꺾인다
 *  - 라인 앞 바닥 통로(DRIVE) 안에서만 — 설비를 뚫고 가지 않게. 통로 끝에 닿으면 멈추지 않고 벽을 따라 미끄러진다
 *  - 키: Q 미사일 · W 유도 · E 블랙홀 · R 핵 · A 대시 · S 유성우 · D 눈보라 · Z 화염방사 · X 지진 · C 드론 · Esc 숨기기(자판 자리로 — 한글 입력이어도 됨)
 *  - Q(누르는 동안 연사): 지붕 2연장 발사관에서 좌우 번갈아 미사일 발사(발사 섬광 · 연기 꼬리, 차는 안 밀림). 맞으면
 *    섬광 · 불덩이 · 충격파 고리 · 불티 · 검은 연기 · 그을음(simFx). 빗나가면 작은 폭발
 *  - W: 유도 미사일 6발 — 미사일 난무: 위 · 사방으로 크게 흩어져 튀어나간 뒤 3D 속도로 점점 세게 꺾여 휘감듯 들어감,
 *    하얀 굵은 연기 꼬리가 하늘에 오래 남음, 조준 고리는 발사 때 크게 → 착 조임, 명중은 청백 섬광 · 충격 고리.
 *    관에서 툭 튀어나와 점화(섬광), 파란 띠 · 파란 불꽃 · 바로 뒤 빛줄기. 6발이 가까운 좀비들을 나눠 맡음
 *  - R: 핵미사일 — 지붕에서 하늘로 곧게 솟았다가 좀비들 한가운데(없으면 차 앞)로 내리꽂힌다.
 *    섬광 · 불덩이 · 버섯구름 · 먼지 고리 · 충격파(rcFx NukeBlast). 충격파가 지나가면 좀비는 모두 쓰러지고,
 *    차도 가까우면 크게 흔들리며 밀려남. 한 발 쏘면 NUKE_COOL초 뒤 다시
 *  - 처음 나타날 때 숨은 것(좀비 · 미사일 · 폭발 · 핵)까지 셰이더를 미리 만들어 둔다 — 처음 보일 때 몇 초씩 멈추던 것 방지
 *  - 웨이브(START_WAVE~WAVES, 어렵게): 웨이브마다 좀비 수 · 속도 · 체력이 늘고 나오는 간격이 짧아진다(한꺼번에 최대 ZOMBIES명).
 *    5웨이브부터 뛰는 좀비, 10웨이브부터 큰 좀비(체력 4배). 좀비에게 물리면 차 체력이 깎이고
 *    0이면 차가 터지고 잠시 뒤 저절로 끝나 평소 모니터링 화면으로(처음부터 다시). WAVES웨이브를 다 깨도 조용히 끝남. 웨이브를 깨면 체력 조금 회복. 맞은 좀비는 뒤로 쓰러져 바닥으로 가라앉음
 *  - E 블랙홀(자동 조준): 지붕에서 보라 구체를 던짐 → 좀비가 가장 많이 몰린 곳(거리 무관, 다른 블랙홀 자리는 피함)을 쫓아가 열림(검은 핵 · 기울어진 강착원반 · 빛 고리 ·
 *    바닥 소용돌이 · 보라 번개). BH_HOLD초 동안 더 몰린 곳으로 천천히 미끄러지며 둘레 좀비를 소용돌이치며 끌어당기고(가까울수록 세게, 공중으로 뜸),
 *    핵에 닿은 좀비는 빙글 돌며 작아져 삼켜짐. 끝에 쪼그라들었다가 보라 섬광 · 폭발 고리로 터져 둘레를 날려 버림
 *  - S 유성우: 하늘이 붉게 번쩍, 가까운 목표마다(남으면 차 앞 둘레) 붉은 경고 원 → 불타는 바위가 차례로 비스듬히
 *    떨어짐(불길 꼬리 · 연기 · 불티). 떨어진 자리는 폭발 · 불꽃 고리 · 녹은 바닥 빛, 둘레 MET_R 안 피해
 *  - A 대시: 출발 충격파 · 붉은 잔상 · 불꽃 꼬리를 남기며 돌진(그동안 안 다침), 부딪친 좀비는 쓰러짐
 *  - Z 화염방사(누르는 동안): 앞 범퍼 노즐에서 거대한 불길이 넓게 FLAME_R까지 뻗음 — 노즐 앞 희고 푸른 고압 심 → 커다란 주황
 *    불덩이(흰 → 주황 → 검게 식음) · 불티 · 끝에서 피어오르는 검은 연기, 주황 불빛이 일렁이고 땅이 살짝 울림.
 *    땅에 떨어진 불은 잠시 타오름(밟으면 불붙음). 부채꼴 안 좀비는 타며 깎이고 불붙어(BURN초) 몸에서 불길이 오르며 더 깎임, 보스도 깎임
 *  - X 지진: 차가 땅을 내리찍음 → 몰린 곳(없으면 앞) 쪽 세 갈래로 땅이 갈라지며(용암 빛 금) 바위 기둥이 차례로 솟음.
 *    기둥에 걸린 좀비는 크게 다치며 공중으로 튕겨 오름, 보스도 깎임
 *  - C 드론: 드론 DRONES대가 차에서 솟아(DRONE_T초, 다시 누르면 시간 처음부터) 저마다 다른 상대(가까운 순, 겹치지 않게)를 맡아
 *    그 하늘로 날아가 둘레를 돌며 아래로 쌍열 기관포 연사(청록 예광탄 · 총구 불빛), 가는 쪽으로 기울고, 탐조등이 상대를 비추고
 *    땅에 조준 표시. 상대가 없으면 차 앞 하늘에서 대기, 시간이 다 되면 하늘로 날아가 사라짐
 *  - D 눈보라: 좀비가 가장 많이 몰린 곳(없으면 차 앞)에서 냉기 고리가 BLZ_R까지 퍼지며(바닥 서리 · 고드름 · 휘몰아치는 눈 · 화면 가장자리 성에) 닿는 좀비를
 *    FREEZE초 얼림 — 얼음에 갇혀 못 움직이고 못 묾, 맞으면 피해 1.5배 · 그대로 쓰러지면 얼음째 산산조각, 다 녹으면 얼음이 깨짐
 *  - 타격감: 맞으면 그 좀비만 하얗게 번쩍(쓰러지면 빨갛게) · 무기 힘만큼 밀려 미끄러짐 · 머리 젖힘 · 팔 휘청, 초록 체액 · 바닥 얼룩,
 *    쓰러뜨리는 순간 아주 짧게 느려짐(히트스톱). 센 폭발에 쓰러지면 공중으로 날아가 돌며 떨어짐
 *  - 좀비는 통로 오른쪽 끝(14 안)에서만 솟아남
 *  - 보스(BOSS_EVERY웨이브마다, 공룡 · 드래곤 번갈아 — 모양은 simBoss): 그 웨이브는 좀비 절반 + 보스, 보스까지 쓰러뜨려야 다음 웨이브.
 *    공룡은 걸어와 가까우면 묾, 가끔 포효 → 돌진(밟힌 좀비도 쓰러짐). 드래곤은 차 둘레 하늘을 돌다 불을 뿜거나 내리꽂힘.
 *    모든 무기가 맞음(드래곤도 낮게 나는 무기에 맞게 가로 거리로 판정), 눈보라에 잠깐 얼고, 블랙홀 안에선 계속 깎임. 위쪽 가운데 체력 막대
 *  - 좀비 생김새: 작업자 · 회사원 · 의사 · 요리사 · 펑크 · 운동선수(뛰는 좀비) · 덩치(큰 좀비) — simFigure LOOKS
 *  - HUD(SimHud, 그림 칸 왼쪽 위): 웨이브 · 체력 막대 · 남은 좀비 · 처치 · 기술 재사용 대기, 가운데 웨이브 알림
 *  - 차가 있을 때만 방향키 · 스페이스 · Ctrl · Shift를 받고, 그동안 방향키 · 스페이스 스크롤을 막는다(입력칸에 쓰는 중이면 무시). Esc로 숨긴다. 글자 안내는 없음
 * drop: { id, x, z } — 떨어질 자리(id가 바뀌면 처음부터 다시)
 * paused: 숨김 — 그동안 그리지도 움직이지도 않고 키도 안 받음(풀면 그대로 이어서)
 * onHide: Esc(숨기기) · onClear: 끝(차가 터지거나 다 깸 — 처음부터)
 * bus: { shake, flash, flashColor } — 화면 흔들림(장면 바깥 그룹이 읽음) · 번쩍임(HUD가 읽음) 신호
 * hud: SimHud가 채우는 화면 요소 묶음(매 프레임 글자 · 막대를 직접 고침 — React 다시 그리기 없이)
 * lights: { boom, nuke, flame } — 장면에 처음부터 있는 pointLight 셋(ref). 차가 나타날 때 빛을 새로 넣으면 빛 개수가 바뀌어
 *   장면 전체 셰이더를 다시 만들며 몇 초 멈추므로, 늘 있는 빛을 옮기고 세기만 바꾼다
 */

const G = 22; // 떨어지는 중력(보기 좋게)
const DROP_Y = 16;
const ACC = 17; // 가속(단위/초²) — 끝 속도 ≈ ACC / FRICTION(약 12)
const FRICTION = 1.4;
const VMAX = 12;
const TURN = 3.2; // 최고 속도일 때 회전(rad/초)
const DRIVE = { x0: -38, x1: 34, z0: 2.3, z1: 14 }; // 달릴 수 있는 바닥(라인 앞 통로)
const WHEEL_R = 0.17;
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const MISSILES = 24; // 한꺼번에 날 수 있는 미사일 수(연사)
const M_V0 = 9; // 발사 직후 속도 → M_SPEED까지 빠르게 붙음
const M_SPEED = 30;
const M_LIFE = 1.5; // 초
const M_COOL = 0.1; // 발사 간격(초) — 누르고 있으면 연사
const M_Y = 0.62; // 발사관 높이
const HIT_R = 1.0;
const STUN = 2.5; // 맞은 경찰차가 멈춰 도는 시간(초)
const HOMINGS = 36; // 한꺼번에 날 수 있는 유도 미사일 수(연타하면 쌓임)
const SALVO = 6; // Ctrl 한 번에 나가는 유도 미사일
const SALVO_GAP = 0.05; // 일제 사격 한 발 사이(초)
const H_SPEED = 24;
const H_TURN = 7; // 유도 미사일이 꺾는 최대 속도(rad/초) — 처음엔 약하게, 점점 세게
const H_LIFE = 3.5;
const H_COOL = 0; // 일제 사격 사이(초) — 쿨타임 없음
const H_IGNITE = 0.14; // 관에서 튀어나와 점화되기까지(초)
const NUKE_UP = 1.3; // 하늘로 솟는 시간(초)
const NUKE_DOWN = 1.1; // 내리꽂히는 시간(초)
const NUKE_TOP = 15; // 솟는 높이
const NUKE_COOL = 0; // 다시 쏠 수 있기까지(초) — 쿨타임 없음(앞 핵이 터지면 바로)
const NUKE_SCALE = 2.4; // 핵미사일 크기(보통 미사일 대비)
const ZOMBIES = 14; // 한꺼번에 나올 수 있는 좀비(자리)
const GOO = 30; // 바닥 체액 얼룩 수
const HITSTOP = 0.05; // 쓰러뜨리는 순간 느려지는 시간(초)
const Z_HIT = 0.75; // 미사일 판정 반지름
const Z_BITE = 0.85; // 이만큼 붙으면 물음
const Z_RISE = 1.2; // 솟아오르는 시간(초)
const WAVES = 100;
const BOSS_EVERY = 5; // 이 웨이브마다 보스
const BOSS_SCALE = { rex: 1.35, wyrm: 1.25 };
const bossHp = (n, kind) => (kind === 'rex' ? 160 + n * 5 : 130 + n * 4);
const START_WAVE = 30; // 처음 시작 웨이브(쉬워서 30부터)
const CAR_HP = 100;
const waveCount = (n) => 4 + n; // 웨이브 n 좀비 수(30웨이브 34 · 50웨이브 54)
const waveGap = (n) => Math.max(0.22, 1.3 - n * 0.025); // 나오는 간격(초)
const zHp = (n) => 6 + Math.floor(n / 3); // 30웨이브 16 · 50웨이브 22(큰 좀비는 4배)
const zSpeed = (n) => 0.9 + n * 0.03; // 30웨이브 1.8 · 50웨이브 2.4
const biteDmg = (n) => 1 + n * 0.02; // 한 번 물 때 차 체력(100) 깎임 — 간지러운 정도(30웨이브 1.6 · 50웨이브 2)
const BH_POOL = 3; // E 블랙홀 — 한꺼번에 열릴 수 있는 수(연타)
const BH_R = 7.5; // 끌어당기는 반지름
const BH_Y = 1.5; // 떠 있는 높이
const BH_FLY = 0.45; // 던져져 날아가는 시간(초)
const BH_OPEN = 0.35; // 열리는 시간
const BH_HOLD = 2.6; // 빨아들이는 시간
const BH_COLLAPSE = 0.3; // 쪼그라드는 시간 → 폭발
const BH_EAT = 0.75; // 핵에 이만큼 가까워지면 삼킴
const BH_BLAST_R = 6; // 마지막 폭발 반지름
const METEORS = 30; // S 유성 — 한꺼번에 떨어질 수 있는 수(연타)
const MET_N = 12; // S 한 번에 떨어지는 유성
const MET_R = 2.3; // 하나가 맞히는 반지름
const MET_FALL = 0.8; // 하늘 → 땅(초)
const MET_SKY = { x: -9, y: 24, z: -6 }; // 목표에서 이만큼 위 · 왼쪽 · 뒤에서 비스듬히 떨어짐
const DASH_S = 0.55; // C 대시 시간(초)
const DASH_V = 26;
const DASH_COOL = 0; // 쿨타임 없음(누르면 대시 시간 다시)
const GHOSTS = 5; // 대시 잔상 수
const BLZ_R = 10; // D 눈보라 — 얼리는 반지름
const BLZ_SPREAD = 0.7; // 냉기 고리가 끝까지 퍼지는 시간(초)
const BLZ_LIFE = 4; // 바닥 서리 · 눈발이 남는 시간
const FREEZE = 5; // 얼어 있는 시간(초)
const SPIKES = 40; // 고드름 자리
const FLAME_R = 18; // Z 화염방사 사거리
const FLAME_DPS = 10; // 불길 안 초당 피해
const FIRE_PATCH = 40; // 땅에 떨어진 불 자리
const PATCH_LIFE = 2.2; // 땅의 불이 타는 시간(초)
const BURN = 2.5; // 불붙어 타는 시간(초)
const BURN_DPS = 2;
const QUAKE_LEN = 18; // X 지진 — 갈라짐이 뻗는 길이
const QUAKE_T = 0.9; // 끝까지 뻗는 시간(초)
const QUAKE_GAP = 1.2; // 바위 기둥 사이
const ROCKS = 48; // 바위 기둥 자리
const DRONES = 4; // C 드론
const DRONE_T = 12; // 드론이 있는 시간(초)
const DRONE_RANGE = 5; // 맡은 상대가 이만큼 가까워지면 쏨(가로)
const DRONE_FIRE = 0.12; // 드론 한 대 연사 간격(초)
const BULLETS = 80; // 드론 탄 자리
// 키(자판 자리) → 동작. Q · Z는 누르는 동안, 나머지는 누를 때 한 번
const SKILL_KEYS = { KeyW: 'homing', KeyE: 'hole', KeyR: 'nuke', KeyA: 'dash', KeyS: 'meteor', KeyD: 'blizzard', KeyX: 'quake', KeyC: 'drone' };

const bodyMat = new THREE.MeshStandardMaterial({ color: '#e0352b', roughness: 0.35, metalness: 0.2 });
const tireMat = new THREE.MeshStandardMaterial({ color: '#1d2126', roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: '#f5c518', roughness: 0.4, metalness: 0.4 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#2b3a4a', roughness: 0.1, metalness: 0.3 });
const dustMat = new THREE.MeshBasicMaterial({ color: '#c9ced6', transparent: true, opacity: 0, depthWrite: false });
const missileMat = new THREE.MeshStandardMaterial({ color: '#e9edf1', roughness: 0.25, metalness: 0.45 });
const noseMat = new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.35, metalness: 0.2 });
const finMat = new THREE.MeshStandardMaterial({ color: '#39424d', roughness: 0.4, metalness: 0.5 });
const bandMat = new THREE.MeshStandardMaterial({ color: '#f2c12e', roughness: 0.4 });
const nozzleMat = new THREE.MeshStandardMaterial({ color: '#2a2e33', roughness: 0.5, metalness: 0.7 });
const podMat = new THREE.MeshStandardMaterial({ color: '#3a4049', roughness: 0.45, metalness: 0.5 });
const flameCoreMat = new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
const flameMat = new THREE.MeshBasicMaterial({ color: '#ff8a24', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
const flameBlue = new THREE.MeshBasicMaterial({ color: '#3ab4ff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
const nukeAimMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const nukeColMat = new THREE.MeshBasicMaterial({ color: '#ff3b2a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
const ghostMat = new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
// 얼음 — 반투명 푸른 결정(속이 비쳐 보이게 깊이는 안 씀)
const iceMat = new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2, emissive: '#2f8fd6', emissiveIntensity: 0.4, flatShading: true, depthWrite: false });
// 바닥 서리 — 가운데서 뻗는 얼음 결정 가지(캔버스로 그림)
const FROST_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  [[0, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(235,248,255,0.55)'], [0.9, 'rgba(220,242,255,0.25)'], [1, 'rgba(220,242,255,0)']].forEach(([at, col]) => r.addColorStop(at, col));
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineCap = 'round';
  const branch = (x, y, a, len, w, depth) => {
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    if (depth > 0) {
      [0.35, 0.65].forEach((t) => {
        const bx = x + (x2 - x) * t;
        const by = y + (y2 - y) * t;
        branch(bx, by, a + 0.7, len * 0.4, w * 0.6, depth - 1);
        branch(bx, by, a - 0.7, len * 0.4, w * 0.6, depth - 1);
      });
    }
  };
  for (let k = 0; k < 14; k += 1) branch(128, 128, (k / 14) * Math.PI * 2 + Math.random() * 0.2, 70 + Math.random() * 45, 2.2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const frostMat = new THREE.MeshBasicMaterial({ map: FROST_TEX, color: '#a9dcff', transparent: true, opacity: 0, depthWrite: false });
const lockMat = new THREE.MeshBasicMaterial({ color: '#ff5a2a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const noseBlue = new THREE.MeshStandardMaterial({ color: '#1e6fd9', roughness: 0.35, metalness: 0.3 });
const bandCyan = new THREE.MeshStandardMaterial({ color: '#36c5f0', roughness: 0.35, emissive: '#0a6b8a', emissiveIntensity: 0.6 });
const sprite = (color) => new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const flameGlowMat = sprite('#ff9a3c');
const flameGlowBlue = sprite('#7fd0ff');
// 블랙홀 셰이더 — 시간(HOLE_T)은 모두 같이 씀
//  - 원반: 나선으로 도는 뜨거운 가스(안쪽 흰색 → 주황 → 보라), 다가오는 쪽(오른쪽)이 더 밝음, 안쪽 가장자리는 하얗게 달아오름
//  - 빛 고리(uLens): 핵 뒤쪽 원반이 휘어 위로 넘어와 보이는 것 — 위가 더 밝음
//  - 테두리 빛: 핵 가장자리만 주황 → 흰빛(광자 구) · 제트: 양극으로 뿜는 푸른 빛줄기 · 바닥: 나선 팔 + 안쪽으로 빨려 드는 물결
const HOLE_T = { value: 0 };
const GLSL_NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }
`;
const VS_UV = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const holeShader = (fs, uniforms = {}, vs = VS_UV) => new THREE.ShaderMaterial({
  uniforms: { uTime: HOLE_T, ...uniforms }, vertexShader: vs, fragmentShader: GLSL_NOISE + fs,
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
});
const DISK_FS = `
uniform float uTime; uniform float uLens; varying vec2 vUv;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r = length(d);
  if (r > 1.0) discard;
  float rin = 0.3;
  float lr = log(max(r, 0.01));
  float t1 = 3.0 * lr + uTime * 1.8;
  float t2 = 2.2 * lr + uTime * 0.9;
  vec2 q1 = mat2(cos(t1), -sin(t1), sin(t1), cos(t1)) * d;
  vec2 q2 = mat2(cos(t2), -sin(t2), sin(t2), cos(t2)) * d;
  float n = fbm(q1 * 7.0) * 0.65 + fbm(q2 * 13.0 + 7.0) * 0.5;
  float streak = pow(n, 1.6) * 1.9;
  float temp = 1.0 - smoothstep(rin, 0.95, r);
  vec3 col = mix(vec3(0.42, 0.08, 0.8), vec3(1.0, 0.42, 0.1), smoothstep(0.0, 0.5, temp));
  col = mix(col, vec3(1.0, 0.95, 0.85), smoothstep(0.72, 1.0, temp));
  float edge = smoothstep(rin, rin + 0.035, r) * (1.0 - smoothstep(0.5, 1.0, r));
  float hot = exp(-pow((r - rin - 0.035) * 26.0, 2.0)) * 1.8;
  float dop = 0.45 + 0.9 * (0.5 + 0.5 * d.x / max(r, 0.001));
  float I = edge * (streak * (0.35 + temp * 1.5) + hot) * dop;
  if (uLens > 0.5) I *= 0.45 + 1.1 * smoothstep(-0.3, 0.9, d.y / max(r, 0.001));
  gl_FragColor = vec4(col * I, 1.0);
}`;
const diskMat = holeShader(DISK_FS, { uLens: { value: 0 } });
const haloMat = holeShader(DISK_FS, { uLens: { value: 1 } });
const holeRimMat = holeShader(`
uniform float uTime; varying vec3 vN; varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
  vec3 col = mix(vec3(1.0, 0.5, 0.18), vec3(1.0, 0.96, 0.88), f);
  gl_FragColor = vec4(col * f * 2.4 * (0.85 + 0.15 * sin(uTime * 23.0)), 1.0);
}`, {}, 'varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }');
holeRimMat.side = THREE.FrontSide;
const JET_FS = `
uniform float uTime; uniform float uFlip; varying vec2 vUv;
void main() {
  float t = uFlip > 0.5 ? 1.0 - vUv.y : vUv.y;
  float s1 = 0.5 + 0.5 * sin(6.2832 * 4.0 * vUv.x + t * 9.0 - uTime * 11.0);
  float pulse = vnoise(vec2(t * 7.0 - uTime * 12.0, 1.7));
  float I = (1.0 - t) * smoothstep(0.0, 0.04, t) * (0.25 + s1 * 0.5 + pulse * 0.9);
  vec3 col = mix(vec3(0.4, 0.55, 1.0), vec3(0.92, 0.96, 1.0), pulse);
  gl_FragColor = vec4(col * I * 1.4, 1.0);
}`;
const jetUpMat = holeShader(JET_FS, { uFlip: { value: 0 } });
const jetDownMat = holeShader(JET_FS, { uFlip: { value: 1 } });
const swirlMat = holeShader(`
uniform float uTime; varying vec2 vUv;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r = length(d);
  if (r > 1.0) discard;
  float a = atan(d.y, d.x);
  float arms = pow(0.5 + 0.5 * sin(3.0 * a - 9.0 * log(max(r, 0.02)) + uTime * 5.0), 3.0);
  float rip = pow(0.5 + 0.5 * sin(r * 38.0 + uTime * 10.0), 8.0);
  float fade = (1.0 - smoothstep(0.6, 1.0, r)) * smoothstep(0.06, 0.3, r);
  vec3 col = mix(vec3(0.32, 0.1, 0.7), vec3(0.9, 0.62, 1.0), arms);
  gl_FragColor = vec4(col * fade * (arms * 0.55 + rip * 0.35 + 0.06), 1.0);
}`);
const JET_L = 7; // 제트 길이
const holeMat = new THREE.MeshBasicMaterial({ color: '#000000' });
const holeGlowMat = sprite('#a45cff');
const voidMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: '#000000', transparent: true, opacity: 0.8, depthWrite: false }); // 핵 둘레를 어둡게(빛이 빨려 든 느낌)
// 유성 — 달아오른 바위 · 불길 · 빛
const meteorRock = new THREE.MeshStandardMaterial({ color: '#2b1d17', emissive: '#ff5a14', emissiveIntensity: 1.4, roughness: 0.9, flatShading: true });
const meteorFireMat = new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
const meteorGlowMat = sprite('#ff8a2a');
const meteorHotMat = sprite('#fff1c0');
const ringMat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
// 바위 기둥 · 드론
const rockMat = new THREE.MeshStandardMaterial({ color: '#7a6650', roughness: 0.95, flatShading: true });
const rockDark = new THREE.MeshStandardMaterial({ color: '#4d4033', roughness: 0.95, flatShading: true });
const droneMat = new THREE.MeshStandardMaterial({ color: '#2b3440', roughness: 0.35, metalness: 0.6 });
const droneLed = new THREE.MeshStandardMaterial({ color: '#063040', emissive: '#3fe0ff', emissiveIntensity: 2.2 });
const bladeMat = new THREE.MeshStandardMaterial({ color: '#9aa4b0', roughness: 0.4, metalness: 0.3 });
const droneShell = new THREE.MeshStandardMaterial({ color: '#3a4656', roughness: 0.3, metalness: 0.5 });
const droneLedRed = new THREE.MeshStandardMaterial({ color: '#400808', emissive: '#ff3030', emissiveIntensity: 2 });
const rotorDisc = new THREE.MeshBasicMaterial({ color: '#c8d0da', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
const searchMat = new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const markMat = new THREE.MeshBasicMaterial({ color: '#ff4a3a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const nukeBody = new THREE.MeshStandardMaterial({ color: '#4b5a3a', roughness: 0.5, metalness: 0.35 });
const nukeNose = new THREE.MeshStandardMaterial({ color: '#2b3126', roughness: 0.45, metalness: 0.4 });
const nukeBand = new THREE.MeshStandardMaterial({ color: '#f2c12e', roughness: 0.4, emissive: '#5a4100', emissiveIntensity: 0.4 });
// 탄두 — 둥글게 뾰족한 회전체(LatheGeometry, Y축 → 미사일 앞 +X로 돌려 씀)
const NOSE_G = new THREE.LatheGeometry(
  Array.from({ length: 9 }, (_, i) => { const t = i / 8; return new THREE.Vector2(0.06 * Math.sqrt(1 - t * t) * (1 - t * 0.15), t * 0.17); }),
  16,
);
// 꼬리 날개 — 뒤로 비스듬한 사다리꼴 판
const FIN_G = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(0.13, 0); sh.lineTo(0.08, 0.1); sh.lineTo(0.02, 0.1); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false });
  g.translate(-0.13, 0.05, -0.004);
  return g;
})();

const turnToward = (from, to, max) => {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-max, Math.min(max, d));
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** 바퀴 하나 — 타이어 + 노란 휠(굴러감은 spin 그룹에서) */
function Wheel({ spinRef }) {
  return (
    <group ref={spinRef}>
      <mesh material={tireMat} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.14, 18]} /></mesh>
      <mesh material={rimMat} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[WHEEL_R * 0.55, WHEEL_R * 0.55, 0.15, 12]} /></mesh>
      <Box p={[0, WHEEL_R * 0.7, 0]} s={[0.05, 0.05, 0.152]} m={tireMat} cast={false} />
    </group>
  );
}

/** 미사일 — 앞(+X). 유선형 탄두 · 흰 몸통 · 띠 · 꼬리 날개 넷 · 노즐 · 불꽃(흰 심 + 주황 겉, 깜박임은 flameRef). homing이면 파란 탄두 · 하늘색 띠 */
function Missile({ flameRef, homing = false, nuke = false }) {
  const nose = nuke ? nukeNose : homing ? noseBlue : noseMat;
  const band = nuke ? nukeBand : homing ? bandCyan : bandMat;
  const body = nuke ? nukeBody : missileMat;
  return (
    <group>
      <mesh material={body} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.06, 0.06, 0.46, 16]} /></mesh>
      <mesh geometry={NOSE_G} material={nose} position={[0.23, 0, 0]} rotation={[0, 0, -Math.PI / 2]} />
      <mesh material={nose} position={[0.17, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.0612, 0.0612, 0.03, 16]} /></mesh>
      <mesh material={band} position={[-0.12, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.0612, 0.0612, 0.04, 16]} /></mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} geometry={FIN_G} material={finMat} position={[-0.18, 0, 0]} rotation={[(k * Math.PI) / 2, 0, 0]} />
      ))}
      <mesh material={nozzleMat} position={[-0.26, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.045, 0.055, 0.06, 14, 1, true]} /></mesh>
      <group ref={flameRef} position={[-0.29, 0, 0]}>
        <mesh material={homing ? flameBlue : flameMat} position={[-0.16, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.055, 0.34, 12]} /></mesh>
        <mesh material={flameCoreMat} position={[-0.08, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.03, 0.18, 10]} /></mesh>
        <sprite material={homing ? flameGlowBlue : flameGlowMat} position={[-0.12, 0, 0]} scale={[0.55, 0.55, 1]} />
      </group>
    </group>
  );
}

export default function SimLayer({ drop, paused = false, onClear, onHide, lights, hud, bus }) {
  const car = useRef();
  const tilt = useRef();
  const dust = useRef();
  const wheels = useRef([]);
  const steerL = useRef();
  const steerR = useRef();
  const keys = useRef({ up: false, down: false, left: false, right: false, fire: false });
  const missiles = useRef([]);
  const flames = useRef([]);
  const hMissiles = useRef([]);
  const hFlames = useRef([]);
  const nukeRef = useRef();
  const locks = useRef([]);
  const ghosts = useRef([]);
  const frost = useRef();
  const spikes = useRef([]);
  const ices = useRef([]);
  const rockRefs = useRef([]);
  const droneRefs = useRef([]);
  const rotorRefs = useRef([]);
  const turretRefs = useRef([]);
  const searchRefs = useRef([]);
  const markRefs = useRef([]);
  const nukeAim = useRef();
  const nukeCol = useRef();
  const nukeFlame = useRef();
  const holes = useRef(Array.from({ length: BH_POOL }, () => ({})));
  const meteors = useRef([]);
  const metRocks = useRef([]);
  const metAims = useRef([]);
  const root = useRef();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const { gl, scene, camera } = useThree();
  const s = useMemo(() => ({ x: drop.x, y: DROP_Y, z: drop.z, vy: 0, yaw: Math.PI / 2 + 0.4, v: 0, landed: false, tumble: 1.2, dustAge: 9, age: 0, landedAt: 0, cool: 0, side: 1, hp: CAR_HP, dash: 0, cCool: 0 }), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 경찰차는 뺐음 — 무기들의 맞힘 판정이 ps.on을 보므로 꺼 둔 채로 둠
  const ps = useMemo(() => ({ on: false, x: DRIVE.x1 + 8, z: 7, yaw: Math.PI, v: 0, caught: 0, stun: 0 }), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 미사일(미리 만들어 둔 자리를 돌려 씀) · 연기 · 불티 · 폭발 효과(rcFx)
  const ms = useMemo(() => Array.from({ length: MISSILES }, () => ({ on: false, x: 0, y: M_Y, z: 0, yaw: 0, age: 0, smokeT: 0, wob: 0 })), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fx = useMemo(() => {
    const smoke = new Smoke(1400); // 핵 버섯구름 · 유도 미사일 연기 꼬리까지 넉넉히
    const sparks = new Sparks(400);
    const debris = new Debris(110);
    const nuke = new NukeBlast(smoke, sparks);
    nuke.bus = bus;
    // 얼음 조각 — 파편과 같은 움직임, 푸른 반투명
    const iceShards = new Debris(60);
    iceShards.mat.color.set('#cfeeff');
    iceShards.mat.emissive.set('#3f9fe0');
    iceShards.mat.emissiveIntensity = 0.5;
    iceShards.mat.roughness = 0.1;
    return { smoke, sparks, debris, iceShards, fire: new Fire(1600), glows: new Glows(2000), booms: new Booms(10, smoke, sparks, debris, bus), nuke };
  }, []);
  useEffect(() => () => { fx.smoke.dispose(); fx.sparks.dispose(); fx.booms.dispose(); fx.nuke.dispose(); fx.glows.dispose(); fx.debris.dispose(); fx.iceShards.dispose(); fx.fire.dispose(); }, [fx]);
  useEffect(() => { fx.booms.light = lights.boom.current; fx.nuke.light = lights.nuke.current; }, [fx, lights]);
  const trail = useMemo(() => ({ at: new THREE.Vector3(), v: new THREE.Vector3() }), []);
  // 유도 미사일 · 좀비(상태 wait → rise → walk → dead → wait)
  const hs = useMemo(() => Array.from({ length: HOMINGS }, () => ({ on: false, x: 0, y: M_Y, z: 0, yaw: 0, age: 0, smokeT: 0, target: null, retarget: 0 })), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const zs = useMemo(() => Array.from({ length: ZOMBIES }, () => ({
    state: 'off', t: 0, x: 0, z: 0, yaw: 0, hp: 1, bite: 0, fall: 0, sink: 0, speed: 1.2, phase: Math.random() * 6, scale: 1, flinch: 0,
  })), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 웨이브 진행 — idle(떨어지는 중) → intro(알림) → fight → clear(알림 · 회복) → 다음 intro … → win / over
  const gm = useMemo(() => ({ phase: 'idle', wave: 0, t: 0, toSpawn: 0, spawnT: 0, kills: 0, banner: '', bannerT: 9 }), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // E 블랙홀(fly → open → hold → collapse → wave → off) · S 유성(wait → fall → off)
  const bh = useMemo(() => Array.from({ length: BH_POOL }, () => ({ phase: 'off', t: 0, x: 0, y: 0, z: 0, sx: 0, sz: 0, tx: 0, tz: 0, spin: 0, boltT: 0 })), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const mt = useMemo(() => Array.from({ length: METEORS }, () => ({ phase: 'off', t: 0, delay: 0, x: 0, y: 0, z: 0, tx: 0, tz: 0, sx: 0, sy: 0, sz: 0, dx: 0, dy: -1, dz: 0, target: null, smokeT: 0, spin: 0, size: 1 })), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 고리마다 따로 옅어지게 재질을 따로
  const holeWaveMats = useMemo(() => Array.from({ length: BH_POOL }, () => ({ a: ringMat('#c39bff'), b: ringMat('#8fe9ff'), c: ringMat('#ffffff') })), []);
  const metAimMats = useMemo(() => Array.from({ length: METEORS }, () => ringMat('#ff4a2a')), []);
  useEffect(() => () => { holeWaveMats.forEach((m) => Object.values(m).forEach((x) => x.dispose())); metAimMats.forEach((m) => m.dispose()); }, [holeWaveMats, metAimMats]);
  const tq = useMemo(() => ({ v: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), m: new THREE.Vector3(), d3: new THREE.Vector3() }), []);
  // 보스(한 번에 하나) — state: enter(들어옴) → fight → dying · act: 공룡 walk · roar · charge / 드래곤 circle · breath · dive
  const boss = useMemo(() => ({ on: false, kind: 'rex', state: 'off', t: 0, x: 0, y: 0, z: 0, yaw: Math.PI, hp: 1, max: 1, flash: 0, frozen: 0, act: 'walk', actT: 0, cool: 0, step: 0 }), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const rexParts = useMemo(() => ({}), []);
  const wyrmParts = useMemo(() => ({}), []);
  // 눈보라(한 번에 하나 — 다시 쓰면 그 자리에서 새로) · 고드름(자리 돌려씀)
  const bz = useMemo(() => ({ t: 99, x: 0, z: 0, hit: new Set(), spikeT: 0 }), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 지진 갈라짐(뻗는 중인 줄) · 바위 기둥(자리 돌려씀) · 드론 · 드론 탄
  const qk = useMemo(() => [], [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const rocks = useMemo(() => Array.from({ length: ROCKS }, () => ({ age: 99, x: 0, z: 0, h: 1, rot: 0, tx: 0, tz: 0 })), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dr = useMemo(() => ({ t: 0, pickT: 0, list: Array.from({ length: DRONES }, () => ({ x: 0, y: -9, z: 0, yaw: 0, fireT: 0, tgt: null, pitch: 0, roll: 0, side: 1, recoil: 0, tp: null })) }), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fp = useMemo(() => Array.from({ length: FIRE_PATCH }, () => ({ age: 99, x: 0, z: 0, s: 1 })), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const bul = useMemo(() => Array.from({ length: BULLETS }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0 })), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const spk = useMemo(() => Array.from({ length: SPIKES }, () => ({ age: 99, x: 0, z: 0, h: 1, a: 0, tilt: 0 })), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const zParts = useMemo(() => Array.from({ length: ZOMBIES }, () => ({})), []);
  // 좀비마다 따로 재질(맞을 때 그 좀비만 번쩍) · 바닥 체액 얼룩(자리 돌려씀)
  const zMats = useMemo(() => Array.from({ length: ZOMBIES }, () => makeFigureMats()), []);
  useEffect(() => () => zMats.forEach((m) => Object.values(m).forEach((x) => x.dispose())), [zMats]);
  const goo = useMemo(() => Array.from({ length: GOO }, () => ({ age: 99, mat: new THREE.MeshBasicMaterial({ map: GLOW_TEX, color: '#3f6b1f', transparent: true, opacity: 0, depthWrite: false }) })), []);
  useEffect(() => () => goo.forEach((g) => g.mat.dispose()), [goo]);
  const gooRefs = useRef([]);
  const gooNext = useRef(0);
  // 핵 — idle → up(솟음) → down(내리꽂힘) → blast(충격파가 퍼지는 동안 맞힘 판정) → idle
  const nk = useMemo(() => ({ phase: 'idle', t: 0, cool: 0, x: 0, y: 0, z: 0, ax: 0, az: 0, tx: 0, tz: 0, yaw: 0, pitch: 0, smokeT: 0, hitPolice: false, hitCar: false, hitBoss: false }), [drop.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 목표 · 맞힘 도우미 — 좀비(걷는 중이거나 반쯤 솟은)와 경찰차
  const zombieAt = (x, z, r) => zs.findIndex((zz) => (zz.state === 'walk' || (zz.state === 'rise' && zz.t > Z_RISE * 0.5)) && Math.hypot(zz.x - x, zz.z - z) < r * zz.scale);
  // 번개(블랙홀 둘레) — 두 점 사이 지그재그 길을 따라 빛 자국을 촘촘히(보라 겉 + 흰 심), 가끔 곁가지
  const bolt = (ax, ay, az, bx, by, bz) => {
    const n = 14;
    let px = ax;
    let py = ay;
    let pz = az;
    for (let i = 1; i <= n; i += 1) {
      const u = i / n;
      const j = i === n ? 0 : 0.45 * Math.sin(u * Math.PI);
      const x = ax + (bx - ax) * u + (Math.random() - 0.5) * j;
      const y = ay + (by - ay) * u + (Math.random() - 0.5) * j * 0.6;
      const z = az + (bz - az) * u + (Math.random() - 0.5) * j;
      for (let q = 0; q < 5; q += 1) {
        const t = q / 5;
        fx.glows.emit(trail.at.set(px + (x - px) * t, py + (y - py) * t, pz + (z - pz) * t), 0.42, 0.3, '#a46bff');
        fx.glows.emit(trail.at.set(px + (x - px) * t, py + (y - py) * t, pz + (z - pz) * t), 0.16, 0.24, '#ffffff');
        if (q === 2) fx.glows.emit(trail.at.set(px + (x - px) * t, py + (y - py) * t, pz + (z - pz) * t), 0.22, 0.6, '#6a2fff'); // 잔광
      }
      // 곁가지 — 가끔 옆으로 짧게 갈라짐
      if (i < n - 2 && Math.random() < 0.22) {
        let qx = x;
        let qy = y;
        let qz = z;
        const ang = Math.random() * Math.PI * 2;
        for (let b = 0; b < 4; b += 1) {
          qx += Math.cos(ang) * 0.22 + (Math.random() - 0.5) * 0.15;
          qy += (Math.random() - 0.4) * 0.15;
          qz += Math.sin(ang) * 0.22 + (Math.random() - 0.5) * 0.15;
          fx.glows.emit(trail.at.set(qx, qy, qz), 0.2, 0.2, '#c9a6ff');
        }
      }
      px = x; py = y; pz = z;
    }
    fx.sparks.burst(trail.at.set(bx, by, bz), 4, 2.4, '#ead9ff');
    fx.glows.emit(trail.at.set(bx, by, bz), 0.8, 0.25, '#d9c2ff');
  };
  // 자동 조준(블랙홀 · 눈보라) — 좀비가 가장 많이 몰린 곳(거리 무관). avoid면 다른 블랙홀이 이미 맡은 곳은 피함, 좀비가 없으면 null
  const crowdSpot = (self, avoid = true) => {
    let best = null;
    let bn = 0;
    zs.forEach((a) => {
      if (!alive(a)) return;
      if (avoid && bh.some((o) => o !== self && o.phase !== 'off' && o.phase !== 'wave' && Math.hypot(o.tx - a.x, o.tz - a.z) < BH_R * 0.8)) return;
      const n = zs.reduce((c, b) => c + (alive(b) && Math.hypot(b.x - a.x, b.z - a.z) < BH_R * 0.7 ? 1 : 0), 0);
      if (n > bn) { bn = n; best = a; }
    });
    const at = best ?? (bossAlive() ? boss : null); // 좀비가 없으면 보스
    return at ? { x: clamp(at.x, DRIVE.x0 + 1, DRIVE.x1 - 1), z: clamp(at.z, DRIVE.z0 + 0.5, DRIVE.z1 - 0.5) } : null;
  };
  const banner = (text) => { gm.banner = text; gm.bannerT = 0; };
  const startWave = (n) => {
    const kind = n % BOSS_EVERY === 0 ? ((n / BOSS_EVERY) % 2 ? 'wyrm' : 'rex') : null; // 보스 웨이브 — 공룡 · 드래곤 번갈아
    Object.assign(gm, { wave: n, phase: 'intro', t: 0, toSpawn: kind ? Math.ceil(waveCount(n) / 2) : waveCount(n), spawnT: 0, boss: kind });
    banner(kind ? `WAVE ${n} · BOSS` : `WAVE ${n}`);
  };
  // 보스 — 살아 있나 · 몸 가운데 높이 · 맞힘 판정(가로 거리 — 드래곤도 낮게 나는 무기에 맞게) · 피해
  const bossAlive = () => boss.on && boss.state !== 'dying';
  const bossY = () => (boss.kind === 'rex' ? 2.4 : boss.y);
  const bossAt = (x, y, z, pad = 0) => bossAlive() && Math.hypot(x - boss.x, z - boss.z) < 2.3 + pad && (boss.kind === 'wyrm' || y < 4.8);
  const hurtBoss = (dmg, quiet = false) => {
    if (!bossAlive()) return;
    boss.hp -= boss.frozen > 0 ? dmg * 1.5 : dmg;
    if (!quiet) {
      boss.flash = 1;
      fx.sparks.burst(trail.at.set(boss.x, bossY(), boss.z), 8, 3.5, '#ffd0a0');
    }
    if (boss.hp <= 0) {
      Object.assign(boss, { hp: 0, state: 'dying', t: 0, vy: 0, crashed: false, finalBoom: false });
      gm.kills += 1;
      if (bus) bus.shake = Math.max(bus.shake, 0.9);
    }
  };
  const spawnBoss = (kind) => {
    const max = bossHp(gm.wave, kind);
    Object.assign(boss, {
      on: true, kind, state: 'enter', t: 0, x: DRIVE.x1 + 7, y: kind === 'wyrm' ? 8 : 0, z: (DRIVE.z0 + DRIVE.z1) / 2, yaw: Math.PI, hp: max, max,
      flash: 0, frozen: 0, act: 'walk', actT: 0, cool: 3, step: 0, lastStep: 0, bite: 0, jawT: 0, dashCool: 0, roared: false,
    });
  };
  const targetAlive = (t) => !!t && (t.kind === 'boss' ? bossAlive() : t.kind === 'police' ? ps.on : zs[t.i].state === 'walk' || zs[t.i].state === 'rise');
  const targetPos = (t) => {
    if (!targetAlive(t)) return null;
    if (t.kind === 'boss') return { x: boss.x, z: boss.z, y: bossY() };
    if (t.kind === 'police') return { x: ps.x, z: ps.z, y: 0.5 };
    return { x: zs[t.i].x, z: zs[t.i].z, y: 0.9 };
  };
  const nearestTarget = (x, z) => {
    let best = null;
    let bd = Infinity;
    if (ps.on) { bd = Math.hypot(ps.x - x, ps.z - z); best = { kind: 'police' }; }
    if (bossAlive() && Math.hypot(boss.x - x, boss.z - z) < bd) { bd = Math.hypot(boss.x - x, boss.z - z); best = { kind: 'boss' }; }
    zs.forEach((zz, i) => {
      if (zz.state !== 'walk' && zz.state !== 'rise') return;
      const dd = Math.hypot(zz.x - x, zz.z - z);
      if (dd < bd) { bd = dd; best = { kind: 'zombie', i }; }
    });
    return best;
  };
  const targetsByDistance = (x, z) => {
    const list = [];
    if (ps.on) list.push({ t: { kind: 'police' }, dd: Math.hypot(ps.x - x, ps.z - z) });
    if (bossAlive()) list.push({ t: { kind: 'boss' }, dd: Math.hypot(boss.x - x, boss.z - z) });
    zs.forEach((zz, i) => { if (zz.state === 'walk' || zz.state === 'rise') list.push({ t: { kind: 'zombie', i }, dd: Math.hypot(zz.x - x, zz.z - z) }); });
    return list.sort((a, b) => a.dd - b.dd).map((q) => q.t);
  };
  const hitPolice = (size = 1.6) => {
    fx.booms.trigger(ps.x, 0.5, ps.z, size);
    ps.stun = STUN;
    ps.caught = 0;
    ps.v = -3;
  };
  // 바닥 체액 얼룩 하나(가장 오래된 자리)
  const splat = (x, z, size) => {
    const k = gooNext.current;
    gooNext.current = (k + 1) % GOO;
    goo[k].age = 0;
    const m = gooRefs.current[k];
    if (m) {
      m.position.set(x + (Math.random() - 0.5) * 0.4, 0.03 + k * 0.0004, z + (Math.random() - 0.5) * 0.4);
      m.rotation.z = Math.random() * Math.PI * 2;
      m.scale.set(size * (0.8 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.5), 1);
    }
  };
  // 맞은 방향 — src(맞힌 것 자리)에서 좀비 쪽으로
  const pushDir = (zz, src) => {
    const dx = zz.x - (src?.x ?? s.x);
    const dz = zz.z - (src?.z ?? s.z);
    const dd = Math.hypot(dx, dz) || 1;
    return [dx / dd, dz / dd];
  };
  // 쓰러뜨림 — 빨간 번쩍 · 힘만큼 날아감(센 것은 공중으로 돌며) · 체액 · 얼룩 · 히트스톱
  const killZombie = (i, src, power = 4) => {
    const zz = zs[i];
    if (zz.state !== 'walk' && zz.state !== 'rise') return;
    if ((zz.frozen ?? 0) > 0) {
      // 얼음째 산산조각
      zz.frozen = 0;
      iceBurst(zz.x, zz.z, zz.scale, 14);
      fx.iceShards.burst(trail.at.set(zz.x, 1 * zz.scale, zz.z), 14, 5);
    }
    const [ux, uz] = pushDir(zz, src);
    Object.assign(zz, {
      state: 'dead', t: 0, fall: 0, sink: 0, flash: 1, red: true,
      kx: ux * power * 1.1, kz: uz * power * 1.1, ky: power > 8 ? power * 0.55 : power * 0.25, spin: (Math.random() < 0.5 ? -1 : 1) * power * 0.9,
      hy: (zz.hy ?? 0) + (zz.lev ?? 0), lev: 0, // 블랙홀에 떠 있던 높이에서 떨어짐
    });
    gm.kills += 1;
    fx.sparks.burst(trail.at.set(zz.x, 1.0 * zz.scale, zz.z), 22, 4 + power * 0.25, '#9be15d');
    splat(zz.x, zz.z, 1.1 * zz.scale);
    if ((s.hitstop ?? -1) < -0.25) s.hitstop = HITSTOP;
  };
  // 피해 — 체력이 남으면 하얗게 번쩍 · 힘만큼 밀려 미끄러짐 · 머리 젖힘 · 팔 휘청 · 체액, 다 닳으면 쓰러짐
  const hurtZombie = (i, dmg, src, power = 4) => {
    const zz = zs[i];
    if (zz.state !== 'walk' && zz.state !== 'rise') return false;
    const iced = (zz.frozen ?? 0) > 0;
    zz.hp -= iced ? dmg * 1.5 : dmg; // 얼어 있으면 더 아픔
    if (iced) fx.glows.emit(trail.at.set(zz.x, 1.1 * zz.scale, zz.z), 0.7, 0.2, '#e6f7ff');
    if (zz.hp <= 0) { killZombie(i, src, power); return true; }
    const [ux, uz] = pushDir(zz, src);
    const resist = zz.scale > 1.2 ? 0.45 : 1; // 큰 좀비는 덜 밀림
    zz.kx = (zz.kx ?? 0) + ux * power * 0.75 * resist;
    zz.kz = (zz.kz ?? 0) + uz * power * 0.75 * resist;
    zz.ky = Math.max(zz.ky ?? 0, power * 0.12 * resist);
    zz.flinch = 0.35;
    zz.jolt = 1;
    zz.flash = 1;
    zz.red = false;
    fx.sparks.burst(trail.at.set(zz.x, 1.1 * zz.scale, zz.z), 10, 3.2, '#b6ff7a');
    if (Math.random() < 0.35) splat(zz.x, zz.z, 0.6 * zz.scale);
    return false;
  };
  const alive = (zz) => zz.state === 'walk' || zz.state === 'rise';
  // 얼음 깨짐 — 하얀 빛 가루 · 눈 연기(얼음 조각은 따로)
  const iceBurst = (x, z, sc, n) => {
    for (let q = 0; q < n; q += 1) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * 0.6 * sc;
      fx.glows.emit(trail.at.set(x + Math.cos(a) * rr, 0.2 + Math.random() * 1.8 * sc, z + Math.sin(a) * rr), 0.25 + Math.random() * 0.3, 0.35, '#dff4ff');
      fx.smoke.emit(trail.at.set(x + Math.cos(a) * rr, 0.3 + Math.random() * 1.6 * sc, z + Math.sin(a) * rr), trail.v.set(Math.cos(a) * 3, 1 + Math.random() * 2, Math.sin(a) * 3), 0.1, 0.7, ['#ffffff', '#d6efff', '#f4faff']);
    }
  };
  // 불 — 화염 피해(조용히 깎임) · 불붙음(BURN초 동안 더 깎이며 몸에서 불길)
  const burn = (i, dmg) => {
    const zz = zs[i];
    if (!alive(zz)) return;
    zz.burn = BURN;
    zz.hp -= dmg;
    zz.flash = Math.max(zz.flash ?? 0, 0.25);
    if (zz.hp <= 0) killZombie(i, s, 5);
  };
  // 바위 기둥 솟음 — 먼지 · 파편 · 용암 빛 금, 걸린 좀비는 크게 다치며 공중으로, 보스도 깎임
  const erupt = (x, z) => {
    const rk = rocks.reduce((a, q) => (q.age > a.age ? q : a), rocks[0]);
    Object.assign(rk, { age: 0, x, z, h: 1 + Math.random() * 1.2, rot: Math.random() * 6, tx: (Math.random() - 0.5) * 0.5, tz: (Math.random() - 0.5) * 0.5 });
    for (let q = 0; q < 5; q += 1) {
      const a = Math.random() * Math.PI * 2;
      fx.smoke.emit(trail.at.set(x, 0.2, z), trail.v.set(Math.cos(a) * 2.5, 1.5 + Math.random() * 1.5, Math.sin(a) * 2.5), 0.22, 1 + Math.random() * 0.5, ['#b9a68a', '#8a7a68', '#d6d0c6']);
    }
    fx.debris.burst(trail.at.set(x, 0.3, z), 3, 4);
    fx.glows.emit(trail.at.set(x, 0.06, z), 1.2, 1.4, '#ff4a12');
    fx.glows.emit(trail.at.set(x, 0.5, z), 0.9, 0.15, '#ffb070');
    zs.forEach((zz, j) => {
      if (!alive(zz) || Math.hypot(zz.x - x, zz.z - z) > 1.5 * zz.scale) return;
      if (!hurtZombie(j, 8, { x, z }, 13)) zz.ky = Math.max(zz.ky ?? 0, 6); // 안 쓰러져도 공중으로 튕김
    });
    if (bossAt(x, 0, z, 0.3)) hurtBoss(5);
    if (bus) bus.shake = Math.max(bus.shake, 0.22);
  };
  // 얼림 — FREEZE초 동안 얼음에 갇힘(밀리던 힘도 멈춤)
  const freeze = (i) => {
    const zz = zs[i];
    zz.frozen = FREEZE;
    zz.fz0 = s.age;
    zz.kx = 0;
    zz.kz = 0;
    fx.glows.emit(trail.at.set(zz.x, 1 * zz.scale, zz.z), 1.6, 0.3, '#cdeeff');
    iceBurst(zz.x, zz.z, zz.scale, 4);
  };
  // 블랙홀이 삼킴 — 그 자리에서 빙글 돌며 작아져 핵으로 빨려 듦(좀비 그리기에서 suck으로)
  const swallow = (j, h) => {
    const zz = zs[j];
    const y0 = zz.lev ?? 0;
    Object.assign(zz, { state: 'dead', t: 0, fall: 0, sink: 0, flash: 1, red: false, kx: 0, kz: 0, ky: 0, hy: 0, spin: 0, lev: 0, frozen: 0, suck: { x: h.x, y: h.y, z: h.z, t: 0, y0 } });
    gm.kills += 1;
    fx.glows.emit(trail.at.set(zz.x, 1 + y0, zz.z), 1.2, 0.2, '#d9c2ff');
    fx.sparks.burst(trail.at.set(zz.x, 1 + y0, zz.z), 10, 3, '#cbb2ff');
  };
  // 블랙홀 끝 — 보라 섬광 · 폭발 · 바깥으로 뻗는 번개, 둘레를 날려 버림(폭발 고리는 그리기에서)
  const holeBlast = (h) => {
    fx.booms.trigger(h.x, h.y, h.z, 2.0);
    fx.booms.trigger(h.x, 0.3, h.z, 1.2);
    if (bus) { bus.flash = Math.max(bus.flash, 0.75); bus.flashColor = '205, 170, 255'; bus.shake = Math.max(bus.shake, 1.2); }
    fx.sparks.burst(trail.at.set(h.x, h.y, h.z), 70, 12, '#ead9ff');
    fx.glows.emit(trail.at.set(h.x, h.y, h.z), 7, 0.4, '#c9a6ff');
    fx.glows.emit(trail.at.set(h.x, h.y, h.z), 3.2, 0.22, '#ffffff');
    for (let q = 0; q < 5; q += 1) {
      const a = (q / 5) * Math.PI * 2 + Math.random() * 0.6;
      bolt(h.x, h.y, h.z, h.x + Math.cos(a) * 4.5, 0.2, h.z + Math.sin(a) * 4.5);
    }
    zs.forEach((zz, j) => { if (alive(zz) && Math.hypot(zz.x - h.x, zz.z - h.z) < BH_BLAST_R) hurtZombie(j, 5, h, 14); });
    if (ps.on && Math.hypot(ps.x - h.x, ps.z - h.z) < BH_BLAST_R) hitPolice(1.4);
    if (bossAt(h.x, 0, h.z, BH_BLAST_R - 1)) hurtBoss(25);
    if (Math.hypot(s.x - h.x, s.z - h.z) < BH_BLAST_R + 3) s.shake = 0.9;
  };
  // 유성이 떨어짐 — 폭발 · 불꽃 고리 · 녹은 바닥 빛, 둘레 MET_R 안 피해
  const meteorHit = (q) => {
    const x = q.tx;
    const z = q.tz;
    fx.booms.trigger(x, 0.4, z, 1.5 * q.size);
    fx.sparks.burst(trail.at.set(x, 0.3, z), 26, 7, '#ffcf7a');
    fx.glows.emit(trail.at.set(x, 0.6, z), 3 * q.size, 0.22, '#ffd9a0');
    for (let c = 0; c < 20; c += 1) {
      const a = (c / 20) * Math.PI * 2;
      fx.glows.emit(trail.at.set(x + Math.cos(a) * 1.5, 0.15, z + Math.sin(a) * 1.5), 0.55, 0.35, '#ff6a1a');
    }
    for (let c = 0; c < 5; c += 1) fx.glows.emit(trail.at.set(x + (Math.random() - 0.5) * 1.2 * q.size, 0.06, z + (Math.random() - 0.5) * 1.2 * q.size), (0.9 + Math.random() * 0.4) * q.size, 1.4, '#ff3a0a');
    // 먼지 충격파 — 바닥을 따라 바깥으로 퍼짐
    for (let c = 0; c < 14; c += 1) {
      const a = (c / 14) * Math.PI * 2 + Math.random() * 0.3;
      fx.smoke.emit(trail.at.set(x + Math.cos(a) * 0.6, 0.15, z + Math.sin(a) * 0.6), trail.v.set(Math.cos(a) * 7 * q.size, 0.3, Math.sin(a) * 7 * q.size), 0.22 * q.size, 0.9 + Math.random() * 0.4, ['#d9b38a', '#8a7a6a', '#d6d2cc']);
    }
    const big = q.size > 1.6;
    const r = MET_R * (big ? 2 : 1);
    if (big) {
      // 마지막 큰 유성 — 불기둥 · 큰 섬광 · 크게 흔들림
      fx.booms.trigger(x, 1.4, z, 1.6);
      for (let c = 0; c < 12; c += 1) fx.glows.emit(trail.at.set(x + (Math.random() - 0.5) * 0.6, 0.3 + c * 0.45, z + (Math.random() - 0.5) * 0.6), 1.6 - c * 0.08, 0.5, '#ff8a2a');
      if (bus) { bus.flash = Math.max(bus.flash, 0.7); bus.flashColor = '255, 170, 90'; bus.shake = Math.max(bus.shake, 1.3); }
      if (Math.hypot(s.x - x, s.z - z) < r + 4) s.shake = 0.9;
    }
    zs.forEach((zz, j) => { if (alive(zz) && Math.hypot(zz.x - x, zz.z - z) < r * zz.scale) hurtZombie(j, big ? 8 : 3, { x, z }, big ? 15 : 11); });
    if (ps.on && Math.hypot(ps.x - x, ps.z - z) < r + 0.4) hitPolice(big ? 1.6 : 1.0);
    if (bossAt(x, 0, z, r - 1)) hurtBoss(big ? 40 : 12);
  };
  const spawnZombie = (zz, n) => {
    let x = 0;
    let z = 0;
    for (let k = 0; k < 12; k += 1) {
      // 통로 오른쪽 끝 14 안에서만 — 차에 너무 붙지는 않게
      x = DRIVE.x1 - 1 - Math.random() * 13;
      z = DRIVE.z0 + 0.6 + Math.random() * (DRIVE.z1 - DRIVE.z0 - 1.2);
      if (Math.hypot(x - s.x, z - s.z) > 5) break;
    }
    const r = Math.random();
    const kind = n >= 10 && r < 0.12 ? 'brute' : n >= 5 && r < 0.32 ? 'runner' : 'normal';
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const look = kind === 'brute' ? pick(['bigguy', 'chef']) : kind === 'runner' ? pick(['athlete', 'punk']) : pick(['worker', 'worker', 'office', 'doctor', 'chef', 'punk']);
    const zi = zs.indexOf(zz);
    applyLook(zParts[zi], zMats[zi], look);
    const speed = zSpeed(n) * (kind === 'runner' ? 1.5 : kind === 'brute' ? 0.7 : 1) * (0.85 + Math.random() * 0.3);
    const hp = zHp(n) * (kind === 'brute' ? 4 : 1);
    Object.assign(zz, { state: 'rise', t: 0, x, z, yaw: Math.atan2(-(s.z - z), s.x - x), hp, bite: 0, fall: 0, sink: 0, speed, scale: kind === 'brute' ? 1.35 : kind === 'runner' ? 0.92 : 1, flinch: 0, kx: 0, kz: 0, ky: 0, hy: 0, spin: 0, flash: 0, jolt: 0, lev: 0, suck: null, frozen: 0, burn: 0 });
    for (let k = 0; k < 7; k += 1) {
      fx.smoke.emit(trail.at.set(x + (Math.random() - 0.5) * 0.8, 0.1, z + (Math.random() - 0.5) * 0.8), trail.v.set((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8), 0.12, 1 + Math.random() * 0.6, ['#8a7a60', '#7a7268', '#cfcac2']);
    }
  };

  // 셰이더 미리 만들기 — 숨은 것(좀비 · 미사일 · 폭발 · 레이저)을 잠깐 보이게 해 한꺼번에 컴파일(병렬, 안 막힘)한 뒤 되돌린다.
  // 안 하면 처음 보이는 순간 셰이더를 만들며 몇 초씩 멈춘다
  useEffect(() => {
    const hidden = [];
    root.current?.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { gl.compileAsync ? gl.compileAsync(scene, camera).catch(() => {}) : gl.compile(scene, camera); } catch { /* 미리 못 만들면 처음 볼 때 만들어짐 */ }
    hidden.forEach((o) => { o.visible = false; });
  }, [gl, scene, camera]);

  // 방향키 · 스페이스 · Ctrl · Shift — 차가 있는 동안만(스크롤 막기). Esc로 치우기
  useEffect(() => {
    const down = (e) => {
      if (pausedRef.current || isTyping(e.target)) return;
      if (e.key === 'Escape') { onHide?.(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+R 새로고침 같은 조합키는 브라우저에 맡김
      // 기술 — 한글 입력 상태여도 되게 자판 자리(code)로
      if (e.code === 'KeyQ') { keys.current.fire = true; return; }
      if (e.code === 'KeyZ') { keys.current.flame = true; e.preventDefault(); return; }
      const act = SKILL_KEYS[e.code];
      if (act) { if (!e.repeat) keys.current[act] = true; e.preventDefault(); return; }
      const k = KEYS[e.key];
      if (!k) return;
      e.preventDefault(); // 방향키 스크롤 막기
      keys.current[k] = true;
    };
    const up = (e) => {
      if (e.code === 'KeyQ') { keys.current.fire = false; return; }
      if (e.code === 'KeyZ') { keys.current.flame = false; return; }
      const k = KEYS[e.key];
      if (k) keys.current[k] = false;
    };
    const blur = () => { keys.current = { up: false, down: false, left: false, right: false, fire: false, flame: false }; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [onHide]);
  // 숨길 때 — 누르던 키 놓고, 빛 · 흔들림 · 번쩍임 · 어둠을 끔
  useEffect(() => {
    if (!paused) return;
    keys.current = { up: false, down: false, left: false, right: false, fire: false, flame: false };
    [lights.boom.current, lights.nuke.current, lights.flame?.current].forEach((l) => { if (l) l.intensity = 0; });
    if (bus) Object.assign(bus, { shake: 0, flash: 0, dim: 0 });
  }, [paused, lights, bus]);

  useFrame((state, dt) => {
    if (pausedRef.current) return; // 숨김 — 그 자리에서 멈춤
    const d0 = Math.min(dt, 0.05);
    s.hitstop = (s.hitstop ?? -1) - d0;
    const d = s.hitstop > 0 ? d0 * 0.12 : d0; // 쓰러뜨리는 순간 아주 짧게 느려짐
    const k = keys.current;
    s.age += d;
    let steer = 0;
    if (!s.landed) {
      // 떨어지기 — 바닥에 닿으면 튕기고(약해지며) 멈추면 내려앉음 + 먼지 고리
      s.vy -= G * d;
      s.y += s.vy * d;
      s.tumble *= 1 - d * 1.5;
      if (s.y <= 0) {
        s.y = 0;
        if (s.vy < -3) { s.vy = -s.vy * 0.32; s.tumble *= 0.4; if (s.dustAge > 1) s.dustAge = 0; } else { s.vy = 0; s.landed = true; s.tumble = 0; s.landedAt = s.age; }
      }
    } else if (gm.phase !== 'over') {
      const throttle = (k.up ? 1 : 0) - (k.down ? 1 : 0);
      steer = (k.left ? 1 : 0) - (k.right ? 1 : 0);
      s.v += throttle * ACC * d;
      s.v -= s.v * FRICTION * d;
      if (!throttle && Math.abs(s.v) < 0.05) s.v = 0;
      s.v = clamp(s.v, -VMAX * 0.45, VMAX);
      // C 대시 — 그동안 최고 속도를 넘어 돌진(안 다침)
      s.cCool = Math.max(0, s.cCool - d);
      if (k.dash) {
        k.dash = false;
        if (s.cCool <= 0) {
          s.dash = DASH_S;
          s.cCool = DASH_COOL;
          s.ghostT = 0;
          fx.booms.trigger(s.x - Math.cos(s.yaw) * 0.8, 0.35, s.z + Math.sin(s.yaw) * 0.8, 0.55);
          // 출발 충격파 — 차 둘레 고리 + 뒤로 부채꼴 빛, 화면 살짝 흔들림
          for (let q = 0; q < 28; q += 1) {
            const a = (q / 28) * Math.PI * 2;
            fx.glows.emit(trail.at.set(s.x + Math.cos(a) * 1.4, 0.25, s.z - Math.sin(a) * 1.4), 0.55, 0.28, '#ffd1a0');
          }
          for (let q = 0; q < 16; q += 1) {
            const a = s.yaw + Math.PI + (q / 15 - 0.5) * 1.6;
            fx.glows.emit(trail.at.set(s.x + Math.cos(a) * 1.1, 0.3, s.z - Math.sin(a) * 1.1), 0.7, 0.3, '#ff6a3c');
          }
          if (bus) bus.shake = Math.max(bus.shake, 0.3);
        }
      }
      if (s.dash > 0) {
        s.dash -= d;
        s.v = DASH_V;
        // 불꽃 꼬리 · 잔상 빛
        const bx = s.x - Math.cos(s.yaw) * 0.7;
        const bz = s.z + Math.sin(s.yaw) * 0.7;
        fx.glows.emit(trail.at.set(bx, 0.35, bz), 0.9, 0.35, '#ff7a1a');
        fx.glows.emit(trail.at.set(bx, 0.35, bz), 0.45, 0.2, '#fff1b0');
        fx.glows.emit(trail.at.set(s.x, 0.45, s.z), 1.4, 0.18, '#ff3b5c');
        // 잔상 — 0.05초마다 지금 자세를 하나씩 남김
        s.ghostT = (s.ghostT ?? 0) - d;
        if (s.ghostT <= 0) {
          s.ghostT = 0.05;
          s.ghostI = ((s.ghostI ?? 0) + 1) % GHOSTS;
          s.ghostList = s.ghostList ?? Array.from({ length: GHOSTS }, () => ({ age: 9, x: 0, z: 0, yaw: 0 }));
          Object.assign(s.ghostList[s.ghostI], { age: 0, x: s.x, z: s.z, yaw: s.yaw });
        }
        if (Math.random() < 0.5) fx.sparks.burst(trail.at.set(bx, 0.2, bz), 2, 2.2);
        // 속도선 — 차 양옆으로 길게(뒤로 갈수록 옅게)
        const cy = Math.cos(s.yaw);
        const sy = Math.sin(s.yaw);
        [0.5, -0.5].forEach((side) => {
          for (let q = 0; q < 3; q += 1) {
            const back = 0.3 + q * 0.35;
            fx.glows.emit(trail.at.set(s.x - cy * back + sy * side, 0.3 + q * 0.04, s.z + sy * back + cy * side), 0.2 - q * 0.04, 0.14, '#ffe2c4');
          }
        });
        if (s.dash <= 0) s.v = VMAX;
      }
      s.yaw += steer * TURN * d * clamp(s.v / (VMAX * 0.5), -1, 1);
      // 통로 끝에 닿으면 그 방향만 막고 벽을 따라 미끄러진다(속도는 조금만 줄어듦)
      const nx = s.x + Math.cos(s.yaw) * s.v * d;
      const nz = s.z - Math.sin(s.yaw) * s.v * d;
      s.x = clamp(nx, DRIVE.x0, DRIVE.x1);
      s.z = clamp(nz, DRIVE.z0, DRIVE.z1);
      if (s.x !== nx || s.z !== nz) s.v *= 1 - d * 2;
      // 미사일 발사 — 지붕 발사관(좌우 번갈아) 입구에서 차가 보는 방향으로. 발사 섬광 · 연기 · 반동
      s.cool -= d;
      if (k.fire && s.cool <= 0) {
        const m = ms.find((q) => !q.on);
        if (m) {
          s.side = -s.side;
          const c = Math.cos(s.yaw);
          const sn = Math.sin(s.yaw);
          const ox = 0.62; // 발사관 입구(차 중심에서 앞)
          const oz = 0.13 * s.side; // 좌우 관
          const mx = s.x + c * ox + sn * oz;
          const mz = s.z - sn * ox + c * oz;
          Object.assign(m, { on: true, age: 0, yaw: s.yaw, x: mx, y: M_Y, z: mz, smokeT: 0, wob: Math.random() * 6 });
          fx.booms.trigger(mx + c * 0.1, M_Y, mz - sn * 0.1, 0.32);
          // 발사구 별 섬광
          fx.glows.emit(trail.at.set(mx + c * 0.15, M_Y, mz - sn * 0.15), 1.1, 0.09, '#fff4d0');
          for (let q = 0; q < 4; q += 1) { const a = (q / 4) * Math.PI * 2 + Math.random(); fx.glows.emit(trail.at.set(mx + c * 0.15 + Math.cos(a) * 0.25, M_Y + Math.sin(a) * 0.25, mz - sn * 0.15), 0.35, 0.08, '#ffb24a'); }
          s.cool = M_COOL;
        }
      }
      // 유도 미사일 일제 사격(Ctrl) — SALVO발을 SALVO_GAP초 간격으로 부채꼴(좌우로 벌어지게) 발사, 목표는 가까운 순으로 나눠 맡음
      s.hCool = (s.hCool ?? 0) - d;
      if (k.homing) {
        k.homing = false;
        if (s.hCool <= 0) { s.salvo = Math.min(SALVO * 5, (s.salvo || 0) + SALVO); s.salvoT = Math.min(s.salvoT || 0, 0); s.salvoTargets = targetsByDistance(s.x, s.z); }
      }
      if (s.salvo > 0) {
        s.salvoT -= d;
        if (s.salvoT <= 0) {
          const h = hs.find((q) => !q.on);
          if (h) {
            const n = (SALVO - (s.salvo % SALVO)) % SALVO; // 6발 묶음 안에서 몇 번째
            s.side = -s.side;
            const c = Math.cos(s.yaw);
            const sn = Math.sin(s.yaw);
            const hx = s.x + c * 0.62 + sn * 0.13 * s.side;
            const hz = s.z - sn * 0.62 + c * 0.13 * s.side;
            const fan = (n - (SALVO - 1) / 2) * 0.55 + (Math.random() - 0.5) * 0.5; // 사방으로 넓게
            const tg = s.salvoTargets.length ? s.salvoTargets[n % s.salvoTargets.length] : null;
            const up = 0.75 + Math.random() * 0.5;
            const out = 0.55 + Math.random() * 0.4;
            const v0 = 7 + Math.random() * 2;
            Object.assign(h, {
              on: true, age: 0, yaw: s.yaw + fan, x: hx, y: M_Y + 0.05, z: hz, smokeT: 0, target: tg, retarget: 0, weave: Math.random() * 6, lit: false, roll: Math.random() * 6,
              vx: Math.cos(s.yaw + fan) * out * v0, vy: up * v0, vz: -Math.sin(s.yaw + fan) * out * v0, lockT: 0,
            });
            // 관에서 툭 — 작은 연기만(점화는 잠시 뒤)
            fx.smoke.emit(trail.at.set(hx + c * 0.2, M_Y, hz - sn * 0.2), trail.v.set(c * 1.5, 0.3, -sn * 1.5), 0.1, 0.6, ['#e8ecef', '#b8bdc3', '#eef0f2']);
          }
          s.salvo -= 1;
          s.salvoT = SALVO_GAP;
          if (s.salvo === 0) s.hCool = H_COOL;
        }
      }
      // E 블랙홀 — 지붕에서 보라 구체를 던짐. 자동 조준(좀비가 가장 많이 몰린 곳, 없으면 차 앞) — 멀수록 오래 날아감
      if (k.hole) {
        k.hole = false;
        const slot = bh.find((q) => q.phase === 'off');
        if (slot) {
          const c = crowdSpot(slot) ?? { x: clamp(s.x + Math.cos(s.yaw) * 9, DRIVE.x0 + 1, DRIVE.x1 - 1), z: clamp(s.z - Math.sin(s.yaw) * 9, DRIVE.z0 + 0.5, DRIVE.z1 - 0.5) };
          const dist = Math.hypot(c.x - s.x, c.z - s.z);
          Object.assign(slot, { phase: 'fly', t: 0, fly: clamp(dist / 22, 0.45, 1.2), arc: 1.5 + dist * 0.08, sx: s.x, sz: s.z, x: s.x, y: M_Y + 0.2, z: s.z, tx: c.x, tz: c.z, spin: 0, boltT: 0 });
          fx.glows.emit(trail.at.set(s.x, M_Y + 0.3, s.z), 1.6, 0.2, '#c69bff');
          fx.sparks.burst(trail.at.set(s.x, M_Y + 0.3, s.z), 14, 3.5, '#d9b8ff');
        }
      }
      // S 유성우 — 하늘이 붉게 번쩍, 가까운 목표마다 하나씩(남으면 차 앞 둘레 아무 데나) 차례로
      if (k.meteor) {
        k.meteor = false;
        const tgs = targetsByDistance(s.x, s.z);
        let made = 0;
        mt.forEach((q) => {
          if (q.phase !== 'off' || made >= MET_N) return;
          const a = Math.random() * Math.PI * 2;
          const rr = 1.5 + Math.random() * 7;
          Object.assign(q, {
            phase: 'wait', t: 0, delay: made * 0.13 + Math.random() * 0.08, target: tgs[made] ?? null, smokeT: 0, spin: Math.random() * 6, size: 0.85 + Math.random() * 0.45,
            tx: clamp(s.x + Math.cos(s.yaw) * 8 + Math.cos(a) * rr, DRIVE.x0, DRIVE.x1), tz: clamp(s.z - Math.sin(s.yaw) * 8 + Math.sin(a) * rr, DRIVE.z0, DRIVE.z1),
          });
          made += 1;
        });
        // 마지막 하나는 큰 유성 — 좀비들 한가운데(없으면 차 앞)로 조금 늦게
        const fin = mt.find((q) => q.phase === 'off');
        if (made && fin) {
          const al = zs.filter(alive);
          const cx = al.length ? al.reduce((a, zz) => a + zz.x, 0) / al.length : s.x + Math.cos(s.yaw) * 10;
          const cz = al.length ? al.reduce((a, zz) => a + zz.z, 0) / al.length : s.z - Math.sin(s.yaw) * 10;
          Object.assign(fin, { phase: 'wait', t: 0, delay: made * 0.13 + 0.35, target: null, smokeT: 0, spin: 0, size: 2.2, tx: clamp(cx, DRIVE.x0, DRIVE.x1), tz: clamp(cz, DRIVE.z0, DRIVE.z1) });
        }
        if (made) {
          if (bus) { bus.flash = Math.max(bus.flash, 0.28); bus.flashColor = '255, 120, 60'; }
          for (let c = 0; c < 24; c += 1) {
            const a = (c / 24) * Math.PI * 2;
            fx.glows.emit(trail.at.set(s.x + Math.cos(a) * 1.3, 0.2, s.z + Math.sin(a) * 1.3), 0.5, 0.4, '#ff5a2a');
          }
          fx.glows.emit(trail.at.set(s.x, 1.2, s.z), 1.6, 0.3, '#ffb070');
        }
      }
      // X 지진 — 차가 땅을 내리찍고, 몰린 곳(없으면 앞) 쪽으로 세 갈래 갈라짐이 뻗음
      if (k.quake) {
        k.quake = false;
        const c = crowdSpot(null, false);
        const yaw = c ? Math.atan2(-(c.z - s.z), c.x - s.x) : s.yaw;
        [-0.32, 0, 0.32].forEach((o) => qk.push({ x: s.x, z: s.z, yaw: yaw + o, t: 0, next: 0 }));
        fx.booms.trigger(s.x, 0.3, s.z, 0.7);
        if (bus) bus.shake = Math.max(bus.shake, 0.8);
        for (let q = 0; q < 20; q += 1) {
          const a = (q / 20) * Math.PI * 2;
          fx.smoke.emit(trail.at.set(s.x + Math.cos(a) * 0.9, 0.15, s.z + Math.sin(a) * 0.9), trail.v.set(Math.cos(a) * 6, 0.6, Math.sin(a) * 6), 0.2, 0.9, ['#c9b79c', '#9a8f80', '#dcd8d2']);
        }
      }
      // C 드론 — 차 지붕에서 DRONES대가 솟아오름(이미 있으면 시간만 처음부터)
      if (k.drone) {
        k.drone = false;
        if (dr.t <= 0) {
          dr.list.forEach((q, n) => Object.assign(q, { x: s.x + Math.cos((n * Math.PI) / 2) * 0.3, y: 0.7, z: s.z + Math.sin((n * Math.PI) / 2) * 0.3, fireT: 0.3 + n * 0.05, tgt: null, pitch: 0, roll: 0 }));
          dr.pickT = 0;
        }
        dr.t = DRONE_T;
        fx.glows.emit(trail.at.set(s.x, 1, s.z), 2.2, 0.25, '#9ff0ff');
        fx.sparks.burst(trail.at.set(s.x, 0.8, s.z), 14, 3.5, '#bff6ff');
        for (let q = 0; q < 12; q += 1) {
          const a = (q / 12) * Math.PI * 2;
          fx.smoke.emit(trail.at.set(s.x, 0.3, s.z), trail.v.set(Math.cos(a) * 4, 0.4, Math.sin(a) * 4), 0.14, 0.7, ['#e6ecf2', '#c9d0d8', '#f2f4f6']);
        }
      }
      // D 눈보라 — 좀비가 가장 많이 몰린 곳(없으면 차 앞)에서 냉기 고리가 퍼짐, 화면이 하얗게 번쩍 · 가장자리에 성에
      if (k.blizzard) {
        k.blizzard = false;
        const c = crowdSpot(null, false) ?? { x: clamp(s.x + Math.cos(s.yaw) * 10, DRIVE.x0 + 1, DRIVE.x1 - 1), z: clamp(s.z - Math.sin(s.yaw) * 10, DRIVE.z0 + 0.5, DRIVE.z1 - 0.5) };
        Object.assign(bz, { t: 0, x: c.x, z: c.z, hit: new Set(), spikeT: 0, hitBoss: false });
        if (bus) { bus.flash = Math.max(bus.flash, 0.35); bus.flashColor = '205, 238, 255'; bus.frost = 1; }
        fx.glows.emit(trail.at.set(s.x, 0.8, s.z), 1.4, 0.25, '#dff4ff'); // 차에서 냉기 번쩍
        fx.glows.emit(trail.at.set(c.x, 1.2, c.z), 4.5, 0.35, '#dff4ff');
        for (let q = 0; q < 12; q += 1) fx.glows.emit(trail.at.set(c.x + (Math.random() - 0.5) * 0.6, 0.4 + q * 0.6, c.z + (Math.random() - 0.5) * 0.6), 1.2 - q * 0.06, 0.4, '#cdeeff'); // 냉기 기둥
        for (let q = 0; q < 30; q += 1) {
          const a = (q / 30) * Math.PI * 2;
          fx.smoke.emit(trail.at.set(c.x + Math.cos(a) * 0.8, 0.3, c.z + Math.sin(a) * 0.8), trail.v.set(Math.cos(a) * 9, 0.8 + Math.random(), Math.sin(a) * 9), 0.16, 0.9, ['#ffffff', '#e3f2ff', '#f7fbff']);
        }
      }
    }
    if (car.current) {
      car.current.position.set(s.x, s.y, s.z);
      car.current.rotation.y = s.yaw;
    }
    s.shake = Math.max(0, (s.shake ?? 0) - d);
    if (tilt.current) tilt.current.rotation.set(Math.sin(s.age * 7) * s.tumble * 0.5 + Math.sin(s.age * 45) * s.shake * 0.3, 0, -steer * clamp(s.v / VMAX, -1, 1) * 0.12 + s.tumble * 0.6);
    wheels.current.forEach((w) => { if (w) w.rotation.z -= (s.v * d) / WHEEL_R; });
    [steerL.current, steerR.current].forEach((g) => { if (g) g.rotation.y = steer * 0.45; });
    // 먼지 고리 — 튕길 때 0.6초
    s.dustAge += d;
    if (dust.current) {
      const a = s.dustAge;
      dust.current.visible = a < 0.6;
      dust.current.position.set(s.x, 0.03, s.z);
      dust.current.scale.setScalar(0.4 + a * 3);
      dustMat.opacity = 0.5 * (1 - a / 0.6);
    }

    // 미사일 — 빠르게 속도가 붙으며 살짝 흔들려 날아가고 꼬리에 연기를 남긴다. 맞으면 폭발,
    // 수명이 다하거나 통로 밖이면 작은 폭발
    ms.forEach((m, i) => {
      const g = missiles.current[i];
      if (m.on) {
        m.age += d;
        const sp = M_V0 + (M_SPEED - M_V0) * Math.min(1, m.age / 0.25);
        const wob = Math.sin(m.age * 28 + m.wob) * 0.015;
        m.x += Math.cos(m.yaw + wob) * sp * d;
        m.z -= Math.sin(m.yaw + wob) * sp * d;
        m.y = M_Y - Math.min(0.12, m.age * 0.1);
        // 꼬리 바로 뒤 주황 빛줄기
        fx.glows.emit(trail.at.set(m.x - Math.cos(m.yaw) * 0.42, m.y, m.z + Math.sin(m.yaw) * 0.42), 0.34, 0.16, '#ff9a3c');
        fx.glows.emit(trail.at.set(m.x - Math.cos(m.yaw) * 0.32, m.y, m.z + Math.sin(m.yaw) * 0.32), 0.16, 0.08, '#fff2c0');
        // 연기 꼬리 — 꼬리 뒤로 일정 간격(뜨거운 노랑 → 회색 → 옅게)
        m.smokeT += d;
        while (m.smokeT > 0.012) {
          m.smokeT -= 0.012;
          trail.at.set(m.x - Math.cos(m.yaw) * 0.45, m.y, m.z + Math.sin(m.yaw) * 0.45);
          trail.v.set((Math.random() - 0.5) * 0.4 - Math.cos(m.yaw) * 1.2, (Math.random() - 0.3) * 0.3, (Math.random() - 0.5) * 0.4 + Math.sin(m.yaw) * 1.2);
          fx.smoke.emit(trail.at, trail.v, 0.07 + Math.random() * 0.04, 0.8 + Math.random() * 0.5, ['#ffe08a', '#b9bcc1', '#eef0f2']);
        }
        const zi = zombieAt(m.x, m.z, Z_HIT);
        if (bossAt(m.x, m.y, m.z)) {
          m.on = false;
          fx.booms.trigger(m.x, m.y, m.z, 1.0);
          hurtBoss(1);
        } else if (ps.on && Math.hypot(m.x - ps.x, m.z - ps.z) < HIT_R) {
          m.on = false;
          hitPolice();
        } else if (zi >= 0) {
          m.on = false;
          fx.booms.trigger(zs[zi].x, 0.8, zs[zi].z, 1.0);
          hurtZombie(zi, 1, { x: m.x - Math.cos(m.yaw), z: m.z + Math.sin(m.yaw) }, 6);
        } else if (m.age > M_LIFE || m.x < DRIVE.x0 - 2 || m.x > DRIVE.x1 + 10 || m.z < DRIVE.z0 - 1 || m.z > DRIVE.z1 + 2) {
          m.on = false;
          fx.booms.trigger(m.x, m.y, m.z, 0.8);
        }
      }
      if (g) {
        g.visible = m.on;
        g.position.set(m.x, m.y, m.z);
        g.rotation.set(Math.sin(m.age * 20) * 0.6, m.yaw, 0); // 날며 천천히 몸을 굴림
      }
      if (flames.current[i]) flames.current[i].scale.set(0.8 + Math.random() * 0.5, 0.85 + Math.random() * 0.3, 0.85 + Math.random() * 0.3);
    });

    // 유도 미사일 — 미사일 난무: 흩어져 솟은 뒤 3D 속도를 목표 쪽으로 점점 세게 꺾어(처음엔 크게 휘고 나중엔 날카롭게) 내리꽂힘.
    // 목표가 쓰러지면 가장 가까운 다른 목표로. 하얀 굵은 연기 꼬리가 오래 남음
    hs.forEach((h, i) => {
      const g = hMissiles.current[i];
      if (h.on) {
        h.age += d;
        h.retarget -= d;
        if (h.retarget <= 0 && !targetAlive(h.target)) { h.target = nearestTarget(h.x, h.z); h.retarget = 0.2; }
        const tp = targetPos(h.target);
        // 점화 — 관에서 튀어나와 잠깐 뒤 섬광 · 불티
        if (!h.lit && h.age >= H_IGNITE) {
          h.lit = true;
          fx.booms.trigger(h.x, h.y, h.z, 0.22);
          fx.sparks.burst(trail.at.set(h.x, h.y, h.z), 6, 2.2, '#bfe9ff');
          fx.glows.emit(trail.at.set(h.x, h.y, h.z), 0.9, 0.12, '#bfe9ff');
        }
        let vx = h.vx;
        let vy = h.vy;
        let vz = h.vz;
        let sp = Math.hypot(vx, vy, vz) || 1;
        if (!h.lit) {
          vy -= 6 * d; // 점화 전엔 살짝 처짐
        } else {
          // 목표 방향(없으면 앞 · 아래로) — 꺾는 힘은 나이에 따라 커짐
          let dx;
          let dy;
          let dz;
          if (tp) { dx = tp.x - h.x; dy = (tp.y ?? 0.8) - h.y; dz = tp.z - h.z; } else { dx = vx; dy = -sp * 0.3; dz = vz; }
          const dl = Math.hypot(dx, dy, dz) || 1;
          const turn = Math.min(H_TURN, 1.2 + h.age * 6.5) * d; // 이번 프레임 최대 꺾임(rad)
          const nx = vx / sp;
          const ny = vy / sp;
          const nz = vz / sp;
          const tx = dx / dl;
          const ty = dy / dl;
          const tz = dz / dl;
          const dot = Math.max(-1, Math.min(1, nx * tx + ny * ty + nz * tz));
          const ang = Math.acos(dot);
          const k2 = ang > 1e-4 ? Math.min(1, turn / ang) : 1;
          // 방향을 목표 쪽으로 k2만큼 돌림(정규화 보간)
          let ox = nx + (tx - nx) * k2;
          let oy = ny + (ty - ny) * k2;
          let oz = nz + (tz - nz) * k2;
          const ol = Math.hypot(ox, oy, oz) || 1;
          ox /= ol; oy /= ol; oz /= ol;
          // 처음엔 살짝 꿈틀(옆으로 흔들림)
          const wv = Math.sin(h.age * 10 + h.weave) * 0.25 * Math.max(0, 1 - h.age * 1.2);
          ox += -oz * wv;
          oz += ox * wv;
          sp = Math.min(H_SPEED, sp + 30 * d);
          vx = ox * sp; vy = oy * sp; vz = oz * sp;
        }
        h.vx = vx; h.vy = vy; h.vz = vz;
        h.x += vx * d;
        h.y += vy * d;
        h.z += vz * d;
        const hsp = Math.hypot(vx, vz) || 1e-5;
        h.yaw = Math.atan2(-vz, vx);
        h.pitch = Math.atan2(vy, hsp);
        h.roll += d * 8;
        // 꼬리 — 노즐 바로 뒤 파란 빛 · 흰 연기(굵게 · 오래)
        const bx = -vx / (Math.hypot(vx, vy, vz) || 1);
        const by = -vy / (Math.hypot(vx, vy, vz) || 1);
        const bz = -vz / (Math.hypot(vx, vy, vz) || 1);
        if (h.lit) {
          fx.glows.emit(trail.at.set(h.x + bx * 0.42, h.y + by * 0.42, h.z + bz * 0.42), 0.38, 0.2, '#7fd0ff');
          fx.glows.emit(trail.at.set(h.x + bx * 0.3, h.y + by * 0.3, h.z + bz * 0.3), 0.18, 0.1, '#ffffff');
        }
        h.smokeT += h.lit ? d : 0;
        while (h.smokeT > 0.014) {
          h.smokeT -= 0.014;
          trail.at.set(h.x + bx * 0.5, h.y + by * 0.5, h.z + bz * 0.5);
          trail.v.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.3) * 0.2, (Math.random() - 0.5) * 0.25);
          fx.smoke.emit(trail.at, trail.v, 0.09 + Math.random() * 0.04, 1.5 + Math.random() * 0.7, ['#ffffff', '#dde1e6', '#f1f3f5']);
        }
        // 맞힘 — 목표에 닿거나 바닥에 닿으면
        const zi = zombieAt(h.x, h.z, Z_HIT);
        const boomAt = (x, y, z, size) => {
          fx.booms.trigger(x, y, z, size);
          fx.glows.emit(trail.at.set(x, y, z), 2.2, 0.16, '#d8f2ff');
          for (let q = 0; q < 16; q += 1) {
            const a = (q / 16) * Math.PI * 2;
            fx.glows.emit(trail.at.set(x + Math.cos(a) * 0.9, 0.12, z + Math.sin(a) * 0.9), 0.35, 0.22, '#9fdcff');
          }
        };
        if (bossAt(h.x, h.y, h.z) && Math.abs(h.y - bossY()) < 2.2) {
          h.on = false;
          boomAt(h.x, h.y, h.z, 1.3);
          hurtBoss(3);
        } else if (ps.on && Math.hypot(h.x - ps.x, h.z - ps.z) < HIT_R && h.y < 1.4) {
          h.on = false;
          hitPolice();
        } else if (zi >= 0 && h.y < 1.8 * zs[zi].scale) {
          h.on = false;
          boomAt(zs[zi].x, 0.8, zs[zi].z, 1.3);
          fx.sparks.burst(trail.at.set(zs[zi].x, 0.9, zs[zi].z), 16, 5.5, '#bfe9ff');
          hurtZombie(zi, 2, { x: h.x + bx, z: h.z + bz }, 7);
        } else if (h.age > H_LIFE || h.y < 0.05) {
          h.on = false;
          boomAt(h.x, Math.max(0.2, h.y), h.z, 0.9);
        }
      }
      if (g) {
        g.visible = h.on;
        g.position.set(h.x, h.y, h.z);
        g.rotation.set(h.roll ?? 0, h.yaw ?? 0, h.pitch ?? 0, 'YZX'); // 가는 방향(좌우 · 위아래)대로 + 몸 굴림
      }
      if (hFlames.current[i]) { const on = h.lit ? 1 : 0.001; hFlames.current[i].scale.set((1 + Math.random() * 0.7) * on, (0.9 + Math.random() * 0.3) * on, (0.9 + Math.random() * 0.3) * on); }
    });

    // E 블랙홀 — 날아가 열리고, 소용돌이로 끌어당기다(가까울수록 세게 · 공중으로 뜸) 핵에 닿으면 삼킴, 쪼그라들었다 터짐
    HOLE_T.value = s.age;
    let dimT = 0; // 블랙홀이 열려 있으면 화면 가장자리가 어두워짐
    bh.forEach((h, i) => {
      const R = holes.current[i];
      if (h.phase !== 'off') {
        h.t += d;
        let size = 1;
        if (h.phase === 'fly') {
          const u = Math.min(1, h.t / (h.fly ?? BH_FLY));
          const c = crowdSpot(h); // 날아가는 동안에도 몰린 곳을 쫓음
          if (c) { h.tx += (c.x - h.tx) * Math.min(1, d * 6); h.tz += (c.z - h.tz) * Math.min(1, d * 6); }
          h.x = h.sx + (h.tx - h.sx) * u;
          h.z = h.sz + (h.tz - h.sz) * u;
          h.y = M_Y + 0.2 + (BH_Y - M_Y - 0.2) * u + Math.sin(u * Math.PI) * (h.arc ?? 2.4);
          size = 0.22;
          fx.glows.emit(trail.at.set(h.x, h.y, h.z), 0.75, 0.32, '#9a5cff');
          fx.glows.emit(trail.at.set(h.x, h.y, h.z), 0.3, 0.16, '#f0e6ff');
          if (u >= 1) {
            h.phase = 'open';
            h.t = 0;
            fx.sparks.burst(trail.at.set(h.x, h.y, h.z), 30, 6, '#e0c8ff');
            fx.glows.emit(trail.at.set(h.x, h.y, h.z), 4, 0.25, '#d9c2ff');
            if (bus) { bus.flash = Math.max(bus.flash, 0.3); bus.flashColor = '190, 150, 255'; bus.shake = Math.max(bus.shake, 0.35); }
          }
        } else if (h.phase === 'open') {
          const u = Math.min(1, h.t / BH_OPEN);
          size = 0.22 + 0.78 * (1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2); // 살짝 넘쳤다 자리 잡음
          if (u >= 1) { h.phase = 'hold'; h.t = 0; }
        } else if (h.phase === 'hold') {
          size = 1 + Math.sin(h.t * 7) * 0.04;
          // 더 몰린 곳으로 천천히 미끄러짐
          const c = crowdSpot(h);
          if (c) {
            const dx = c.x - h.x;
            const dz = c.z - h.z;
            const dl = Math.hypot(dx, dz);
            if (dl > 0.3) { const m = Math.min(dl, 2.5 * d); h.x += (dx / dl) * m; h.z += (dz / dl) * m; }
            h.tx = h.x;
            h.tz = h.z;
          }
          if (h.t >= BH_HOLD) { h.phase = 'collapse'; h.t = 0; }
        } else if (h.phase === 'collapse') {
          const u = Math.min(1, h.t / BH_COLLAPSE);
          size = 1 - u * u * 0.92;
          if (u >= 1) { h.phase = 'wave'; h.t = 0; holeBlast(h); }
        } else if (h.phase === 'wave' && h.t > 0.7) {
          h.phase = 'off';
        }
        h.size = size;
        h.spin += d * (h.phase === 'collapse' ? 16 : 4);
        if (h.phase === 'open' || h.phase === 'hold' || h.phase === 'collapse') {
          const pw = h.phase === 'collapse' ? 1.8 : Math.min(1, size);
          // 끌어당김 — 안쪽 + 옆으로(소용돌이), 큰 좀비는 덜 끌림
          zs.forEach((zz, j) => {
            if (!alive(zz)) return;
            const dx = h.x - zz.x;
            const dz = h.z - zz.z;
            const dist = Math.hypot(dx, dz) || 1e-3;
            if (dist > BH_R) return;
            const near = 1 - dist / BH_R;
            const f = pw * (2.2 + 10 * near * near) * (zz.scale > 1.2 ? 0.6 : 1);
            const ux = dx / dist;
            const uz = dz / dist;
            zz.x += (ux - uz * 0.9) * f * d;
            zz.z += (uz + ux * 0.9) * f * d;
            zz.lev = Math.min(1.4, (zz.lev ?? 0) + d * 2.6 * near * pw);
            zz.yaw += d * 7 * near;
            zz.flinch = Math.max(zz.flinch, 0.12 + near * 0.2);
            zz.jolt = Math.max(zz.jolt ?? 0, near * 0.6);
            if (dist < BH_EAT * zz.scale + 0.2) swallow(j, h);
          });
          // 보스는 너무 커서 안 빨려 듦 — 대신 안에 있는 동안 계속 깎임
          if (bossAt(h.x, 0, h.z, BH_R - 2.3)) hurtBoss(8 * d, true);
          if (ps.on) {
            const dx = h.x - ps.x;
            const dz = h.z - ps.z;
            const dist = Math.hypot(dx, dz) || 1e-3;
            if (dist < BH_R) {
              const near = 1 - dist / BH_R;
              const f = pw * (1.5 + 6 * near * near);
              ps.x += (dx / dist - (dz / dist) * 0.9) * f * d;
              ps.z += (dz / dist + (dx / dist) * 0.9) * f * d;
              ps.stun = Math.max(ps.stun, 0.4);
              ps.yaw += d * 5 * near;
            }
          }
          // 나선 팔 — 바닥에서 핵으로 감겨 드는 빛(매 프레임 각도가 돌아 소용돌이로 보임)
          const rr0 = BH_R * Math.min(1, size);
          for (let arm = 0; arm < 3; arm += 1) {
            for (let q = 0; q < 6; q += 1) {
              const u = q / 6;
              const rr = 0.7 + (rr0 - 0.7) * (1 - u);
              const a = h.spin * 1.6 + (arm * Math.PI * 2) / 3 + u * 4.5;
              fx.glows.emit(trail.at.set(h.x + Math.cos(a) * rr, 0.1 + u * (h.y - 0.2), h.z + Math.sin(a) * rr), 0.26 + u * 0.3, 0.12, u > 0.6 ? '#ffb070' : '#8f5cff');
            }
          }
          // 빨려 드는 먼지
          for (let q = 0; q < 2; q += 1) {
            const a = Math.random() * Math.PI * 2;
            const rr = rr0 * (0.55 + Math.random() * 0.45);
            const cx = Math.cos(a);
            const cz = Math.sin(a);
            fx.smoke.emit(trail.at.set(h.x + cx * rr, 0.12, h.z + cz * rr), trail.v.set(-cx * 5 - cz * 4, 0.8 + Math.random(), -cz * 5 + cx * 4), 0.14, 0.7, ['#b9a6d9', '#6b5a8a', '#d8d0e6']);
          }
          // 쪼그라들 때 — 둘레 빛이 고리째 핵으로 몰려 듦(내파)
          if (h.phase === 'collapse') {
            const u = Math.min(1, h.t / BH_COLLAPSE);
            const rr = 0.5 + (1 - u) * 4.2;
            for (let q = 0; q < 24; q += 1) {
              const a = (q / 24) * Math.PI * 2 + h.spin;
              fx.glows.emit(trail.at.set(h.x + Math.cos(a) * rr, h.y + Math.sin(a * 3) * 0.25, h.z + Math.sin(a) * rr), 0.42, 0.08, q % 2 ? '#f0e6ff' : '#b07bff');
            }
          }
          // 핵 둘레 보라 번개
          h.boltT -= d;
          if (h.boltT <= 0) {
            h.boltT = 0.14 + Math.random() * 0.14;
            const a = Math.random() * Math.PI * 2;
            const rr = (1.6 + Math.random() * 1.2) * size;
            bolt(h.x, h.y, h.z, h.x + Math.cos(a) * rr, h.y + (Math.random() - 0.5) * 1.2, h.z + Math.sin(a) * rr);
          }
        }
      }
      const open = h.phase === 'open' || h.phase === 'hold' || h.phase === 'collapse';
      if (open) dimT = Math.max(dimT, h.phase === 'collapse' ? 0.95 : 0.7);
      if (R.g) {
        R.g.visible = h.phase !== 'off' && h.phase !== 'wave';
        R.g.position.set(h.x, h.y, h.z);
        R.g.scale.setScalar(Math.max(0.01, h.size ?? 1));
      }
      // 제트 — 열리며 뻗고, 쪼그라들 때 줄어듦(깜박임)
      if (R.jets) {
        const amp = h.phase === 'open' ? Math.min(1, h.t / BH_OPEN) : h.phase === 'hold' ? Math.min(1, 0.2 + h.t * 2) : h.phase === 'collapse' ? 1 - Math.min(1, h.t / BH_COLLAPSE) : 0;
        R.jets.visible = amp > 0.01;
        R.jets.scale.set(1 + Math.random() * 0.15, Math.max(0.01, amp) * (0.92 + Math.random() * 0.12), 1 + Math.random() * 0.15);
      }
      if (R.face) R.face.quaternion.copy(state.camera.quaternion); // 빛 고리는 늘 카메라를 봄(휘어 보이는 뒤쪽 원반)
      if (R.swirl) {
        R.swirl.visible = open;
        R.swirl.position.set(h.x, 0.05 + i * 0.002, h.z);
        R.swirl.scale.setScalar(BH_R * Math.max(0.05, Math.min(1, h.size ?? 1)));
        R.swirl.rotation.z = h.spin * 0.6;
      }
      if (R.wave) {
        const u = h.phase === 'wave' ? Math.min(1, h.t / 0.7) : 0;
        R.wave.visible = h.phase === 'wave';
        R.wave.position.set(h.x, 0.1, h.z);
        R.wave.scale.setScalar(0.5 + (1 - (1 - u) ** 3) * BH_BLAST_R * 1.15);
        holeWaveMats[i].a.opacity = 1 - u;
      }
      if (R.wave2) {
        const u = h.phase === 'wave' ? Math.min(1, h.t / 0.45) : 1;
        R.wave2.visible = h.phase === 'wave' && u < 1;
        R.wave2.position.set(h.x, 0.14, h.z);
        R.wave2.scale.setScalar(0.4 + (1 - (1 - u) ** 2) * BH_BLAST_R * 1.6);
        holeWaveMats[i].b.opacity = (1 - u) * 0.9;
      }
      // 흰 충격파 껍질 — 터진 자리에서 카메라를 보며 커지는 고리
      if (R.shell) {
        const u = h.phase === 'wave' ? Math.min(1, h.t / 0.5) : 1;
        R.shell.visible = h.phase === 'wave' && u < 1;
        R.shell.position.set(h.x, h.y, h.z);
        R.shell.quaternion.copy(state.camera.quaternion);
        R.shell.scale.setScalar(0.5 + (1 - (1 - u) ** 2) * 6);
        holeWaveMats[i].c.opacity = (1 - u) ** 2;
      }
    });

    if (bus) bus.dim = (bus.dim ?? 0) + (dimT - (bus.dim ?? 0)) * Math.min(1, d * 3);

    // S 유성 — wait(경고 원이 목표를 따라감) → fall(하늘에서 비스듬히 불타며) → 쾅
    mt.forEach((q, i) => {
      const g = meteors.current[i];
      const aim = metAims.current[i];
      if (q.phase === 'wait') {
        q.t += d;
        const tp = targetPos(q.target);
        if (tp) { q.tx = clamp(tp.x, DRIVE.x0, DRIVE.x1); q.tz = clamp(tp.z, DRIVE.z0, DRIVE.z1); }
        if (q.t >= q.delay) {
          const sx = q.tx + MET_SKY.x + (Math.random() - 0.5) * 5;
          const sy = MET_SKY.y + Math.random() * 5;
          const sz = q.tz + MET_SKY.z + (Math.random() - 0.5) * 3;
          const dl = Math.hypot(q.tx - sx, 0.3 - sy, q.tz - sz);
          Object.assign(q, { phase: 'fall', t: 0, sx, sy, sz, x: sx, y: sy, z: sz, dx: (q.tx - sx) / dl, dy: (0.3 - sy) / dl, dz: (q.tz - sz) / dl });
        }
      }
      if (q.phase === 'fall') {
        q.t += d;
        const u = Math.min(1, q.t / MET_FALL);
        const e = u * (0.55 + 0.45 * u); // 떨어질수록 빨라짐
        q.x = q.sx + (q.tx - q.sx) * e;
        q.y = q.sy + (0.3 - q.sy) * e;
        q.z = q.sz + (q.tz - q.sz) * e;
        q.spin += d * 7;
        fx.glows.emit(trail.at.set(q.x - q.dx * 0.35, q.y - q.dy * 0.35, q.z - q.dz * 0.35), 1.2 * q.size, 0.3, '#ff6a1a');
        fx.glows.emit(trail.at.set(q.x, q.y, q.z), 0.55 * q.size, 0.1, '#fff1c0');
        q.smokeT += d;
        while (q.smokeT > 0.03) {
          q.smokeT -= 0.03;
          fx.smoke.emit(trail.at.set(q.x - q.dx * 0.8, q.y - q.dy * 0.8, q.z - q.dz * 0.8), trail.v.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5), 0.2 * q.size, 1.1 + Math.random() * 0.5, ['#ff9a3c', '#4a3f3a', '#a8a29c']);
        }
        if (Math.random() < 0.6) fx.sparks.burst(trail.at.set(q.x, q.y, q.z), 1, 1.6, '#ffb347');
        if (u >= 1) { q.phase = 'off'; meteorHit(q); }
      }
      if (g) {
        g.visible = q.phase === 'fall';
        if (g.visible) {
          g.position.set(q.x, q.y, q.z);
          g.quaternion.setFromUnitVectors(tq.up, tq.v.set(-q.dx, -q.dy, -q.dz)); // 꼬리(+Y)가 온 쪽으로
          g.scale.setScalar(q.size);
        }
      }
      if (metRocks.current[i]) metRocks.current[i].rotation.set(q.spin, q.spin * 0.7, 0);
      if (aim) {
        const on = q.phase === 'wait' || q.phase === 'fall';
        aim.visible = on;
        if (on) {
          const prog = q.phase === 'fall' ? Math.min(1, q.t / MET_FALL) : 0;
          aim.position.set(q.tx, 0.07 + i * 0.001, q.tz);
          aim.scale.setScalar(MET_R * (1.5 - prog * 0.6));
          aim.rotation.z = s.age * 3;
          metAimMats[i].opacity = (0.35 + prog * 0.4) * (Math.sin(s.age * (10 + prog * 30)) > 0 ? 1 : 0.4);
        }
      }
    });

    // 조준 고리 — 날고 있는 유도 미사일이 노리는 목표마다 발밑에 하나(돌며 맥박)
    const aimed = [];
    hs.forEach((h) => {
      if (!h.on || !h.target) return;
      const tp = targetPos(h.target);
      if (tp && !aimed.some((a) => Math.hypot(a.x - tp.x, a.z - tp.z) < 0.3)) aimed.push({ ...tp, lockAge: h.age });
    });
    locks.current.forEach((r, i) => {
      if (!r) return;
      const tp = aimed[i];
      r.visible = !!tp;
      if (!tp) return;
      r.position.set(tp.x, 0.06, tp.z);
      r.rotation.z = s.age * 3;
      const lk = Math.min(1, (tp.lockAge ?? 1) / 0.22); // 발사 직후엔 크게 → 착 조임
      r.scale.setScalar((0.85 + Math.sin(s.age * 14) * 0.12) * (1 + (1 - lk) * 2.2));
    });
    lockMat.opacity = 0.6 + Math.sin(s.age * 14) * 0.25;

    // 핵 — Shift 한 번. 지붕에서 하늘로 솟고(살짝 목표 쪽으로 기울며) 정점에서 꺾여 목표 땅으로 내리꽂힘
    nk.cool = Math.max(0, nk.cool - d);
    if (k.nuke) {
      k.nuke = false;
      if ((nk.phase === 'idle' || nk.phase === 'blast') && nk.cool <= 0 && s.landed) {
        const alive = zs.filter((zz) => zz.state === 'walk' || zz.state === 'rise');
        let tx = s.x + Math.cos(s.yaw) * 12;
        let tz = s.z - Math.sin(s.yaw) * 12;
        if (alive.length) { tx = alive.reduce((a, zz) => a + zz.x, 0) / alive.length; tz = alive.reduce((a, zz) => a + zz.z, 0) / alive.length; } else if (bossAlive()) { tx = boss.x; tz = boss.z; }
        Object.assign(nk, { phase: 'up', t: 0, x: s.x, y: M_Y, z: s.z, tx: clamp(tx, DRIVE.x0, DRIVE.x1), tz: clamp(tz, DRIVE.z0, DRIVE.z1), smokeT: 0, hitPolice: false, hitCar: false, hitBoss: false });
        nk.ax = s.x + (nk.tx - s.x) * 0.35; // 정점 자리
        nk.az = s.z + (nk.tz - s.z) * 0.35;
        fx.booms.trigger(s.x, M_Y + 0.2, s.z, 0.9);
        s.shake = 0.4;
      }
    }
    if (nk.phase === 'up' || nk.phase === 'down') {
      nk.t += d;
      const px = nk.x;
      const py = nk.y;
      const pz = nk.z;
      if (nk.phase === 'up') {
        const u = Math.min(1, nk.t / NUKE_UP);
        const e = u * u;
        nk.y = M_Y + (NUKE_TOP - M_Y) * e;
        nk.x += (nk.ax - nk.x) * Math.min(1, d * 1.5);
        nk.z += (nk.az - nk.z) * Math.min(1, d * 1.5);
        if (u >= 1) { nk.phase = 'down'; nk.t = 0; nk.sx = nk.x; nk.sz = nk.z; }
      } else {
        const u = Math.min(1, nk.t / NUKE_DOWN);
        const e = u * u;
        nk.x = nk.sx + (nk.tx - nk.sx) * e;
        nk.z = nk.sz + (nk.tz - nk.sz) * e;
        nk.y = NUKE_TOP * (1 - e) + 0.3 * e;
        if (u >= 1) { nk.phase = 'blast'; nk.t = 0; fx.nuke.trigger(nk.tx, nk.tz); }
      }
      // 가는 방향을 봄(머리 위 · 아래로)
      const vx = nk.x - px;
      const vy = nk.y - py;
      const vz = nk.z - pz;
      const h = Math.hypot(vx, vz);
      if (h > 1e-5) nk.yaw = Math.atan2(-vz, vx);
      nk.pitch = Math.atan2(vy, Math.max(1e-5, h));
      // 굵은 연기 꼬리
      nk.smokeT += d;
      while (nk.smokeT > 0.014) {
        nk.smokeT -= 0.014;
        trail.at.set(nk.x - Math.cos(nk.yaw) * Math.cos(nk.pitch) * 1.1, nk.y - Math.sin(nk.pitch) * 1.1, nk.z + Math.sin(nk.yaw) * Math.cos(nk.pitch) * 1.1);
        trail.v.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6);
        fx.smoke.emit(trail.at, trail.v, 0.16 + Math.random() * 0.08, 1.4 + Math.random() * 0.8, ['#fff1b0', '#c9ccd0', '#eef0f2']);
      }
    } else if (nk.phase === 'blast') {
      nk.t += d;
      // 충격파 고리가 지나가는 순간 맞힘 — 좀비는 쓰러지고, 경찰차는 멀리 밀리며 오래 멈춤, 차는 크게 흔들리며 밀려남
      const r = fx.nuke.ringR();
      zs.forEach((zz, i) => {
        if ((zz.state === 'walk' || zz.state === 'rise') && Math.hypot(zz.x - nk.tx, zz.z - nk.tz) < r) killZombie(i, { x: nk.tx, z: nk.tz }, 14);
      });
      if (!nk.hitBoss && bossAt(nk.tx, 0, nk.tz, r - 2.3)) { nk.hitBoss = true; hurtBoss(70); }
      if (ps.on && !nk.hitPolice && Math.hypot(ps.x - nk.tx, ps.z - nk.tz) < r) {
        nk.hitPolice = true;
        ps.stun = STUN * 2;
        ps.caught = 0;
        ps.v = -8;
        ps.yaw = Math.atan2(-(nk.tz - ps.z), nk.tx - ps.x);
      }
      const cd = Math.hypot(s.x - nk.tx, s.z - nk.tz);
      if (!nk.hitCar && cd < r && cd < 14) {
        nk.hitCar = true;
        s.shake = 1.4 * (1 - cd / 14);
        const push = 3 * (1 - cd / 14);
        s.x = clamp(s.x + ((s.x - nk.tx) / (cd || 1)) * push, DRIVE.x0, DRIVE.x1);
        s.z = clamp(s.z + ((s.z - nk.tz) / (cd || 1)) * push, DRIVE.z0, DRIVE.z1);
      }
      if (nk.t > 3) { nk.phase = 'idle'; nk.cool = NUKE_COOL; }
    }
    if (nukeRef.current) {
      nukeRef.current.visible = nk.phase === 'up' || nk.phase === 'down';
      // 떨어질 자리 경고 — 붉은 원 · 십자(가까워질수록 좁아지고 빨리 깜박) · 희미한 빛기둥
      const flying = nk.phase === 'up' || nk.phase === 'down';
      const prog = nk.phase === 'up' ? (nk.t / NUKE_UP) * 0.55 : nk.phase === 'down' ? 0.55 + (nk.t / NUKE_DOWN) * 0.45 : 1;
      if (nukeAim.current) {
        nukeAim.current.visible = flying;
        nukeAim.current.position.set(nk.tx, 0.09, nk.tz);
        nukeAim.current.scale.setScalar(9 - prog * 5);
        nukeAim.current.rotation.z = s.age * (1 + prog * 4);
        nukeAimMat.opacity = 0.35 + (Math.sin(s.age * (8 + prog * 30)) > 0 ? 0.5 : 0.1);
      }
      if (nukeCol.current) {
        nukeCol.current.visible = flying;
        nukeCol.current.position.set(nk.tx, 0, nk.tz);
        nukeColMat.opacity = 0.08 + prog * 0.18;
      }
      nukeRef.current.position.set(nk.x, nk.y, nk.z);
      nukeRef.current.rotation.set(0, nk.yaw, nk.pitch, 'YXZ');
    }
    if (nukeFlame.current) nukeFlame.current.scale.set(1 + Math.random() * 0.6, 0.85 + Math.random() * 0.4, 0.85 + Math.random() * 0.4);
    fx.nuke.update(d);

    // 좀비 — 차가 내려앉으면 하나씩 차와 떨어진 바닥에서 솟아올라 비틀비틀 쫓아온다. 물면 차가 휘청 · 느려짐
    zs.forEach((zz, i) => {
      const parts = zParts[i];
      // 불붙음 — 타는 동안 깎이고 몸에서 불길
      if (alive(zz) && (zz.burn ?? 0) > 0) {
        zz.burn -= d;
        zz.hp -= BURN_DPS * d;
        if (Math.random() < d * 14) fx.fire.emit(trail.at.set(zz.x + (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 1.3 * zz.scale, zz.z + (Math.random() - 0.5) * 0.4), trail.v.set(0, 1.2, 0), 0.1, 0.45);
        if (zz.hp <= 0) killZombie(i, { x: zz.x - 0.1, z: zz.z }, 4);
      }
      // 얼음 — 녹을 때까지 제자리(솟아오르던 것도 멈춤), 가끔 반짝, 다 녹으면 얼음이 깨짐
      const frozen = alive(zz) && (zz.frozen ?? 0) > 0;
      if (frozen) {
        zz.frozen -= d;
        if (Math.random() < d * 3) fx.glows.emit(trail.at.set(zz.x + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 1.6 * zz.scale, zz.z + (Math.random() - 0.5) * 0.6), 0.22, 0.3, '#ffffff');
        if (zz.frozen <= 0) {
          zz.frozen = 0;
          iceBurst(zz.x, zz.z, zz.scale, 8);
          fx.iceShards.burst(trail.at.set(zz.x, 1 * zz.scale, zz.z), 6, 3);
        }
      }
      if (zz.state === 'off') {
        // 웨이브 감독이 꺼낼 때까지 쉼
      } else if (zz.state === 'rise') {
        if (!frozen) zz.t += d;
        if (zz.t >= Z_RISE) { zz.state = 'walk'; zz.t = 0; }
      } else if (zz.state === 'walk' && frozen) {
        // 얼어 있음 — 못 움직이고 못 묾. 대시로 들이받으면 깨짐
        zz.flinch = Math.max(0, zz.flinch - d);
        if (s.dash > 0 && Math.hypot(s.x - zz.x, s.z - zz.z) < 1.2 * zz.scale) { fx.booms.trigger(zz.x, 0.8, zz.z, 0.6); hurtZombie(i, 99, s, 12); }
      } else if (zz.state === 'walk') {
        const dx = s.x - zz.x;
        const dz = s.z - zz.z;
        const dist = Math.hypot(dx, dz);
        zz.yaw = turnToward(zz.yaw, Math.atan2(-dz, dx), 2.2 * d);
        if (dist > Z_BITE * 0.9) {
          zz.x += Math.cos(zz.yaw) * zz.speed * d;
          zz.z -= Math.sin(zz.yaw) * zz.speed * d;
        }
        // 좀비끼리 겹치지 않게 살짝 밀어냄
        zs.forEach((o, j) => {
          if (j === i || o.state !== 'walk') return;
          const ex = zz.x - o.x;
          const ez = zz.z - o.z;
          const e = Math.hypot(ex, ez);
          if (e > 0.001 && e < 0.6) { zz.x += (ex / e) * (0.6 - e) * 0.5; zz.z += (ez / e) * (0.6 - e) * 0.5; }
        });
        zz.x = clamp(zz.x, DRIVE.x0, DRIVE.x1);
        zz.z = clamp(zz.z, DRIVE.z0, DRIVE.z1);
        zz.phase += d * zz.speed * 4.2;
        zz.bite = Math.max(0, zz.bite - d);
        zz.flinch = Math.max(0, zz.flinch - d);
        if (s.dash > 0 && dist < 1.2 * zz.scale) {
          // 대시로 들이받음
          fx.booms.trigger(zz.x, 0.8, zz.z, 0.6);
          hurtZombie(i, 99, s, 12);
        } else if (dist < Z_BITE * zz.scale && zz.bite <= 0 && s.landed && gm.phase !== 'over') {
          zz.bite = 1;
          s.hp -= biteDmg(gm.wave) * (zz.scale > 1.2 ? 1.5 : 1);
          s.v *= 0.2;
          s.shake = 0.5;
          s.x = clamp(s.x + (dx / (dist || 1)) * 0.4, DRIVE.x0, DRIVE.x1);
          s.z = clamp(s.z + (dz / (dist || 1)) * 0.4, DRIVE.z0, DRIVE.z1);
        }
      } else if (zz.state === 'dead' && zz.suck) {
        zz.t += d;
        zz.suck.t += d;
        if (zz.suck.t >= 0.5) { zz.state = 'off'; zz.suck = null; }
      } else if (zz.state === 'dead') {
        zz.t += d;
        zz.fall = Math.min(1, zz.t / (zz.hy > 0.05 ? 0.7 : 0.4));
        zz.sink = zz.hy > 0.02 ? 0 : Math.max(0, (zz.t - 1.4) / 1.5);
        zz.yaw += (zz.spin ?? 0) * d * (zz.hy > 0.02 ? 1 : 0.15);
        zz.spin = (zz.spin ?? 0) * (1 - d * 1.5);
        if (zz.t > 1.4 + 1.5 && zz.hy <= 0.02) zz.state = 'off';
      }
      // 밀림 · 튀어오름 — 맞은 힘이 미끄러지며 잦아들고, 위로 튄 것은 떨어짐(바닥에 닿으면 체액)
      if (zz.state !== 'off') {
        if (zz.kx || zz.kz) {
          zz.x = clamp(zz.x + zz.kx * d, DRIVE.x0, DRIVE.x1);
          zz.z = clamp(zz.z + zz.kz * d, DRIVE.z0, DRIVE.z1);
          const damp = Math.max(0, 1 - d * (zz.hy > 0.02 ? 1.2 : 6));
          zz.kx *= damp;
          zz.kz *= damp;
          if (Math.abs(zz.kx) + Math.abs(zz.kz) < 0.02) { zz.kx = 0; zz.kz = 0; }
        }
        if (zz.ky || zz.hy > 0) {
          zz.ky -= 22 * d;
          const was = zz.hy;
          zz.hy = Math.max(0, zz.hy + zz.ky * d);
          if (zz.hy === 0) {
            if (was > 0.4 && zz.state === 'dead') { splat(zz.x, zz.z, 1.2 * zz.scale); fx.smoke.emit(trail.at.set(zz.x, 0.15, zz.z), trail.v.set(0, 0.5, 0), 0.25, 0.8, ['#b8ad9a', '#9a9288', '#e6e3df']); }
            zz.ky = 0;
          }
        }
        zz.flash = Math.max(0, (zz.flash ?? 0) - d * 7);
        if (zz.lev) zz.lev = Math.max(0, zz.lev - d * 0.9); // 블랙홀에서 벗어나면 천천히 내려옴
        zz.jolt = Math.max(0, (zz.jolt ?? 0) - d * 5);
        // 번쩍임 — 이 좀비 재질만
        const fm = zMats[i];
        const fl = zz.flash;
        const iced = alive(zz) && (zz.frozen ?? 0) > 0 && fl < 0.3; // 얼어 있으면 차가운 푸른빛
        const hot = alive(zz) && (zz.burn ?? 0) > 0 && fl < 0.3; // 타고 있으면 주황빛
        Object.values(fm).forEach((m) => {
          m.emissive.set(iced ? '#5fbfff' : hot ? '#ff6a1a' : zz.red ? '#ff2a1a' : '#ffffff');
          m.emissiveIntensity = iced ? 0.6 : hot ? 0.5 : fl * (zz.red ? 1.4 : 1.1);
        });
      }
      // 얼음 껍질 — 얼어 있는 동안 몸을 감쌈(나타날 때 커지며, 녹기 직전 떨림)
      const ice = ices.current[i];
      if (ice) {
        const fz = alive(zz) && (zz.frozen ?? 0) > 0;
        ice.visible = fz;
        if (fz) {
          const ap = Math.min(1, (s.age - (zz.fz0 ?? 0)) / 0.15);
          const sh = zz.frozen < 0.6 ? 0.05 : 0;
          const rise = zz.state === 'rise' ? zz.t / Z_RISE : 1;
          ice.position.set(zz.x + (Math.random() - 0.5) * sh, (-1.8 * (1 - rise)) * zz.scale + (zz.hy ?? 0) + (zz.lev ?? 0), zz.z + (Math.random() - 0.5) * sh);
          ice.rotation.y = zz.yaw;
          ice.scale.setScalar(zz.scale * Math.max(0.01, ap));
        }
      }
      // 그리기 — 솟아오름 · 걸음(다리 · 팔 흔들기 · 몸 들썩) · 쓰러짐(뒤로) · 가라앉음
      const b = parts.body;
      if (!b) return;
      b.visible = zz.state !== 'off';
      if (!b.visible) return;
      const rise = zz.state === 'rise' ? zz.t / Z_RISE : 1;
      const walking = zz.state === 'walk';
      const y = -1.8 * (1 - rise) + (walking ? Math.abs(Math.sin(zz.phase)) * 0.04 : 0) - zz.sink * 1.9 * (zz.state === 'dead' ? 1 : 0);
      const lev = zz.lev ?? 0;
      b.position.set(zz.x, y * zz.scale + (zz.hy ?? 0) + lev, zz.z);
      b.scale.setScalar(zz.scale);
      b.rotation.set(lev * Math.sin(s.age * 8 + i) * 0.45, zz.yaw, zz.state === 'dead' ? zz.fall * (Math.PI / 2) * 0.95 : Math.sin(zz.phase * 0.5) * 0.06 + zz.flinch * 1.6);
      const sw = walking ? Math.sin(zz.phase) : 0;
      if (parts.legL) parts.legL.rotation.z = sw * 0.5;
      if (parts.legR) parts.legR.rotation.z = -sw * 0.5;
      const jl = zz.jolt ?? 0;
      if (parts.armL) parts.armL.rotation.set(-jl * 0.9, 0, -0.08 + Math.sin(zz.phase * 0.5) * 0.12 + jl * 0.9);
      if (parts.armR) parts.armR.rotation.set(jl * 0.9, 0, -0.08 - Math.sin(zz.phase * 0.5 + 1) * 0.12 + jl * 0.6);
      if (parts.head) parts.head.rotation.set(Math.sin(zz.phase * 0.5) * 0.18 + jl * 0.3, 0, -0.1 + (zz.bite > 0.7 ? 0.25 : 0) + zz.flinch * 2.2);
      // 블랙홀에 삼켜지는 중 — 핵 둘레를 빙글 돌며 작아져 빨려 듦
      if (zz.suck) {
        const su = zz.suck;
        const u = Math.min(1, su.t / 0.5);
        const e = u * u;
        const a = Math.atan2(zz.z - su.z, zz.x - su.x) + u * 7;
        const rr = Math.hypot(zz.x - su.x, zz.z - su.z) * (1 - e);
        b.position.set(su.x + Math.cos(a) * rr, su.y0 + (su.y - su.y0) * e, su.z + Math.sin(a) * rr);
        b.scale.setScalar(zz.scale * Math.max(0.03, 1 - e));
        b.rotation.set(u * 6, zz.yaw + u * 10, u * 4);
      }
    });

    // 보스 — 공룡: 걸어와 가까우면 묾, 가끔 포효 → 돌진. 드래곤: 차 둘레 하늘을 돌다 불을 뿜거나 내리꽂힘.
    // 얼면 그 자리에 멈춤, 쓰러지면 여기저기 폭발(드래곤은 떨어짐) → 가라앉아 사라짐
    if (boss.on) {
      boss.t += d;
      boss.flash = Math.max(0, boss.flash - d * 6);
      const rex = boss.kind === 'rex';
      const P = rex ? rexParts : wyrmParts;
      const dx = s.x - boss.x;
      const dz = s.z - boss.z;
      const dist = Math.hypot(dx, dz) || 1e-3;
      const face = Math.atan2(-dz, dx);
      const live = boss.state !== 'dying';
      const iced = live && boss.frozen > 0;
      const carOk = gm.phase !== 'over';
      const dust = (x, z, n, sp) => {
        for (let q = 0; q < n; q += 1) {
          const a = Math.random() * Math.PI * 2;
          fx.smoke.emit(trail.at.set(x + Math.cos(a) * 0.4, 0.15, z + Math.sin(a) * 0.4), trail.v.set(Math.cos(a) * sp, 0.5 + Math.random() * 0.6, Math.sin(a) * sp), 0.22, 0.9 + Math.random() * 0.5, ['#c9b79c', '#9a8f80', '#dcd8d2']);
        }
      };
      if (iced) {
        boss.frozen -= d;
        if (boss.frozen <= 0) { iceBurst(boss.x, boss.z, 2, 12); fx.iceShards.burst(trail.at.set(boss.x, bossY(), boss.z), 12, 4); }
      }
      let gait = 0;
      if (!live) {
        if (boss.t < 1.6 && Math.random() < d * 9) {
          fx.booms.trigger(boss.x + (Math.random() - 0.5) * 3, (rex ? 2 : boss.y) + (Math.random() - 0.5) * 1.5, boss.z + (Math.random() - 0.5) * 1.5, 0.9 + Math.random() * 0.8);
        }
        if (!rex) {
          boss.vy -= 14 * d;
          boss.y = Math.max(0.7, boss.y + boss.vy * d);
          if (boss.y <= 0.7 && !boss.crashed) { boss.crashed = true; fx.booms.trigger(boss.x, 0.5, boss.z, 2.2); dust(boss.x, boss.z, 16, 6); }
        }
        if (boss.t > 1.6 && !boss.finalBoom) {
          boss.finalBoom = true;
          fx.booms.trigger(boss.x, 1.2, boss.z, 2.6);
          if (bus) { bus.flash = Math.max(bus.flash, 0.7); bus.flashColor = '255, 200, 140'; bus.shake = Math.max(bus.shake, 1.3); }
        }
        if (boss.t > 3.6) boss.on = false;
      } else if (!iced && rex) {
        if (boss.state === 'enter') {
          boss.yaw = Math.PI;
          boss.x -= 2.6 * d;
          gait = 2.6;
          if (boss.x < DRIVE.x1 - 2) { boss.state = 'fight'; boss.act = 'roar'; boss.actT = 0; }
        } else {
          boss.actT += d;
          if (boss.act === 'walk') {
            boss.yaw = turnToward(boss.yaw, face, 1.4 * d);
            if (dist > 2.8) { boss.x += Math.cos(boss.yaw) * 2.2 * d; boss.z -= Math.sin(boss.yaw) * 2.2 * d; gait = 2.2; }
            boss.cool -= d;
            boss.bite = Math.max(0, boss.bite - d);
            if (dist < 3.4 && boss.bite <= 0) {
              // 콱 묾 — 차가 튕겨 나감
              boss.bite = 1.3;
              boss.jawT = 0.35;
              fx.sparks.burst(trail.at.set(s.x, 0.6, s.z), 8, 3);
              if (carOk) {
                s.hp -= 5;
                s.shake = 0.6;
                s.x = clamp(s.x + (dx / dist) * 1.2, DRIVE.x0, DRIVE.x1);
                s.z = clamp(s.z + (dz / dist) * 1.2, DRIVE.z0, DRIVE.z1);
              }
            }
            if (boss.cool <= 0 && dist > 5) { boss.act = 'roar'; boss.actT = 0; }
          } else if (boss.act === 'roar') {
            // 포효 — 고개를 쳐들고 입을 크게, 땅이 울림
            boss.yaw = turnToward(boss.yaw, face, 3 * d);
            if (!boss.roared) {
              boss.roared = true;
              if (bus) bus.shake = Math.max(bus.shake, 0.6);
              dust(boss.x, boss.z, 16, 5);
            }
            if (boss.actT > 1.1) { boss.act = 'charge'; boss.actT = 0; boss.cyaw = boss.yaw; boss.roared = false; boss.chargeHit = false; }
          } else if (boss.act === 'charge') {
            // 돌진 — 곧게 내달림, 부딪친 차는 크게 밀리고 밟힌 좀비는 쓰러짐. 벽에 닿거나 1.6초면 멈춤
            boss.yaw = boss.cyaw;
            boss.x += Math.cos(boss.cyaw) * 10 * d;
            boss.z -= Math.sin(boss.cyaw) * 10 * d;
            gait = 7;
            if (Math.random() < 0.6) dust(boss.x - Math.cos(boss.cyaw) * 1.5, boss.z + Math.sin(boss.cyaw) * 1.5, 1, 1.5);
            if (!boss.chargeHit && dist < 3 && carOk) {
              boss.chargeHit = true;
              s.hp -= 12;
              s.shake = 1;
              s.x = clamp(s.x + Math.cos(boss.cyaw) * 3, DRIVE.x0, DRIVE.x1);
              s.z = clamp(s.z - Math.sin(boss.cyaw) * 3, DRIVE.z0, DRIVE.z1);
              fx.booms.trigger(s.x, 0.5, s.z, 0.9);
            }
            zs.forEach((zz, j) => { if (alive(zz) && Math.hypot(zz.x - boss.x, zz.z - boss.z) < 2.2) hurtZombie(j, 99, boss, 12); });
            const wall = boss.x <= DRIVE.x0 + 0.5 || boss.x >= DRIVE.x1 - 0.5 || boss.z <= DRIVE.z0 + 0.1 || boss.z >= DRIVE.z1 - 0.1;
            if (boss.actT > 1.6 || wall) {
              boss.act = 'walk';
              boss.cool = 5 + Math.random() * 2;
              if (wall) { dust(boss.x, boss.z, 10, 4); if (bus) bus.shake = Math.max(bus.shake, 0.5); }
            }
          }
          boss.x = clamp(boss.x, DRIVE.x0, DRIVE.x1);
          boss.z = clamp(boss.z, DRIVE.z0, DRIVE.z1);
        }
        // 쿵쿵 — 걸음마다 발밑 먼지 · 흔들림
        boss.step += d * gait * 1.2;
        const st = Math.floor(boss.step / Math.PI);
        if (gait > 0 && st !== boss.lastStep) {
          boss.lastStep = st;
          const side = st % 2 ? 1 : -1;
          dust(boss.x + Math.sin(boss.yaw) * 0.6 * side, boss.z + Math.cos(boss.yaw) * 0.6 * side, 4, 1.5);
          if (bus) bus.shake = Math.max(bus.shake, gait > 5 ? 0.3 : 0.12);
        }
      } else if (!iced) {
        if (boss.state === 'enter') {
          boss.yaw = Math.PI;
          boss.x -= 7 * d;
          boss.y += (5 - boss.y) * Math.min(1, d * 1.5);
          if (boss.x < DRIVE.x1 - 3) { boss.state = 'fight'; boss.act = 'circle'; boss.actT = 0; boss.cool = 2.5; boss.ang = Math.atan2(boss.z - s.z, boss.x - s.x); }
        } else {
          boss.actT += d;
          if (boss.act === 'circle') {
            // 차 둘레 하늘을 돎(오르내리며)
            boss.ang += 0.5 * d;
            const vx = s.x + Math.cos(boss.ang) * 9 - boss.x;
            const vz = clamp(s.z + Math.sin(boss.ang) * 5.4, DRIVE.z0 - 2, DRIVE.z1 + 2) - boss.z;
            boss.x += vx * Math.min(1, d * 1.2);
            boss.z += vz * Math.min(1, d * 1.2);
            boss.y += (5 + Math.sin(boss.t * 1.3) * 0.6 - boss.y) * Math.min(1, d * 2);
            if (Math.hypot(vx, vz) > 0.2) boss.yaw = turnToward(boss.yaw, Math.atan2(-vz, vx), 2.5 * d);
            boss.cool -= d;
            if (boss.cool <= 0) { boss.act = Math.random() < 0.65 ? 'breath' : 'dive'; boss.actT = 0; boss.fx = s.x; boss.fz = s.z; boss.diveHit = false; }
          } else if (boss.act === 'breath') {
            // 불 뿜기 — 숨을 들이쉬고(입에 불빛) 1.6초 동안 차를 천천히 따라가며 불줄기, 땅에 불이 번짐
            boss.yaw = turnToward(boss.yaw, face, 3 * d);
            boss.y += (4.4 - boss.y) * Math.min(1, d * 2);
            if (P.mouth) P.mouth.getWorldPosition(tq.m); else tq.m.set(boss.x, boss.y, boss.z);
            if (boss.actT < 0.45) fx.glows.emit(trail.at.copy(tq.m), 0.5 + boss.actT * 1.5, 0.1, '#ffb347');
            else if (boss.actT < 2.1) {
              boss.fx += (s.x - boss.fx) * Math.min(1, d * 1.6);
              boss.fz += (s.z - boss.fz) * Math.min(1, d * 1.6);
              for (let q = 0; q < 12; q += 1) {
                const u = (q + Math.random()) / 12;
                const wob = Math.sin(boss.t * 20 + q) * 0.25 * u;
                fx.glows.emit(trail.at.set(tq.m.x + (boss.fx - tq.m.x) * u + wob, tq.m.y + (0.2 - tq.m.y) * u, tq.m.z + (boss.fz - tq.m.z) * u + wob), 0.35 + u * 1.1, 0.18, u < 0.3 ? '#fff1c0' : u < 0.7 ? '#ffb347' : '#ff5a1a');
              }
              for (let q = 0; q < 4; q += 1) {
                const a = Math.random() * Math.PI * 2;
                const rr = Math.random() * 1.8;
                fx.glows.emit(trail.at.set(boss.fx + Math.cos(a) * rr, 0.15, boss.fz + Math.sin(a) * rr), 0.9, 0.4, '#ff6a1a');
              }
              if (Math.random() < 0.5) fx.smoke.emit(trail.at.set(boss.fx, 0.4, boss.fz), trail.v.set(Math.random() - 0.5, 1.5, Math.random() - 0.5), 0.3, 1.2, ['#ff9a3c', '#3f3a36', '#9a9590']);
              if (carOk && Math.hypot(s.x - boss.fx, s.z - boss.fz) < 2.2) { s.hp -= 7 * d; s.shake = Math.max(s.shake, 0.25); }
            }
            if (boss.actT > 2.4) { boss.act = 'circle'; boss.cool = 3 + Math.random() * 2; boss.ang = Math.atan2(boss.z - s.z, boss.x - s.x); }
          } else if (boss.act === 'dive') {
            // 내리꽂힘 — 날개를 접고 차 자리로 빠르게 → 지나쳐 다시 솟음
            const down = boss.actT < 1.0;
            if (down) {
              boss.fx += (s.x - boss.fx) * Math.min(1, d * 2);
              boss.fz += (s.z - boss.fz) * Math.min(1, d * 2);
              const vx = boss.fx - boss.x;
              const vz = boss.fz - boss.z;
              const dl = Math.hypot(vx, vz) || 1;
              boss.x += (vx / dl) * Math.min(dl, 13 * d);
              boss.z += (vz / dl) * Math.min(dl, 13 * d);
              boss.yaw = turnToward(boss.yaw, Math.atan2(-vz, vx), 4 * d);
            } else {
              boss.x += Math.cos(boss.yaw) * 9 * d;
              boss.z -= Math.sin(boss.yaw) * 9 * d;
            }
            boss.y += ((down ? 1.4 : 5.5) - boss.y) * Math.min(1, d * 3);
            if (boss.y < 3 && Math.random() < 0.6) dust(boss.x, boss.z, 1, 3);
            if (!boss.diveHit && carOk && dist < 2.4 && boss.y < 2.6) { boss.diveHit = true; s.hp -= 8; s.shake = 0.9; fx.booms.trigger(s.x, 0.6, s.z, 0.9); }
            if (boss.actT > 2.2) { boss.act = 'circle'; boss.cool = 3 + Math.random() * 2; boss.ang = Math.atan2(boss.z - s.z, boss.x - s.x); }
          }
          boss.x = clamp(boss.x, DRIVE.x0 - 2, DRIVE.x1 + 3);
          boss.z = clamp(boss.z, DRIVE.z0 - 3, DRIVE.z1 + 2);
        }
      }
      // 대시로 들이받음 — 크게 아프고 차는 튕겨 나옴
      boss.dashCool = Math.max(0, boss.dashCool - d);
      if (live && s.dash > 0 && boss.dashCool <= 0 && dist < 2.8 && (rex || boss.y < 3.5)) {
        boss.dashCool = 0.6;
        hurtBoss(15);
        fx.booms.trigger(boss.x + (dx / dist) * 1.2, 1.0, boss.z + (dz / dist) * 1.2, 1.2);
        s.dash = 0;
        s.v = -7;
      }
      // 그리기 — 번쩍임(얼면 푸른빛) · 걸음 · 꼬리 · 턱 · 날개 · 쓰러짐
      FLASH[boss.kind].forEach((m) => {
        m.emissive.set(iced ? '#5fbfff' : '#ffffff');
        m.emissiveIntensity = iced ? 0.55 : boss.flash * 0.9;
      });
      if (P.root) {
        P.root.visible = boss.on;
        P.root.scale.setScalar(BOSS_SCALE[boss.kind]);
        const fall = live ? 0 : Math.min(1, boss.t / 1.2);
        const sink = live ? 0 : Math.max(0, boss.t - 2) * 1.4;
        if (rex) {
          const sw = gait > 0 ? Math.sin(boss.step) : 0;
          const roar = boss.state === 'fight' && boss.act === 'roar';
          boss.jawT = Math.max(0, boss.jawT - d);
          P.root.position.set(boss.x, -sink, boss.z);
          P.root.rotation.set(-fall * 1.35, boss.yaw, 0, 'YXZ');
          if (P.legL) P.legL.rotation.z = sw * 0.5;
          if (P.legR) P.legR.rotation.z = -sw * 0.5;
          if (P.body) {
            P.body.position.y = Math.abs(sw) * 0.08;
            P.body.rotation.z += ((roar ? 0.18 : boss.act === 'charge' ? -0.12 : 0) - P.body.rotation.z) * Math.min(1, d * 5);
          }
          if (P.head) P.head.rotation.z = roar ? 0.45 + Math.sin(boss.t * 40) * 0.04 : Math.sin(boss.t * 1.8) * 0.06 - (boss.jawT > 0 ? 0.15 : 0);
          if (P.jaw) P.jaw.rotation.z = -(roar || !live ? 0.75 : boss.jawT > 0 ? 0.65 : 0.08 + Math.sin(boss.t * 2.5) * 0.04);
          if (P.tail1) P.tail1.rotation.y = Math.sin(boss.t * 2.2 + boss.step * 0.5) * 0.25;
          if (P.tail2) P.tail2.rotation.y = Math.sin(boss.t * 2.2 + 1) * 0.35;
          if (P.armL) P.armL.rotation.z = Math.sin(boss.t * 3) * 0.2;
          if (P.armR) P.armR.rotation.z = Math.sin(boss.t * 3 + 1.5) * 0.2;
        } else {
          const diving = boss.act === 'dive' && boss.actT < 1.0;
          const breath = boss.state === 'fight' && boss.act === 'breath';
          boss.flapP = (boss.flapP ?? 0) + d * (iced ? 0 : diving ? 3 : breath ? 8 : 6);
          const flap = live ? Math.sin(boss.flapP) * (diving ? 0.25 : 0.7) : 0.9;
          P.root.position.set(boss.x, boss.y + (live ? Math.sin(boss.t * 3) * 0.15 : 0) - sink, boss.z);
          P.root.rotation.set(fall * 0.9, boss.yaw, 0, 'YXZ');
          if (P.wingL) P.wingL.rotation.set(flap, diving ? -0.6 : 0, 0);
          if (P.wingR) P.wingR.rotation.set(-flap, diving ? 0.6 : 0, 0);
          if (P.body) P.body.rotation.z += ((diving ? -0.45 : boss.act === 'dive' ? 0.35 : 0) - P.body.rotation.z) * Math.min(1, d * 4);
          if (P.neck) P.neck.rotation.z = breath ? -0.35 : Math.sin(boss.t * 1.5) * 0.08;
          if (P.head) P.head.rotation.z = breath ? -0.25 : 0;
          if (P.jaw) P.jaw.rotation.z = (breath && boss.actT > 0.35) || !live ? -0.55 : -0.05;
          if (P.tail1) P.tail1.rotation.y = Math.sin(boss.t * 2.4) * 0.3;
          if (P.tail2) P.tail2.rotation.y = Math.sin(boss.t * 2.4 + 1) * 0.4;
        }
      }
    } else {
      if (rexParts.root) rexParts.root.visible = false;
      if (wyrmParts.root) wyrmParts.root.visible = false;
    }

    // 웨이브 감독 — 내려앉으면 START_WAVE웨이브. 정해진 수를 간격마다 꺼내고, 다 나오고 다 쓰러지면 CLEAR → 다음
    if (s.landed && gm.phase === 'idle') startWave(START_WAVE);
    gm.t += d;
    gm.bannerT += d;
    const active = zs.filter(alive).length;
    if (gm.phase === 'intro' && gm.t > 2.2) { gm.phase = 'fight'; gm.t = 0; if (gm.boss) spawnBoss(gm.boss); }
    if (gm.phase === 'fight') {
      gm.spawnT -= d;
      if (gm.toSpawn > 0 && gm.spawnT <= 0) {
        const slot = zs.find((zz) => zz.state === 'off');
        if (slot) { spawnZombie(slot, gm.wave); gm.toSpawn -= 1; gm.spawnT = waveGap(gm.wave); }
      }
      if (gm.toSpawn === 0 && active === 0 && !boss.on) {
        gm.phase = 'clear';
        gm.t = 0;
        s.hp = Math.min(CAR_HP, s.hp + 15);
        if (gm.wave < WAVES) banner(`WAVE ${gm.wave} CLEAR`);
      }
    }
    if (gm.phase === 'clear' && gm.t > 2.6) {
      if (gm.wave >= WAVES) { gm.phase = 'win'; gm.endT = 0.3; } // 다 깨면 조용히 끝
      else startWave(gm.wave + 1);
    }
    // 차가 터지면 — 폭발 한 번, 잠시 뒤 저절로 끝나 평소 화면으로(글자 없이)
    if (gm.phase !== 'over' && gm.phase !== 'idle' && gm.phase !== 'win' && s.hp <= 0) {
      gm.phase = 'over';
      gm.endT = 1.1;
      s.hp = 0;
      s.v = 0;
      fx.booms.trigger(s.x, 0.5, s.z, 2.2);
      fx.sparks.burst(trail.at.set(s.x, 0.6, s.z), 40, 8);
      if (bus) { bus.flash = 0.8; bus.flashColor = '255, 120, 90'; bus.shake = 1.4; }
      if (car.current) car.current.visible = false;
    }
    if ((gm.phase === 'over' || gm.phase === 'win') && !gm.ended) {
      gm.endT -= d0;
      if (gm.endT <= 0) { gm.ended = true; onClear(); }
    }

    // A 대시 잔상 — 남긴 자세에 붉은 차체 빛이 옅어지며 사라짐
    const gl0 = s.ghostList;
    ghosts.current.forEach((g, i) => {
      if (!g) return;
      const gh = gl0?.[i];
      if (gh) gh.age += d;
      g.visible = !!gh && gh.age < 0.3;
      if (!g.visible) return;
      g.position.set(gh.x, 0, gh.z);
      g.rotation.y = gh.yaw;
      g.children.forEach((m) => { m.material.opacity = 0.45 * (1 - gh.age / 0.3); });
    });
    // D 눈보라 — 냉기 고리가 퍼지며 닿는 좀비를 얼리고 고드름을 세움, 둘레엔 눈이 휘몰아치다 잦아듦
    if (bz.t < BLZ_LIFE) {
      bz.t += d;
      const u = Math.min(1, bz.t / BLZ_SPREAD);
      const r = BLZ_R * (1 - (1 - u) ** 2);
      if (u < 1) {
        for (let q = 0; q < 14; q += 1) {
          const a = Math.random() * Math.PI * 2;
          fx.glows.emit(trail.at.set(bz.x + Math.cos(a) * r, 0.15 + Math.random() * 0.4, bz.z + Math.sin(a) * r), 0.45, 0.25, '#e6f7ff');
        }
        for (let q = 0; q < 4; q += 1) {
          const a = Math.random() * Math.PI * 2;
          fx.smoke.emit(trail.at.set(bz.x + Math.cos(a) * r, 0.2, bz.z + Math.sin(a) * r), trail.v.set(Math.cos(a) * 3, 0.6, Math.sin(a) * 3), 0.14, 0.9, ['#ffffff', '#e6f3ff', '#f7fbff']);
        }
        // 고드름 — 고리 앞머리를 따라 바깥으로 기울어 솟음
        bz.spikeT -= d;
        while (bz.spikeT <= 0) {
          bz.spikeT += (BLZ_SPREAD / SPIKES) * 0.9;
          const sp = spk.reduce((a, q) => (q.age > a.age ? q : a), spk[0]);
          const a = Math.random() * Math.PI * 2;
          const rr = Math.max(0.8, r * (0.85 + Math.random() * 0.15));
          Object.assign(sp, { age: 0, x: clamp(bz.x + Math.cos(a) * rr, DRIVE.x0, DRIVE.x1), z: clamp(bz.z + Math.sin(a) * rr, DRIVE.z0 - 0.5, DRIVE.z1 + 0.5), h: 0.6 + Math.random() * 0.9, a, tilt: 0.2 + Math.random() * 0.35 });
        }
        zs.forEach((zz, i) => {
          if (alive(zz) && !bz.hit.has(i) && Math.hypot(zz.x - bz.x, zz.z - bz.z) < r) { bz.hit.add(i); freeze(i); }
        });
        if (!bz.hitBoss && bossAt(bz.x, 0, bz.z, r - 2.3)) { bz.hitBoss = true; boss.frozen = 2.5; hurtBoss(5); } // 보스는 짧게 얼음
      }
      // 휘몰아치는 눈 — 둘레를 돌며(시간이 지나며 잦아듦)
      const n = Math.round(7 * (1 - bz.t / BLZ_LIFE));
      for (let q = 0; q < n; q += 1) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * BLZ_R;
        fx.smoke.emit(trail.at.set(bz.x + Math.cos(a) * rr, 0.3 + Math.random() * 2.5, bz.z + Math.sin(a) * rr), trail.v.set(-Math.sin(a) * 7 - Math.cos(a), 0, Math.cos(a) * 7 - Math.sin(a)), 0.06, 0.8, ['#ffffff', '#eaf6ff', '#ffffff']);
      }
    }
    if (frost.current) {
      const u = Math.min(1, bz.t / BLZ_SPREAD);
      frost.current.visible = bz.t < BLZ_LIFE;
      frost.current.position.set(bz.x, 0.04, bz.z);
      frost.current.scale.setScalar(Math.max(0.01, BLZ_R * 1.05 * (1 - (1 - u) ** 2)));
      frostMat.opacity = 0.85 * Math.min(1, (BLZ_LIFE - bz.t) / 1.2);
    }
    spk.forEach((q, i) => {
      const g = spikes.current[i];
      q.age += d;
      if (!g) return;
      const life = 2.6;
      g.visible = q.age < life;
      if (!g.visible) return;
      const grow = Math.min(1, q.age / 0.12) * Math.min(1, (life - q.age) / 0.4); // 쑥 솟았다 땅으로 들어감
      g.position.set(q.x, 0, q.z);
      g.rotation.set(Math.sin(q.a) * q.tilt, q.a, -Math.cos(q.a) * q.tilt);
      g.scale.set(1, Math.max(0.01, q.h * grow), 1);
    });
    // Z 화염방사 — 누르는 동안 노즐에서 거대한 불길(넓게 퍼지며 FLAME_R까지, 누른 직후엔 짧게 → 금방 다 뻗음).
    // 노즐 앞 희고 푸른 고압 심 · 불덩이 · 불티 · 끝의 검은 연기, 땅에 떨어진 불, 주황 불빛 일렁임 · 땅 울림
    const flameL = lights.flame?.current;
    if (k.flame && s.landed && gm.phase !== 'over') {
      s.flameT = (s.flameT ?? 0) + d;
      const ramp = Math.min(1, s.flameT / 0.25);
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const nx = s.x + c * 0.85;
      const nz = s.z - sn * 0.85;
      const ny = 0.45;
      for (let q = 0; q < 14; q += 1) {
        const a = s.yaw + (Math.random() - 0.5) * 0.38;
        const sp = (28 + Math.random() * 14) * (0.55 + ramp * 0.45);
        fx.fire.emit(trail.at.set(nx, ny, nz), trail.v.set(Math.cos(a) * sp + s.v * c, (Math.random() - 0.25) * 2.4, -Math.sin(a) * sp - s.v * sn), 0.18 + Math.random() * 0.2, 0.6 + Math.random() * 0.25);
      }
      for (let q = 0; q < 6; q += 1) {
        const u = (q / 6) * 2.4;
        fx.glows.emit(trail.at.set(nx + c * u, ny, nz - sn * u), 0.5 - q * 0.04, 0.05, q < 2 ? '#e8f4ff' : '#9fd0ff');
      }
      fx.glows.emit(trail.at.set(nx, ny, nz), 1.2, 0.06, '#fff1c0');
      if (Math.random() < 0.8) {
        const u = Math.random() * FLAME_R * ramp;
        fx.sparks.burst(trail.at.set(nx + c * u, 0.6, nz - sn * u), 2, 5, '#ffcf7a');
      }
      if (Math.random() < 0.6) {
        const u = (0.55 + Math.random() * 0.45) * FLAME_R * ramp;
        const lat = (Math.random() - 0.5) * u * 0.3;
        fx.smoke.emit(trail.at.set(nx + c * u + sn * lat, 1.2 + Math.random(), nz - sn * u + c * lat), trail.v.set(c * 2.5, 2 + Math.random(), -sn * 2.5), 0.45, 1.8, ['#4a3a2e', '#262321', '#7a7570']);
      }
      // 땅에 떨어진 불 — 불길 안 아무 데나
      s.patchT = (s.patchT ?? 0) - d;
      if (s.patchT <= 0) {
        s.patchT = 0.06;
        const u = (0.35 + Math.random() * 0.65) * FLAME_R * ramp;
        const lat = (Math.random() - 0.5) * (1 + u * 0.3);
        const pt = fp.reduce((a, q) => (q.age > a.age ? q : a), fp[0]);
        Object.assign(pt, { age: 0, x: nx + c * u + sn * lat, z: nz - sn * u + c * lat, s: 0.8 + Math.random() * 0.6 });
      }
      const inFlame = (x, z, pad) => {
        const ex = x - nx;
        const ez = z - nz;
        const along = ex * c - ez * sn;
        return along > 0 && along < FLAME_R * ramp + pad && Math.abs(ex * sn + ez * c) < 0.9 + along * 0.22 + pad;
      };
      zs.forEach((zz, i) => { if (alive(zz) && inFlame(zz.x, zz.z, 0)) burn(i, FLAME_DPS * d); });
      if (bossAlive() && inFlame(boss.x, boss.z, 1.5)) { hurtBoss(FLAME_DPS * d * 0.8, true); boss.flash = Math.max(boss.flash, 0.3); }
      if (flameL) { flameL.position.set(nx + c * 6, 1.6, nz - sn * 6); flameL.intensity = 9 + Math.random() * 5; }
      if (bus) bus.shake = Math.max(bus.shake, 0.06);
    } else {
      s.flameT = 0;
      if (flameL) flameL.intensity = 0;
    }
    // 땅에 떨어진 불 — 잦아들며 타오름, 밟은 좀비는 불붙음
    fp.forEach((pt) => {
      if (pt.age > PATCH_LIFE) return;
      pt.age += d;
      const k2 = 1 - pt.age / PATCH_LIFE;
      if (Math.random() < d * 16 * k2) fx.fire.emit(trail.at.set(pt.x + (Math.random() - 0.5) * pt.s, 0.15, pt.z + (Math.random() - 0.5) * pt.s), trail.v.set((Math.random() - 0.5) * 0.4, 1.4 + Math.random(), (Math.random() - 0.5) * 0.4), 0.14 * pt.s, 0.5);
      if (Math.random() < d * 8) fx.glows.emit(trail.at.set(pt.x, 0.05, pt.z), 1.4 * pt.s * k2, 0.25, '#ff4a12');
      zs.forEach((zz, i) => { if (alive(zz) && Math.hypot(zz.x - pt.x, zz.z - pt.z) < 0.8 * pt.s) burn(i, 3 * d); });
    });
    // X 지진 — 갈라짐이 뻗으며 QUAKE_GAP마다 바위 기둥이 솟음(통로 밖에선 멈춤)
    for (let n = qk.length - 1; n >= 0; n -= 1) {
      const ln = qk[n];
      ln.t += d;
      const reach = QUAKE_LEN * Math.min(1, ln.t / QUAKE_T);
      while ((ln.next + 1) * QUAKE_GAP <= reach) {
        ln.next += 1;
        const dd = ln.next * QUAKE_GAP;
        const x = ln.x + Math.cos(ln.yaw) * dd;
        const z = ln.z - Math.sin(ln.yaw) * dd;
        if (x > DRIVE.x0 && x < DRIVE.x1 && z > DRIVE.z0 - 0.5 && z < DRIVE.z1 + 0.5) erupt(x, z);
      }
      if (ln.t >= QUAKE_T) qk.splice(n, 1);
    }
    rocks.forEach((q, i) => {
      const g = rockRefs.current[i];
      q.age += d;
      if (!g) return;
      const life = 1.9;
      g.visible = q.age < life;
      if (!g.visible) return;
      const up = q.age < 0.08 ? q.age / 0.08 * 1.15 : q.age < 0.16 ? 1.15 - ((q.age - 0.08) / 0.08) * 0.15 : 1; // 쑥 솟았다 살짝 내려앉음
      const sink = q.age > 1.4 ? (q.age - 1.4) / 0.5 : 0;
      g.position.set(q.x, -sink * q.h, q.z);
      g.rotation.set(q.tx, q.rot, q.tz);
      g.scale.set(1, Math.max(0.01, q.h * up), 1);
    });
    // C 드론 — 저마다 다른 상대(가까운 순, 겹치지 않게 — 모자라면 나눠 맡음)를 맡아 그 하늘로 날아가 둘레를 돌며 아래로 연사.
    // 상대가 없으면 차 앞 하늘에서 대기, 시간이 다 되면 하늘로 날아가 사라짐
    dr.t = Math.max(0, dr.t - d);
    dr.pickT -= d;
    if (dr.t > 0 && dr.pickT <= 0) {
      dr.pickT = 0.3;
      const list = targetsByDistance(s.x, s.z);
      const key = (t) => `${t.kind}${t.i ?? ''}`;
      const taken = new Set(dr.list.filter((q) => targetAlive(q.tgt)).map((q) => key(q.tgt)));
      dr.list.forEach((q, n) => {
        if (targetAlive(q.tgt)) return;
        const free = list.find((t) => !taken.has(key(t)));
        q.tgt = free ?? (list.length ? list[n % list.length] : null);
        if (free) taken.add(key(free));
      });
    }
    droneLedRed.emissiveIntensity = Math.sin(s.age * 9) > 0 ? 2.4 : 0.3;
    dr.list.forEach((q, n) => {
      const g = droneRefs.current[n];
      const on = dr.t > 0;
      const px = q.x;
      const pz = q.z;
      q.tp = null;
      if (on) {
        const tp = targetPos(q.tgt);
        q.tp = tp;
        const a = s.age * 1.6 + (n * Math.PI * 2) / DRONES;
        const hx = tp ? tp.x + Math.cos(a) * 1.4 : s.x + Math.cos(s.yaw) * 3 + Math.cos(a) * 2.2;
        const hz = tp ? tp.z + Math.sin(a) * 1.4 : s.z - Math.sin(s.yaw) * 3 + Math.sin(a) * 2.2;
        const hy = (tp && q.tgt.kind === 'boss' ? bossY() + 2.6 : 3.6) + Math.sin(s.age * 2.6 + n) * 0.2;
        const ex = hx - q.x;
        const ez = hz - q.z;
        const el = Math.hypot(ex, ez);
        const sp = Math.min(18, el * 3.2);
        if (el > 1e-3) { q.x += (ex / el) * sp * d; q.z += (ez / el) * sp * d; }
        q.y += (hy - q.y) * Math.min(1, d * 3);
        if (tp) {
          q.yaw = turnToward(q.yaw, Math.atan2(-(tp.z - q.z), tp.x - q.x), 8 * d);
          q.fireT -= d;
          if (q.fireT <= 0 && Math.hypot(tp.x - q.x, tp.z - q.z) < DRONE_RANGE) {
            q.fireT = DRONE_FIRE;
            q.side = -q.side;
            const b = bul.find((o) => !o.on);
            if (b) {
              const ox = q.x + Math.sin(q.yaw) * 0.05 * q.side;
              const oy = q.y - 0.18;
              const oz = q.z + Math.cos(q.yaw) * 0.05 * q.side;
              const tx = tp.x + (Math.random() - 0.5) * 0.4;
              const ty = (tp.y ?? 0.9) + (Math.random() - 0.5) * 0.4;
              const tz = tp.z + (Math.random() - 0.5) * 0.4;
              const dl = Math.hypot(tx - ox, ty - oy, tz - oz) || 1;
              Object.assign(b, { on: true, age: 0, x: ox, y: oy, z: oz, vx: ((tx - ox) / dl) * 45, vy: ((ty - oy) / dl) * 45, vz: ((tz - oz) / dl) * 45 });
              fx.glows.emit(trail.at.set(ox, oy, oz), 0.55, 0.05, '#dffaff'); // 총구 불빛
              q.recoil = 1;
            }
          }
        }
      } else if (q.y > -5) {
        q.y += d * 8;
        if (q.y > 14) q.y = -9;
      }
      // 기울기 — 가는 쪽으로 숙이고 옆으로 기욺
      const vx = (q.x - px) / Math.max(d, 1e-4);
      const vz = (q.z - pz) / Math.max(d, 1e-4);
      const fw = vx * Math.cos(q.yaw) - vz * Math.sin(q.yaw);
      const sd = vx * Math.sin(q.yaw) + vz * Math.cos(q.yaw);
      q.pitch += (clamp(-fw * 0.03, -0.45, 0.45) - q.pitch) * Math.min(1, d * 6);
      q.roll += (clamp(sd * 0.03, -0.45, 0.45) - q.roll) * Math.min(1, d * 6);
      q.recoil = Math.max(0, q.recoil - d * 12);
      if (g) {
        g.visible = q.y > -5;
        g.position.set(q.x, q.y, q.z);
        g.rotation.set(q.roll, q.yaw, q.pitch, 'YXZ');
      }
      // 기관포 — 상대 쪽으로 숙임 · 반동
      const tr = turretRefs.current[n];
      if (tr) {
        tr.rotation.z = q.tp ? -Math.atan2(q.y - (q.tp.y ?? 0.9), Math.max(0.3, Math.hypot(q.tp.x - q.x, q.tp.z - q.z))) - q.pitch : -0.3;
        tr.position.x = 0.05 - q.recoil * 0.03;
      }
      // 탐조등(드론 → 상대) · 땅의 조준 표시
      const sr = searchRefs.current[n];
      const mk = markRefs.current[n];
      const lit = on && !!q.tp && q.y > 0.5;
      if (sr) {
        sr.visible = lit;
        if (lit) {
          tq.d3.set(q.x - q.tp.x, q.y - 0.12, q.z - q.tp.z);
          const len = tq.d3.length() || 1;
          sr.position.set(q.x, q.y - 0.12, q.z);
          sr.quaternion.setFromUnitVectors(tq.up, tq.d3.multiplyScalar(1 / len));
          sr.scale.set(1, len, 1);
        }
      }
      if (mk) {
        mk.visible = lit;
        if (lit) { mk.position.set(q.tp.x, 0.07 + n * 0.002, q.tp.z); mk.rotation.z = s.age * 3 + n; }
      }
    });
    rotorRefs.current.forEach((r, i) => { if (r) r.rotation.y = s.age * 60 + i; });
    // 예광탄 — 빛 줄(뒤로 길게) · 맞으면 불티, 빗나가면 땅에 흙먼지
    bul.forEach((b) => {
      if (!b.on) return;
      b.age += d;
      b.x += b.vx * d;
      b.y += b.vy * d;
      b.z += b.vz * d;
      for (let j = 0; j < 3; j += 1) fx.glows.emit(trail.at.set(b.x - b.vx * 0.008 * j, b.y - b.vy * 0.008 * j, b.z - b.vz * 0.008 * j), 0.26 - j * 0.06, 0.05, '#5fe8ff');
      fx.glows.emit(trail.at.set(b.x, b.y, b.z), 0.12, 0.04, '#ffffff');
      const zi = zombieAt(b.x, b.z, 0.5);
      if (zi >= 0 && b.y < 1.9 * zs[zi].scale) {
        b.on = false;
        fx.glows.emit(trail.at.set(b.x, b.y, b.z), 0.6, 0.1, '#bff6ff');
        hurtZombie(zi, 1, { x: b.x - b.vx * 0.05, z: b.z - b.vz * 0.05 }, 2.5);
      } else if (bossAt(b.x, b.y, b.z) && Math.abs(b.y - bossY()) < 2.2) {
        b.on = false;
        fx.sparks.burst(trail.at.set(b.x, b.y, b.z), 3, 2.5, '#bff6ff');
        hurtBoss(1, true);
        boss.flash = Math.max(boss.flash, 0.4);
      } else if (b.y < 0.05 || b.age > 0.6) {
        b.on = false;
        fx.sparks.burst(trail.at.set(b.x, Math.max(0.05, b.y), b.z), 3, 2.2, '#dffaff');
        fx.smoke.emit(trail.at.set(b.x, 0.1, b.z), trail.v.set(0, 0.8, 0), 0.08, 0.5, ['#c9b79c', '#9a8f80', '#dcd8d2']);
      }
    });

    // HUD — 글자 · 막대를 직접 고침(+ 화면 번쩍임)
    const H = hud;
    if (bus) bus.flash = Math.max(0, (bus.flash ?? 0) - d0 * 2.2);
    if (H?.dim && bus) H.dim.style.opacity = String(bus.dim ?? 0);
    if (bus) bus.frost = Math.max(0, (bus.frost ?? 0) - d0 * 0.3);
    if (H?.frost && bus) H.frost.style.opacity = String(Math.min(1, (bus.frost ?? 0) * 1.4));
    if (H?.flash && bus) {
      H.flash.style.opacity = String(bus.flash);
      H.flash.style.background = `radial-gradient(ellipse at center, rgba(${bus.flashColor ?? '255,255,255'}, .95) 0%, rgba(${bus.flashColor ?? '255,255,255'}, .55) 45%, rgba(${bus.flashColor ?? '255,255,255'}, 0) 100%)`;
    }
    if (H) {
      const set = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
      set(H.wave, `WAVE ${Math.max(1, gm.wave)} / ${WAVES}`);
      set(H.left, `남은 좀비 ${gm.toSpawn + active}`);
      set(H.kills, `처치 ${gm.kills}`);
      if (H.boss) {
        H.boss.style.opacity = boss.on ? '1' : '0';
        set(H.bossName, boss.kind === 'rex' ? '티라노' : '드래곤');
        if (H.bossHp) H.bossHp.style.width = `${Math.max(0, boss.hp / boss.max) * 100}%`;
      }
      if (H.hp) {
        const pct = Math.max(0, s.hp / CAR_HP);
        H.hp.style.width = `${pct * 100}%`;
        H.hp.style.background = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#fbbf24' : '#f87171';
      }
      const cools = [s.cool, s.hCool ?? 0, 0, nk.cool, s.cCool, 0, 0, 0, 0, 0]; // Q W E R A S D Z X C 순
      H.sk.forEach((el, i) => {
        if (!el) return;
        const cd = Math.max(0, cools[i]);
        el.classList.toggle('is-cool', cd > 0.15);
        set(el.lastChild, cd > 0.15 ? `${Math.ceil(cd)}` : '');
      });
      if (H.banner) {
        const bt = gm.bannerT;
        set(H.banner, gm.banner);
        H.banner.style.opacity = bt < 2.2 ? String(Math.min(1, bt * 4) * Math.min(1, (2.2 - bt) * 2)) : '0';
      }
    }

    // 바닥 체액 얼룩 — 5초 동안 남았다 옅어짐
    goo.forEach((g, k) => {
      const m = gooRefs.current[k];
      g.age += d;
      if (m) m.visible = g.age < 6;
      g.mat.opacity = g.age < 0.15 ? 0.85 * (g.age / 0.15) : Math.max(0, 0.85 * (1 - (g.age - 5) / 1));
    });
    fx.smoke.update(d, state.camera.quaternion);
    fx.sparks.update(d, state.camera.quaternion);
    fx.glows.update(d, state.camera.quaternion);
    fx.booms.update(d);
    fx.debris.update(d);
    fx.iceShards.update(d);
    fx.fire.update(d, state.camera.quaternion);
  });

  // 앞(+X)이 앞쪽. 차체 · 지붕(유리) · 뒤 날개 · 안테나 · 노란 줄 · 바퀴 넷(앞은 꺾임)
  const wx = 0.4;
  const wz = 0.36;
  return (
    <group ref={root} visible={!paused}>
      <group ref={car}>
        <group ref={tilt} position={[0, WHEEL_R, 0]}>
          <Box p={[0, 0.12, 0]} s={[1.2, 0.18, 0.62]} m={bodyMat} />
          <Box p={[0.5, 0.08, 0]} s={[0.24, 0.1, 0.58]} m={bodyMat} />
          <Box p={[-0.05, 0.29, 0]} s={[0.5, 0.17, 0.5]} m={glassMat} />
          <Box p={[-0.05, 0.385, 0]} s={[0.46, 0.03, 0.46]} m={bodyMat} />
          <Box p={[0, 0.215, 0]} s={[1.21, 0.03, 0.12]} m={rimMat} cast={false} />
          <Box p={[-0.56, 0.36, 0]} s={[0.14, 0.03, 0.66]} m={MAT.dark} />
          {[0.26, -0.26].map((z) => <Box key={z} p={[-0.54, 0.27, z]} s={[0.04, 0.16, 0.04]} m={MAT.dark} />)}
          <Cyl p={[-0.35, 0.55, -0.22]} r={0.008} h={0.55} m={MAT.dark} />
          <mesh position={[-0.35, 0.83, -0.22]} material={bodyMat}><sphereGeometry args={[0.025, 8, 6]} /></mesh>
          {/* 앞 범퍼 화염 노즐 */}
          <Box p={[0.64, 0.2, 0]} s={[0.12, 0.08, 0.1]} m={MAT.dark} cast={false} />
          {/* 지붕 2연장 미사일 발사관(받침 + 관 둘, 입구는 어둡게) */}
          <Box p={[0.02, 0.42, 0]} s={[0.36, 0.05, 0.3]} m={podMat} />
          {[0.13, -0.13].map((z) => (
            <group key={z} position={[0.1, 0.47, z]}>
              <mesh material={podMat} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.075, 0.075, 0.5, 14]} /></mesh>
              <mesh material={MAT.dark} position={[0.251, 0, 0]} rotation={[0, 0, Math.PI / 2]}><circleGeometry args={[0.06, 14]} /></mesh>
            </group>
          ))}
          {[[wx, wz, steerL], [wx, -wz, steerR], [-wx, wz, null], [-wx, -wz, null]].map(([x, z, sr], i) => (
            <group key={`${x}${z}`} position={[x, 0, z]} ref={sr ?? undefined}>
              <Wheel spinRef={(el) => { wheels.current[i] = el; }} />
            </group>
          ))}
        </group>
      </group>
      {/* 미사일(미리 만들어 둔 자리) · 연기 · 불티 · 폭발 */}
      {ms.map((m, i) => (
        <group key={`m${i}`} ref={(el) => { missiles.current[i] = el; }} visible={false}>
          <Missile flameRef={(el) => { flames.current[i] = el; }} />
        </group>
      ))}
      {hs.map((h, i) => (
        <group key={`h${i}`} ref={(el) => { hMissiles.current[i] = el; }} visible={false}>
          <Missile homing flameRef={(el) => { hFlames.current[i] = el; }} />
        </group>
      ))}
      {/* 조준 고리(유도 미사일 목표 발밑) — 바깥 고리 + 네 갈래 눈금 */}
      {Array.from({ length: HOMINGS }, (_, i) => (
        <group key={`lk${i}`} ref={(el) => { locks.current[i] = el; }} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh material={lockMat}><ringGeometry args={[0.62, 0.7, 40]} /></mesh>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} material={lockMat} position={[Math.cos((k * Math.PI) / 2) * 0.5, Math.sin((k * Math.PI) / 2) * 0.5, 0]} rotation={[0, 0, (k * Math.PI) / 2]}>
              <planeGeometry args={[0.22, 0.05]} />
            </mesh>
          ))}
        </group>
      ))}
      <primitive object={fx.glows.mesh} />
      <primitive object={fx.debris.mesh} />
      {/* E 블랙홀 — 검은 핵 · 테두리 빛 · 어둠 · 보라 빛무리 · 기울어진 강착원반 + 양극 제트 · 카메라를 보는 빛 고리 · 바닥 소용돌이 · 폭발 고리 셋 */}
      {Array.from({ length: BH_POOL }, (_, i) => (
        <group key={`bh${i}`}>
          <group ref={(el) => { holes.current[i].g = el; }} visible={false}>
            <mesh material={holeMat}><sphereGeometry args={[0.55, 32, 20]} /></mesh>
            <mesh material={holeRimMat}><sphereGeometry args={[0.64, 32, 20]} /></mesh>
            <sprite material={voidMat} scale={[3.4, 3.4, 1]} renderOrder={-1} />
            <sprite material={holeGlowMat} scale={[3.6, 3.6, 1]} />
            <group rotation={[-Math.PI / 2 + 0.32, 0, 0.14]}>
              <mesh material={diskMat}><circleGeometry args={[2.6, 96]} /></mesh>
              <group ref={(el) => { holes.current[i].jets = el; }} rotation={[Math.PI / 2, 0, 0]}>
                <mesh material={jetUpMat} position={[0, JET_L / 2 + 0.5, 0]}><cylinderGeometry args={[0.42, 0.05, JET_L, 20, 1, true]} /></mesh>
                <mesh material={jetDownMat} position={[0, -(JET_L / 2 + 0.5), 0]}><cylinderGeometry args={[0.05, 0.42, JET_L, 20, 1, true]} /></mesh>
              </group>
            </group>
            <group ref={(el) => { holes.current[i].face = el; }}>
              <mesh material={haloMat} scale={[0.62, 0.62, 1]}><circleGeometry args={[2.6, 96]} /></mesh>
            </group>
          </group>
          <mesh ref={(el) => { holes.current[i].swirl = el; }} material={swirlMat} rotation={[-Math.PI / 2, 0, 0]} visible={false}><circleGeometry args={[1, 96]} /></mesh>
          <mesh ref={(el) => { holes.current[i].wave = el; }} material={holeWaveMats[i].a} rotation={[-Math.PI / 2, 0, 0]} visible={false}><ringGeometry args={[0.86, 1, 96]} /></mesh>
          <mesh ref={(el) => { holes.current[i].wave2 = el; }} material={holeWaveMats[i].b} rotation={[-Math.PI / 2, 0, 0]} visible={false}><ringGeometry args={[0.95, 1, 96]} /></mesh>
          <mesh ref={(el) => { holes.current[i].shell = el; }} material={holeWaveMats[i].c} visible={false}><ringGeometry args={[0.9, 1, 96]} /></mesh>
        </group>
      ))}
      {/* S 유성 — 달아오른 바위(돌며) · 꼬리 불길(원뿔, 온 쪽으로) · 빛 · 떨어질 자리 경고 원 */}
      {Array.from({ length: METEORS }, (_, i) => (
        <group key={`mt${i}`}>
          <group ref={(el) => { meteors.current[i] = el; }} visible={false}>
            <mesh ref={(el) => { metRocks.current[i] = el; }} material={meteorRock}><icosahedronGeometry args={[0.32, 0]} /></mesh>
            <mesh material={meteorFireMat} position={[0, 1.1, 0]}><coneGeometry args={[0.36, 2.2, 14, 1, true]} /></mesh>
            <mesh material={flameCoreMat} position={[0, 0.55, 0]}><coneGeometry args={[0.2, 1.1, 12, 1, true]} /></mesh>
            <sprite material={meteorGlowMat} scale={[2.2, 2.2, 1]} />
            <sprite material={meteorHotMat} scale={[0.9, 0.9, 1]} />
          </group>
          <group ref={(el) => { metAims.current[i] = el; }} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh material={metAimMats[i]}><ringGeometry args={[0.92, 1, 56]} /></mesh>
            <mesh material={metAimMats[i]}><ringGeometry args={[0.3, 0.36, 32]} /></mesh>
          </group>
        </group>
      ))}
      {/* 대시 잔상 — 차체 · 지붕 모양 붉은 빛 */}
      {Array.from({ length: GHOSTS }, (_, i) => (
        <group key={`g${i}`} ref={(el) => { ghosts.current[i] = el; }} visible={false}>
          <mesh material={ghostMat.clone()} position={[0, WHEEL_R + 0.12, 0]}><boxGeometry args={[1.2, 0.2, 0.64]} /></mesh>
          <mesh material={ghostMat.clone()} position={[-0.05, WHEEL_R + 0.3, 0]}><boxGeometry args={[0.5, 0.18, 0.5]} /></mesh>
        </group>
      ))}
      {/* D 눈보라 — 바닥 서리(퍼지며) · 고드름 · 얼린 좀비를 감싼 얼음(기둥 · 꼭대기 · 바닥 가시) */}
      <mesh ref={frost} material={frostMat} rotation={[-Math.PI / 2, 0, 0]} visible={false}><circleGeometry args={[1, 72]} /></mesh>
      {Array.from({ length: SPIKES }, (_, i) => (
        <group key={`sp${i}`} ref={(el) => { spikes.current[i] = el; }} visible={false}>
          <mesh material={iceMat} position={[0, 0.5, 0]}><coneGeometry args={[0.16, 1, 6]} /></mesh>
          <mesh material={iceMat} position={[0.12, 0.3, 0.05]} rotation={[0.3, 0, -0.5]}><coneGeometry args={[0.09, 0.6, 5]} /></mesh>
        </group>
      ))}
      {zParts.map((_, i) => (
        <group key={`ice${i}`} ref={(el) => { ices.current[i] = el; }} visible={false}>
          <mesh material={iceMat} position={[0, 0.95, 0]}><cylinderGeometry args={[0.46, 0.56, 1.95, 7]} /></mesh>
          <mesh material={iceMat} position={[0.04, 2.05, 0.03]} rotation={[0.15, 0, 0.12]}><coneGeometry args={[0.36, 0.5, 7]} /></mesh>
          {[0, 1, 2, 3, 4].map((q) => {
            const a = (q / 5) * Math.PI * 2 + 0.4;
            return <mesh key={q} material={iceMat} position={[Math.cos(a) * 0.5, 0.25, Math.sin(a) * 0.5]} rotation={[Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]}><coneGeometry args={[0.1, 0.55, 5]} /></mesh>;
          })}
        </group>
      ))}
      <primitive object={fx.iceShards.mesh} />
      {/* X 지진 바위 기둥 — 뾰족한 기둥 + 곁 조각 */}
      {Array.from({ length: ROCKS }, (_, i) => (
        <group key={`rk${i}`} ref={(el) => { rockRefs.current[i] = el; }} visible={false}>
          <mesh material={rockMat} position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.1, 0.45, 1, 5]} /></mesh>
          <mesh material={rockDark} position={[0.28, 0.25, 0.1]} rotation={[0.2, 0, -0.5]}><coneGeometry args={[0.2, 0.6, 4]} /></mesh>
          <mesh material={rockDark} position={[-0.22, 0.2, -0.18]} rotation={[-0.3, 0, 0.45]}><coneGeometry args={[0.16, 0.45, 4]} /></mesh>
        </group>
      ))}
      {/* C 드론 — 몸통 · 덮개 · 앞 청록 / 뒤 빨강 띠 · 팔 넷(모터 · 흐릿한 원판 · 날개 · 끝 불빛) · 아래 쌍열 기관포 · 다리,
          탐조등(드론 → 상대, 원뿔) · 땅의 조준 표시 */}
      {Array.from({ length: DRONES }, (_, i) => (
        <group key={`dr${i}`}>
          <group ref={(el) => { droneRefs.current[i] = el; }} visible={false} scale={1.25}>
            <Box p={[0, 0, 0]} s={[0.42, 0.12, 0.34]} m={droneMat} cast={false} />
            <mesh material={droneShell} position={[0, 0.06, 0]} scale={[1.3, 0.55, 1]}><sphereGeometry args={[0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
            <Box p={[0.215, 0, 0]} s={[0.01, 0.03, 0.28]} m={droneLed} cast={false} />
            <Box p={[-0.215, 0, 0]} s={[0.01, 0.03, 0.2]} m={droneLedRed} cast={false} />
            {[[0.34, 0.34], [0.34, -0.34], [-0.34, 0.34], [-0.34, -0.34]].map(([x, z], k) => (
              <group key={`${x}${z}`}>
                <Box p={[x / 2, 0, z / 2]} s={[0.46, 0.035, 0.05]} r={[0, Math.atan2(-z, x), 0]} m={droneMat} cast={false} />
                <mesh material={droneMat} position={[x, 0.03, z]}><cylinderGeometry args={[0.045, 0.05, 0.08, 10]} /></mesh>
                <mesh material={rotorDisc} position={[x, 0.075, z]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.2, 24]} /></mesh>
                <group position={[x, 0.08, z]} ref={(el) => { rotorRefs.current[i * 4 + k] = el; }}>
                  <Box p={[0, 0, 0]} s={[0.38, 0.006, 0.035]} m={bladeMat} cast={false} />
                </group>
                <mesh material={x > 0 ? droneLed : droneLedRed} position={[x, -0.03, z]}><sphereGeometry args={[0.02, 6, 4]} /></mesh>
              </group>
            ))}
            <group ref={(el) => { turretRefs.current[i] = el; }} position={[0.05, -0.1, 0]}>
              <mesh material={droneMat}><sphereGeometry args={[0.06, 10, 8]} /></mesh>
              {[0.035, -0.035].map((z) => <mesh key={z} material={MAT.dark} position={[0.14, 0, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.014, 0.014, 0.22, 6]} /></mesh>)}
            </group>
            {[0.12, -0.12].map((z) => <Box key={z} p={[0, -0.1, z]} s={[0.3, 0.015, 0.015]} m={MAT.dark} cast={false} />)}
          </group>
          <group ref={(el) => { searchRefs.current[i] = el; }} visible={false}>
            <mesh material={searchMat} position={[0, -0.5, 0]}><cylinderGeometry args={[0.05, 0.9, 1, 24, 1, true]} /></mesh>
          </group>
          <group ref={(el) => { markRefs.current[i] = el; }} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh material={markMat}><ringGeometry args={[0.55, 0.62, 40]} /></mesh>
            {[0, 1, 2, 3].map((k) => (
              <mesh key={k} material={markMat} position={[Math.cos((k * Math.PI) / 2) * 0.42, Math.sin((k * Math.PI) / 2) * 0.42, 0]} rotation={[0, 0, (k * Math.PI) / 2]}><planeGeometry args={[0.2, 0.04]} /></mesh>
            ))}
          </group>
        </group>
      ))}
      <primitive object={fx.fire.mesh} />
      <group ref={nukeAim} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh material={nukeAimMat}><ringGeometry args={[0.95, 1, 72]} /></mesh>
        <mesh material={nukeAimMat}><ringGeometry args={[0.62, 0.65, 56]} /></mesh>
        <mesh material={nukeAimMat}><ringGeometry args={[0.2, 0.24, 32]} /></mesh>
        {[0, 1, 2, 3].map((k) => <mesh key={k} material={nukeAimMat} rotation={[0, 0, (k * Math.PI) / 2]} position={[Math.cos((k * Math.PI) / 2) * 0.8, Math.sin((k * Math.PI) / 2) * 0.8, 0]}><planeGeometry args={[0.32, 0.035]} /></mesh>)}
      </group>
      <mesh ref={nukeCol} material={nukeColMat} position={[0, 15, 0]} visible={false}><cylinderGeometry args={[0.18, 0.5, 30, 16, 1, true]} /></mesh>
      {/* 핵미사일 · 핵폭발 */}
      <group ref={nukeRef} visible={false} scale={NUKE_SCALE}>
        <Missile nuke flameRef={nukeFlame} />
      </group>
      <primitive object={fx.nuke.group} />
      {/* 좀비 */}
      {zParts.map((parts, i) => <Figure key={`z${i}`} parts={parts} mats={zMats[i]} />)}
      {/* 보스 — 공룡 · 드래곤(한 번에 하나) */}
      <Rex parts={rexParts} />
      <Wyrm parts={wyrmParts} />
      {goo.map((g, k) => (
        <mesh key={`goo${k}`} ref={(el) => { gooRefs.current[k] = el; }} material={g.mat} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
      <primitive object={fx.smoke.mesh} />
      <primitive object={fx.sparks.mesh} />
      <primitive object={fx.booms.group} />
      <mesh ref={dust} rotation={[-Math.PI / 2, 0, 0]} material={dustMat} visible={false}>
        <ringGeometry args={[0.6, 1, 32]} />
      </mesh>
    </group>
  );
}

/** RC카 웨이브 HUD — 그림 칸 왼쪽 위(웨이브 · 체력 · 남은 좀비 · 처치 · 기술 대기) + 가운데 알림. 값은 RcCar가 hud 묶음으로 직접 고침 */
export function SimHud({ hud }) {
  const keysInfo = [['Q', '미사일'], ['W', '유도'], ['E', '블랙홀'], ['R', '핵'], ['A', '대시'], ['S', '유성'], ['D', '눈보라'], ['Z', '화염'], ['X', '지진'], ['C', '드론']];
  return (
    <div className="m3-sim-hud" aria-hidden="true">
      <div className="m3-sim-dim" ref={(el) => { hud.dim = el; }} />
      <div className="m3-sim-frost" ref={(el) => { hud.frost = el; }} />
      <div className="m3-sim-flash" ref={(el) => { hud.flash = el; }} />
      <div className="m3-sim-box">
        <div className="m3-sim-row">
          <b ref={(el) => { hud.wave = el; }} />
          <span ref={(el) => { hud.left = el; }} />
          <span ref={(el) => { hud.kills = el; }} />
        </div>
        <div className="m3-sim-hp"><i ref={(el) => { hud.hp = el; }} /></div>
        <div className="m3-sim-keys">
          {keysInfo.map(([key, name], i) => (
            <span key={key} ref={(el) => { hud.sk[i] = el; }}><kbd>{key}</kbd>{name}<em /></span>
          ))}
        </div>
      </div>
      <div className="m3-sim-boss" ref={(el) => { hud.boss = el; }}>
        <span ref={(el) => { hud.bossName = el; }} />
        <div className="m3-sim-boss-hp"><i ref={(el) => { hud.bossHp = el; }} /></div>
      </div>
      <div className="m3-sim-banner-wrap">
        <div className="m3-sim-banner" ref={(el) => { hud.banner = el; }} />
      </div>
    </div>
  );
}
