import axiosInstance from '../axiosInstance';

// 기준정보 > 패턴관리 — 제품·거래처 정보(품번, 품명, 규격, 재질, 경도)는 조인해서 같이 온다

export function getList(vendorId, productId, useYn, keyword) {
  return axiosInstance
    .get('/api/base/pattern', {
      params: {
        vendorId: vendorId || undefined,
        productId: productId || undefined,
        useYn: useYn || undefined,
        keyword: keyword || undefined,
      },
    })
    .then((res) => res.data);
}

export function createPattern(pattern) {
  return axiosInstance.post('/api/base/pattern', pattern).then((res) => res.data);
}

export function updatePattern(patternId, pattern) {
  return axiosInstance.put(`/api/base/pattern/${patternId}`, pattern).then((res) => res.data);
}

export function deletePatterns(patternIds, userName) {
  return axiosInstance
    .post('/api/base/pattern/delete', patternIds, { params: { userName: userName || undefined } })
    .then((res) => res.data);
}

export function getHistory(patternId) {
  return axiosInstance.get(`/api/base/pattern/${patternId}/history`).then((res) => res.data);
}
