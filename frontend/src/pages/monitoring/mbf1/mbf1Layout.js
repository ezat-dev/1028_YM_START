// MBF1호기 운전 표시 패널(현장 미믹 패널)을 그대로 옮긴 배치 — 구간 9개, 램프 36개.
// 좌표는 Mbf1Mimic의 SVG viewBox(1800 × 360) 기준. tag는 PLC 주소가 정해지면 채운다.

export const VIEW_W = 1800;
export const VIEW_H = 360;

// 왼쪽 → 오른쪽 공정 순서
export const ZONES = [
  { key: 'skip', name: '재료 투입', en: 'SKIP UNIT', x: 12, w: 112 },
  { key: 'feeder', name: '진동 피더', en: 'CHARGE FEEDER', x: 124, w: 98 },
  { key: 'fwash', name: '전세정기', en: 'FRONT WASHER', x: 222, w: 178 },
  { key: 'quench', name: '소입로', en: 'QUENCHING FURNACE', x: 400, w: 290 },
  { key: 'oil', name: '유조', en: 'OIL QUENCHING TANK', x: 690, w: 216 },
  { key: 'sep', name: '유절 컨베이어', en: 'OIL SEPARATION CONV.', x: 906, w: 128 },
  { key: 'mwash', name: '중간세정기', en: 'MIDDLE WASHER', x: 1034, w: 168 },
  { key: 'temper', name: '소려로', en: 'TEMPERING FURNACE', x: 1202, w: 414 },
  { key: 'rust', name: '방청조', en: 'RUST PROOFING WASHER', x: 1616, w: 172 },
];

// top: 위 줄(이름이 램프 위), bottom: 아래 줄(이름이 램프 아래). label은 화면용 짧은 이름(줄바꿈 \n), full은 패널 원래 이름
export const LAMPS = [
  { id: 'L01', zone: 'skip', row: 'top', x: 72, label: '승강기', full: '재료공급 승강기' },
  { id: 'L02', zone: 'skip', row: 'bottom', x: 60, label: '유압\n펌프', full: '재료공급 유압 PUMP' },
  { id: 'L03', zone: 'feeder', row: 'top', x: 172, label: '진동기', full: '진동기' },

  { id: 'L04', zone: 'fwash', row: 'top', x: 256, label: '블로워', full: '전세정기 BLOWER' },
  { id: 'L05', zone: 'fwash', row: 'top', x: 308, label: '스키머', full: '전세정기 SKIMMER' },
  { id: 'L06', zone: 'fwash', row: 'top', x: 362, label: '컨베이어', full: '전세정기 CON\'V' },
  { id: 'L07', zone: 'fwash', row: 'bottom', x: 272, label: '스프레이\n펌프', full: '전세정기 SPRAY PUMP' },
  { id: 'L08', zone: 'fwash', row: 'bottom', x: 344, label: '라인\n펌프', full: '전세정기 LINE PUMP' },

  { id: 'L09', zone: 'quench', row: 'top', x: 480, label: 'RC FAN 1', full: '소입로 RC FAN.1', fan: 'q1' },
  { id: 'L10', zone: 'quench', row: 'top', x: 600, label: 'RC FAN 2', full: '소입로 RC FAN.2', fan: 'q2' },
  { id: 'L11', zone: 'quench', row: 'top', x: 424, label: '배기\n블로워', full: '소입로 배기 BLOWER' },
  { id: 'L12', zone: 'quench', row: 'bottom', x: 470, label: '버너\n블로워', full: '소입 BURNER BLOWER', burner: 'q' },
  { id: 'L13', zone: 'quench', row: 'bottom', x: 600, label: '소입로\n컨베이어', full: '소입로 CON\'V', conv: true },

  { id: 'L14', zone: 'oil', row: 'top', x: 732, label: '교반기', full: '유조 TANK AGITATOR', agitator: true },
  { id: 'L15', zone: 'oil', row: 'bottom', x: 716, label: '커튼\n펌프', full: '유조 TANK OIL CURTAIN PUMP' },
  { id: 'L16', zone: 'oil', row: 'bottom', x: 764, label: '제트\n펌프', full: '유조 TANK JET PUMP' },
  { id: 'L17', zone: 'oil', row: 'bottom', x: 812, label: '라인\n펌프', full: '유조 TANK LINE PUMP' },
  { id: 'L18', zone: 'oil', row: 'bottom', x: 862, label: '열교환\n펌프', full: '유조 TANK 열교환기 PUMP' },

  { id: 'L19', zone: 'oil', row: 'top', x: 884, label: '유조\n컨베이어', full: '유조 CON\'V', conv: true },
  { id: 'L20', zone: 'sep', row: 'top', x: 962, label: '유절\n컨베이어', full: '유절 CON\'V', conv: true },
  { id: 'L21', zone: 'sep', row: 'bottom', x: 962, label: '유절\n블로워', full: '유절 BLOWER' },

  { id: 'L22', zone: 'mwash', row: 'top', x: 1064, label: '블로워', full: '중간세정기 BLOWER' },
  { id: 'L23', zone: 'mwash', row: 'top', x: 1124, label: '오일\n스키머', full: '중간세정기 OIL SKIMMER' },
  { id: 'L24', zone: 'mwash', row: 'bottom', x: 1052, label: '컨베이어', full: '중간세정기 CON\'V', conv: true },
  { id: 'L25', zone: 'mwash', row: 'bottom', x: 1108, label: '라인\n펌프', full: '중간세정기 LINE PUMP' },
  { id: 'L26', zone: 'mwash', row: 'bottom', x: 1166, label: '스프레이\n펌프', full: '중간세정기 SPRAY PUMP' },

  { id: 'L27', zone: 'temper', row: 'top', x: 1290, label: 'RC FAN 1', full: '소려로 RC FAN.1', fan: 't1' },
  { id: 'L28', zone: 'temper', row: 'top', x: 1382, label: 'RC FAN 2', full: '소려로 RC FAN.2', fan: 't2' },
  { id: 'L29', zone: 'temper', row: 'top', x: 1474, label: 'RC FAN 3', full: '소려로 RC FAN.3', fan: 't3' },
  { id: 'L30', zone: 'temper', row: 'top', x: 1566, label: 'RC FAN 4', full: '소려로 RC FAN.4', fan: 't4' },
  { id: 'L31', zone: 'temper', row: 'bottom', x: 1300, label: '버너\n블로워', full: '소려 BURNER BLOWER', burner: 't' },
  { id: 'L32', zone: 'temper', row: 'bottom', x: 1430, label: '소려로\n컨베이어', full: '소려로 CON\'V', conv: true },

  { id: 'L33', zone: 'rust', row: 'top', x: 1660, label: '라인\n펌프', full: '방청조 LINE PUMP' },
  { id: 'L34', zone: 'rust', row: 'top', x: 1736, label: '컨베이어', full: '방청조 CON\'V', conv: true },
  { id: 'L35', zone: 'rust', row: 'bottom', x: 1660, label: '스프레이\n펌프', full: '방청조 SPRAY PUMP' },
  { id: 'L36', zone: 'rust', row: 'bottom', x: 1736, label: '블로워', full: '방청조 BLOWER' },
].map((l) => ({ tag: null, ...l }));

// 예시 상태 — 현장 패널 사진(10/22) 기준, 승강기 · 유압 펌프 · 진동기는 운전으로(재료 투입 모습을 평소에 보이게). PLC 연결 전까지만 쓴다
const PHOTO_OFF = new Set(['L04', 'L07', 'L11', 'L12', 'L21', 'L31', 'L36']);
export const SAMPLE_STATE = Object.fromEntries(LAMPS.map((l) => [l.id, PHOTO_OFF.has(l.id) ? 'stop' : 'run']));
// 화면 위 ON 버튼 — 램프 전부 운전(시연용)
export const ALL_RUN = Object.fromEntries(LAMPS.map((l) => [l.id, 'run']));

// 가열로(소입로) 설정조건 — 현장 게시판 기준. 로는 4존이고 3·4존은 같은 범위라 한 칸으로 본다(zones: 실제 존 번호)
export const QUENCH_ZONES = [
  { name: '1존', zones: [1], min: 730, max: 900 },
  { name: '2존', zones: [2], min: 830, max: 890 },
  { name: '3·4존', zones: [3, 4], min: 870, max: 890 },
];
export const QUENCH_ZONE_COUNT = QUENCH_ZONES.reduce((n, g) => n + g.zones.length, 0);
