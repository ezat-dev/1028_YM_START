// 설비·상태 공통 색 — 설비관리 화면들(전력량, 설비가동률분석)이 같은 색을 쓰도록 한곳에 둔다.

// 설비 색 — 한 단계 연한 6색. 이웃한 색끼리 색약 구분 검증 통과.
// 흰 바탕 대비가 낮은 색이 있어 값·이름은 항상 진한 글자로 옆에 같이 쓴다. 설비마다 고정, 순서 고정.
export const EQUIP_COLORS = {
  BCF1: '#5f80c6',
  BCF2: '#e6a35a',
  BCF3: '#35ad9c',
  BCF4: '#9a85db',
  BCF5: '#e57a7f',
  BCF6: '#55ade6',
};

// 설비 상태 색 — 가동/계획정지/고장정지/대기 (항상 글자 라벨과 함께 쓴다)
export const STATE_COLORS = {
  run: '#6cc196',
  plan: '#ebbd68',
  fail: '#e57373',
  wait: '#b9c1cd',
};

export const STATE_LABEL = { run: '가동', plan: '계획정지', fail: '고장정지', wait: '대기' };

// 설비가 아닌 보조 선(역률·평균·'지금' 표시 등)
export const LINE_BLUE = '#5f80c6';
