import axiosInstance from '../axiosInstance';

// 기준정보 > 설비관리 — 설비는 수십 대 이하라 페이징 없이 전체 목록을 받는다

export function getList(equipStatus, useYn, keyword) {
  return axiosInstance
    .get('/api/base/equipment', {
      params: { equipStatus: equipStatus || undefined, useYn: useYn || undefined, keyword: keyword || undefined },
    })
    .then((res) => res.data);
}

export function createEquipment(equipment) {
  return axiosInstance.post('/api/base/equipment', equipment).then((res) => res.data);
}

export function updateEquipment(equipId, equipment) {
  return axiosInstance.put(`/api/base/equipment/${equipId}`, equipment).then((res) => res.data);
}

export function deleteEquipments(equipIds) {
  return axiosInstance.post('/api/base/equipment/delete', equipIds).then((res) => res.data);
}
