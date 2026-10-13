import axiosInstance from '../axiosInstance';

// 설비관리 > 설비가동률분석
export function getList(params) {
  return axiosInstance.get('/api/equipment/utilRate', { params }).then(res => res.data);
}

/**
 * 설비별 일자 상태 구간 — params: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 * 형식은 mocks/utilRateMock.js 상단 주석과 같다. DB 쪽이 준비되면 UtilRatePage의 USE_MOCK을 false로. (경로는 서버 구현 시 확정)
 */
export function getUtilDays(params) {
  return axiosInstance.get('/api/equipment/utilRate/days', { params }).then(res => res.data?.data ?? res.data);
}
