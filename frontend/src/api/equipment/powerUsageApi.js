import axiosInstance from '../axiosInstance';

// 설비관리 > 전력량
export function getList(params) {
  return axiosInstance.get('/api/equipment/powerUsage', { params }).then(res => res.data);
}

/**
 * 구간 사용량 — KDX300 누적 유효전력량(Wh)·무효전력량(varh)의 구간 차이.
 * params: { from: ms, to: ms, unit: 'hour' | 'day' } → { unit, buckets, rows: [{ code, ts, wh, varh }] }
 * 형식은 mocks/powerMock.js 상단 주석과 같다. DB 쪽이 준비되면 PowerUsagePage의 USE_MOCK을 false로. (경로는 서버 구현 시 확정)
 */
export function getPowerSeries(params) {
  return axiosInstance.get('/api/equipment/powerUsage/series', { params }).then(res => res.data?.data ?? res.data);
}

/** 계량기 최신 누적값 — [{ code, name, meterId, whTotal, varhTotal, readAt, status }] */
export function getMeterLatest() {
  return axiosInstance.get('/api/equipment/powerUsage/meters').then(res => res.data?.data ?? res.data);
}
