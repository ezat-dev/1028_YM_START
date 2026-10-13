// 연속열처리로 트래킹 슬롯 구성 — 벨트 위 트레이 자리(슬롯)를 장입부터 배출까지 순서대로 나눈 것.
// 현재: 구간(존)마다 제품 1개 → 14칸.
// PLC 트래킹 테이블(시프트 레지스터)의 칸 수·구간 경계와 1:1로 맞춰야 한다. 현장 확인 후 slots 값만 고치면
// 화면의 구간 너비, 트레이 크기, 위치 계산이 모두 따라간다.

export const STAGES = [
  { key: 'load', kind: 'load', name: '장입', slots: 1 },
  ...[1, 2, 3, 4, 5].map((z) => ({ key: `q${z}`, kind: 'q', zone: z, name: `퀜칭로 ${z}존`, slots: 1 })),
  { key: 'oil', kind: 'oil', name: '오일조', slots: 1 },
  { key: 'wash', kind: 'wash', name: '세정', slots: 1 },
  ...[1, 2, 3, 4, 5].map((z) => ({ key: `t${z}`, kind: 't', zone: z, name: `템퍼링로 ${z}존`, slots: 1 })),
  { key: 'out', kind: 'out', name: '배출', slots: 1 },
];

export const SLOT_COUNT = STAGES.reduce((a, s) => a + s.slots, 0);

// 구간별 첫 슬롯·마지막 슬롯 번호(0부터)
let slotAcc = 0;
STAGES.forEach((s) => {
  s.firstSlot = slotAcc;
  slotAcc += s.slots;
  s.lastSlot = slotAcc - 1;
});

/** 슬롯 번호 → 구간 */
export function stageOfSlot(slot) {
  return STAGES.find((s) => slot <= s.lastSlot) ?? STAGES[STAGES.length - 1];
}

/** 슬롯 가운데의 가로 위치(레인 너비 대비 0~1). 배출 다음 칸(SLOT_COUNT)은 레인 밖 = 빠져나가는 중 */
export function slotCenter(slot) {
  return (slot + 0.5) / SLOT_COUNT;
}
