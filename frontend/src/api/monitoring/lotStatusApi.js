import axiosInstance from '../axiosInstance';

// 모니터링 > LOT 현황
export function getList(params) {
  return axiosInstance.get('/api/monitoring/lotStatus', { params }).then(res => res.data);
}

/**
 * 설비별 작업 중 LOT + 직전 LOT — 형식은 mocks/lotStatusMock.js 상단 주석과 같다.
 * DB 쪽이 준비되면 LotStatusPage의 USE_MOCK을 false로 바꾼다. (엔드포인트 경로는 서버 구현 시 확정)
 */
export function getLotStatus() {
  return axiosInstance.get('/api/monitoring/lotStatus/current').then(res => res.data?.data ?? res.data);
}

/** 과거 이력 — params: { from, to, code, result, keyword } (완료된 LOT, 최근 완료 순) */
export function getLotHistory(params) {
  return axiosInstance.get('/api/monitoring/lotStatus/history', { params }).then(res => res.data?.data ?? res.data);
}
