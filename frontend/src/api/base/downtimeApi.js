import axiosInstance from '../axiosInstance';

// 기준정보 > 비가동관리 — 비가동 사유 기준정보 + 비가동 내역(수동 등록)

// ── 비가동 사유 기준정보 ──
export function getReasonList(reasonType, useYn) {
  return axiosInstance
    .get('/api/base/downtime-reason', { params: { reasonType: reasonType || undefined, useYn: useYn || undefined } })
    .then((res) => res.data);
}

export function createReason(reason) {
  return axiosInstance.post('/api/base/downtime-reason', reason).then((res) => res.data);
}

export function updateReason(reasonId, reason) {
  return axiosInstance.put(`/api/base/downtime-reason/${reasonId}`, reason).then((res) => res.data);
}

export function deleteReasons(reasonIds) {
  return axiosInstance.post('/api/base/downtime-reason/delete', reasonIds).then((res) => res.data);
}

// ── 비가동 내역 ──
// params: { from: 'YYYY-MM-DDTHH:mm:ss', to, equipId, reasonType, keyword } — 기간과 겹치는 내역(진행 중 포함)
export function getDowntimeList(params) {
  const p = {};
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) p[k] = v; });
  return axiosInstance.get('/api/base/downtime', { params: p }).then((res) => res.data);
}

// body: { equipIds: [], reasonId, startDt, endDt, memo, regUserName } — 설비마다 1건씩 저장된다
export function createDowntimes(body) {
  return axiosInstance.post('/api/base/downtime', body).then((res) => res.data);
}

export function updateDowntime(downtimeId, body) {
  return axiosInstance.put(`/api/base/downtime/${downtimeId}`, body).then((res) => res.data);
}

export function deleteDowntimes(downtimeIds) {
  return axiosInstance.post('/api/base/downtime/delete', downtimeIds).then((res) => res.data);
}
