import axiosInstance from '../axiosInstance';

// 설비관리 > 설비이력관리 — 설비 생애주기 기록(점검·교체·변경·설치·개조·수리·기타)
// 수리이력이 '완료'되면 repairId가 달린 '수리' 이력이 자동으로 생기고, 그 행은 여기서 고치거나 지울 수 없다.

const clean = (params) => {
  const p = {};
  Object.entries(params ?? {}).forEach(([k, v]) => { if (v !== '' && v != null) p[k] = v; });
  return p;
};

// params: { from: 'YYYY-MM-DDTHH:mm:ss', to, equipId, histType, keyword }
export function getHistoryList(params) {
  return axiosInstance.get('/api/equipment/history', { params: clean(params) }).then((res) => res.data);
}

/** 상세 — attachments 포함(수리 연동 이력이면 그 수리의 첨부도 refType 'REPAIR'로 함께) */
export function getHistory(histId) {
  return axiosInstance.get(`/api/equipment/history/${histId}`).then((res) => res.data);
}

// body: { equipId, histType, title, content, workDt, workerName, regUserId, regUserName }
export function createHistory(body) {
  return axiosInstance.post('/api/equipment/history', body).then((res) => res.data);
}

export function updateHistory(histId, body) {
  return axiosInstance.put(`/api/equipment/history/${histId}`, body).then((res) => res.data);
}

export function deleteHistories(histIds) {
  return axiosInstance.post('/api/equipment/history/delete', histIds).then((res) => res.data);
}
