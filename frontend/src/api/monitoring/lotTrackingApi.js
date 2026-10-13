import axiosInstance from '../axiosInstance';

// 모니터링 > LOT 트래킹
export function getList(params) {
  return axiosInstance.get('/api/monitoring/lotTracking', { params }).then(res => res.data);
}

/**
 * 트래킹 스냅샷 — C# PlcApiServer 캐시(PLC 트래킹 테이블 + 이송 카운터)를 MES가 LOT 정보와 묶어 돌려줄 API.
 * 형식은 mocks/lotTrackingMock.js 상단 주석의 '스냅샷 형식'과 같다. 서버 쪽이 준비되면 LotTrackingPage의
 * USE_MOCK을 false로 바꾼다. (엔드포인트 경로는 서버 구현 시 확정)
 */
export function getTrackingSnapshot() {
  return axiosInstance.get('/api/monitoring/lotTracking/snapshot').then(res => res.data?.data ?? res.data);
}
