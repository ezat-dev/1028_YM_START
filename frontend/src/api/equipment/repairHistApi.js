import axiosInstance from '../axiosInstance';

// 설비관리 > 수리이력관리 — 고장 발생부터 복구까지. 상태가 '완료'면 설비이력에 '수리' 이력이 자동 등록된다.

const clean = (params) => {
  const p = {};
  Object.entries(params ?? {}).forEach(([k, v]) => { if (v !== '' && v != null) p[k] = v; });
  return p;
};

// params: { from: 'YYYY-MM-DDTHH:mm:ss', to, equipId, status, repairKind, keyword } — 고장 발생일시 기준
export function getRepairList(params) {
  return axiosInstance.get('/api/equipment/repairHist', { params: clean(params) }).then((res) => res.data);
}

/** 상세 — parts(교체 부품)·attachments 포함 */
export function getRepair(repairId) {
  return axiosInstance.get(`/api/equipment/repairHist/${repairId}`).then((res) => res.data);
}

// body: { equipId, failDt, failType, alarmCode, symptom, cause, action, repairerName, repairKind, vendorName,
//         startDt, endDt, recoverDt, testResult, status, partCost, outsourceCost, parts: [{ partName, partNo, qty }], regUserId, regUserName }
export function createRepair(body) {
  return axiosInstance.post('/api/equipment/repairHist', body).then((res) => res.data);
}

export function updateRepair(repairId, body) {
  return axiosInstance.put(`/api/equipment/repairHist/${repairId}`, body).then((res) => res.data);
}

/** 연동된 설비이력과 첨부파일도 함께 지워진다 */
export function deleteRepairs(repairIds) {
  return axiosInstance.post('/api/equipment/repairHist/delete', repairIds).then((res) => res.data);
}
