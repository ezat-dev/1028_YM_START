import { useEffect, useState } from 'react';

/*
 * 재료 투입 단계(phase) — 2호기(2.5D) · 3호기(3D) 그림이 같이 쓴다. 신호를 받아 한 단계씩 넘어간다.
 *  arrive  철통이 왼쪽 롤러 길을 따라 저울 위로 들어옴
 *  weigh   저울 위 — 무게 신호 기다림(계량 중)
 *  weighed 무게 신호 받음 — kg 표시(계량 완료), 승강기 신호 기다림
 *  lift    승강기 신호 — 철통이 올라감
 *  dump    위에서 기울여 호퍼에 붓기
 *  down    바로 세우고 내려와 저울 위로
 *  leave   빈 철통이 왼쪽으로 나감 → 다음 철통 arrive
 * CHARGE_MS: 단계별 움직임 길이(ms) — 그림의 움직임이 이 안에 끝난다
 */
export const CHARGE_PHASES = ['arrive', 'weigh', 'weighed', 'lift', 'dump', 'down', 'leave'];
export const CHARGE_MS = { arrive: 2600, weigh: 1800, weighed: 1600, lift: 2800, dump: 2200, down: 2800, leave: 2200 };

// 계량기 상태 글씨 — [글씨, 색 구분]
export const WEIGH_STATE = {
  arrive: ['철통 도착 중', 'is-move'],
  weigh: ['계량 중', 'is-weigh'],
  weighed: ['계량 완료', 'is-done'],
  lift: ['투입 중', 'is-feed'],
  dump: ['투입 중', 'is-feed'],
  down: ['복귀 중', 'is-move'],
  leave: ['빈 통 배출', 'is-move'],
};
// 무게 신호를 받은 뒤 빈 통이 나가기 전까지만 kg를 보여 준다
export const SHOW_WEIGHT = ['weighed', 'lift', 'dump', 'down'];

/**
 * 재료 투입 예시 순서기 — PLC 신호 연결 전, 단계를 시간에 맞춰 차례로 넘기고 계량 완료 때 무게(kg)를 정한다.
 * 신호 연결 후에는 이 훅 대신: 철통 도착 신호 → arrive/weigh, 무게 신호 → weighed + 그 값, 승강기 신호 → lift(이후 dump · down · leave는 그림이 이어서)
 */
export function useChargeDemo(running) {
  const [charge, setCharge] = useState({ phase: 'arrive', weight: null });
  useEffect(() => {
    if (!running) return undefined;
    let i = 0;
    let weight = null;
    let timer;
    const step = () => {
      const phase = CHARGE_PHASES[i % CHARGE_PHASES.length];
      if (phase === 'arrive') weight = null;
      if (phase === 'weighed') weight = Math.round(470 + Math.random() * 40); // 무게 신호(예시)
      setCharge({ phase, weight });
      timer = setTimeout(step, CHARGE_MS[phase]);
      i += 1;
    };
    step();
    return () => clearTimeout(timer);
  }, [running]);
  return charge;
}
