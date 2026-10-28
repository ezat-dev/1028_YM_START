import { useEffect, useState } from 'react';
import { fetchMockPatterns } from '../../../mocks/furnaceMock';
import { QUENCH_ZONES } from './mbf1Layout';

/*
 * MBF1호기 온도 예시 데이터 — 온도 칸과 3시간 그래프가 같은 값을 보도록 한곳에서 만든다.
 * 같은 시각이면 항상 같은 값(시각으로 계산)이라 그래프의 마지막 점과 온도 칸이 어긋나지 않는다.
 * PLC 연결 후에는 tempAt 대신 실제 현재값 · 이력 조회로 바꾸면 된다.
 */

// 그래프 색 — 범주형 고정 순서(dataviz 기준 팔레트 1~5번, 흰 바탕 검증 통과). 그룹이 바뀌어도 '몇 번째 채널'에 같은 색
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

const AUX = [
  { key: 'fwash', name: '전세정기', target: 60 },
  { key: 'oil', name: '유조', target: 80 },
  { key: 'mwash', name: '중간세정기', target: 60 },
  { key: 'rust', name: '방청조', target: 40 },
];

const frac = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

/** 시각 t(ms)의 예시 온도 — 목표값 근처를 천천히 오르내리고 3초마다 조금 흔들린다 */
export function tempAt(target, seed, t) {
  const m = t / 60000;
  const slow = Math.sin(m / 14 + seed) * 2.4 + Math.sin(m / 37 + seed * 1.7) * 1.6;
  const noise = (frac(Math.floor(t / 3000) + seed * 1000) - 0.5) * 0.25;
  return Math.round((target + slow + noise) * 10) / 10;
}

// 관리 범위 안쪽의 예시 목표 — 패턴 값이 경계에서 5℃ 이상 안쪽이면 그 값, 아니면 범위 가운데
const inRange = (sp, r) => (sp != null && sp >= r.min + 5 && sp <= r.max - 5 ? sp : Math.round((r.min + r.max) / 2));

/** 온도 채널 묶음 — quench(가열로 존별) · aux(유조·세정) · temper(소려로 존별) */
export function buildGroups(pattern) {
  const q = pattern?.q ?? [];
  const t = pattern?.t ?? [];
  return {
    quench: {
      key: 'quench',
      name: '가열로',
      channels: QUENCH_ZONES.flatMap((g) => g.zones.map((z) => ({ key: `q${z}`, name: `${z}존`, target: inRange(q[z - 1], g), range: g, seed: z }))),
    },
    aux: {
      key: 'aux',
      name: '유조 · 세정',
      channels: AUX.map((a, i) => ({ ...a, sp: a.target, seed: 20 + i })),
    },
    temper: {
      key: 'temper',
      name: '소려로',
      channels: t.map((sp, i) => ({ key: `t${i + 1}`, name: `${i + 1}존`, target: sp, sp, seed: 10 + i })),
    },
  };
}

/** 패턴(설정값) + 지금 시각(3초마다). no: 호기 번호 — 종합생산현황과 같게 n호기는 패턴 목록의 (n-1)번째 */
export function useMbf1Data(no = 1) {
  const [pattern, setPattern] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    fetchMockPatterns().then((list) => { if (alive) setPattern(list[(no - 1) % list.length]); });
    const timer = setInterval(() => setNow(Date.now()), 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [no]);
  return { pattern, groups: pattern ? buildGroups(pattern) : null, now };
}
