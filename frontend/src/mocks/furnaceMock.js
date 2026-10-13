// 연속열처리로 6대 목업 공통 정의 — 종합생산현황(및 앞으로 만들 모니터링 화면)이 같은 설비 상태를 보여주도록 한곳에 둔다.
// 현장 PLC/DB 연동 후에는 이 파일 대신 실제 조회 결과를 쓰면 된다.

import { getList as getPatternList } from '../api/base/patternApi';

export const FURNACES = [
  { code: 'BCF1', name: '연속열처리로 1호기', status: 'run' },
  { code: 'BCF2', name: '연속열처리로 2호기', status: 'run' },
  { code: 'BCF3', name: '연속열처리로 3호기', status: 'run' },
  { code: 'BCF4', name: '연속열처리로 4호기', status: 'alarm', alarm: { zone: 'q3', message: '퀜칭로 3존 온도 상한 초과' } },
  { code: 'BCF5', name: '연속열처리로 5호기', status: 'run' },
  { code: 'BCF6', name: '연속열처리로 6호기', status: 'idle', idleReason: '정기 점검' },
];

export const STATUS_LABEL = { run: '가동', alarm: '알람', idle: '정지' };

// 날짜를 씨앗으로 쓰는 난수 — 새로고침해도 같은 날에는 같은 숫자가 나와 목업이 들쭉날쭉하지 않다
export function seededRandom(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i += 1) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 패턴관리에 데이터가 없거나 서버가 꺼져 있을 때 쓰는 예시 패턴
const FALLBACK_PATTERNS = [
  { patternCode: 'PT-DEMO1', patternName: '기본', company: '회사명_1', partNo: 'DEMO-001', productName: '샤프트', q: [880, 910, 930, 930, 860], t: [170, 170, 170, 165, 160], cp: 0.85, qs: 32, ts: 28, unit: 'Hz', charge: 600 },
  { patternCode: 'PT-DEMO2', patternName: '기본', company: '회사명_2', partNo: 'DEMO-002', productName: '기어', q: [870, 900, 920, 920, 850], t: [180, 180, 175, 170, 170], cp: 0.8, qs: 35, ts: 30, unit: 'Hz', charge: 450 },
  { patternCode: 'PT-DEMO3', patternName: '기본', company: '회사명_3', partNo: 'DEMO-003', productName: '부시', q: [850, 870, 880, 880, 840], t: [200, 200, 195, 190, 190], cp: 0.75, qs: 40, ts: 34, unit: 'Hz', charge: 300 },
];

function fromApi(p) {
  return {
    patternCode: p.patternCode,
    patternName: p.patternName,
    partNo: p.partNo,
    productName: p.productName,
    q: [p.q1Zone, p.q2Zone, p.q3Zone, p.q4Zone, p.q5Zone].map((v) => (v == null ? 850 : Number(v))),
    t: [p.t1Zone, p.t2Zone, p.t3Zone, p.t4Zone, p.t5Zone].map((v) => (v == null ? 170 : Number(v))),
    cp: p.cp == null ? null : Number(p.cp),
    qs: p.quenchSpeed == null ? null : Number(p.quenchSpeed),
    ts: p.temperSpeed == null ? null : Number(p.temperSpeed),
    vendorId: p.vendorId,
    unit: p.speedUnit || 'Hz',
    charge: p.chargeWeightKg == null ? null : Number(p.chargeWeightKg),
  };
}

/**
 * 목업 화면들이 쓰는 패턴 목록 — 기준정보 > 패턴관리(사용 중인 것)를 불러오고, 거래처는 '회사명_N'으로 가린다.
 * 비어 있거나 실패하면 예시 패턴으로 대신한다(항상 성공하는 Promise).
 */
export function fetchMockPatterns() {
  return getPatternList(null, null, 'Y', null)
    .then((res) => {
      const list = (res.data ?? []).map(fromApi);
      const vendorNo = new Map();
      [...new Set(list.map((x) => x.vendorId))].sort((a, b) => a - b).forEach((id, i) => vendorNo.set(id, i + 1));
      list.forEach((x) => { x.company = `회사명_${vendorNo.get(x.vendorId)}`; });
      return list.length ? list : FALLBACK_PATTERNS;
    })
    .catch(() => [...FALLBACK_PATTERNS]);
}
