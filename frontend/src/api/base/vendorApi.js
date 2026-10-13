import axiosInstance from '../axiosInstance';

// 기준정보 > 거래처관리 — 많아야 수백 건이라 페이징 없이 전체 목록을 받는다

export function getList(vendorType, useYn, keyword) {
  return axiosInstance
    .get('/api/base/vendor', {
      params: { vendorType: vendorType || undefined, useYn: useYn || undefined, keyword: keyword || undefined },
    })
    .then((res) => res.data);
}

export function getById(vendorId) {
  return axiosInstance.get(`/api/base/vendor/${vendorId}`).then((res) => res.data);
}

export function createVendor(vendor) {
  return axiosInstance.post('/api/base/vendor', vendor).then((res) => res.data);
}

export function updateVendor(vendorId, vendor) {
  return axiosInstance.put(`/api/base/vendor/${vendorId}`, vendor).then((res) => res.data);
}

export function deleteVendors(vendorIds) {
  return axiosInstance.post('/api/base/vendor/delete', vendorIds).then((res) => res.data);
}
