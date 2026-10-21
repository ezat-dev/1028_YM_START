import axiosInstance from '../axiosInstance';

// 경도 — 기준정보 > 경도관리(규격), 품질관리 > 경도측정 · CPK 분석 · PPK 분석
// 경도계(C# 연동)는 POST /api/quality/hardness/reading {value, unit, deviceId} 로 '자동 수신' 중인 측정의 다음 빈 칸에 값을 넣는다.

const BASE = '/api/quality/hardness';
const clean = (params) => {
  const p = {};
  Object.entries(params ?? {}).forEach(([k, v]) => { if (v !== '' && v != null) p[k] = v; });
  return p;
};
const data = (res) => res.data;

// ── 규격 ──
// 규격은 호기 × 품번 × 검사항목 — equipCode로 한 호기만
export const getSpecList = (keyword, useYn, equipCode) => axiosInstance.get(`${BASE}/spec`, { params: clean({ keyword, useYn, equipCode }) }).then(data);
export const createSpec = (body) => axiosInstance.post(`${BASE}/spec`, body).then(data);
export const updateSpec = (specId, body) => axiosInstance.put(`${BASE}/spec/${specId}`, body).then(data);
export const deleteSpecs = (ids) => axiosInstance.post(`${BASE}/spec/delete`, ids).then(data);

// ── 측정 ──
// params: { from, to: 'YYYY-MM-DDTHH:mm:ss', specId, status: '측정중'|'완료', keyword }
export const getMeasList = (params) => axiosInstance.get(`${BASE}/meas`, { params: clean(params) }).then(data);
export const getMeas = (measId) => axiosInstance.get(`${BASE}/meas/${measId}`).then(data);
// body: { specId, lotNo, equipCode, workerName, remark, setTypes: ['초물','중물','종물'], regUserId, regUserName }
export const createMeas = (body) => axiosInstance.post(`${BASE}/meas`, body).then(data);
export const updateMeasInfo = (measId, body) => axiosInstance.put(`${BASE}/meas/${measId}`, body).then(data);
export const deleteMeas = (ids) => axiosInstance.post(`${BASE}/meas/delete`, ids).then(data);
export const addSet = (measId, setType) => axiosInstance.post(`${BASE}/meas/${measId}/set`, { setType }).then(data);
export const deleteSet = (setId) => axiosInstance.post(`${BASE}/set/${setId}/delete`).then(data);
/** 수동 입력 — value가 null이면 칸을 비운다 */
export const setValue = (setId, idx, value) => axiosInstance.put(`${BASE}/set/${setId}/value/${idx}`, { value }).then(data);
export const completeMeas = (measId) => axiosInstance.post(`${BASE}/meas/${measId}/complete`).then(data);
export const reopenMeas = (measId) => axiosInstance.post(`${BASE}/meas/${measId}/reopen`).then(data);
export const setReceiving = (measId, on) => axiosInstance.post(`${BASE}/meas/${measId}/receive`, { on }).then(data);

// ── 공정능력(CPK·PPK) ──
export const getCapability = (specId, from, to) => axiosInstance.get(`${BASE}/capability`, { params: clean({ specId, from, to }) }).then(data);
