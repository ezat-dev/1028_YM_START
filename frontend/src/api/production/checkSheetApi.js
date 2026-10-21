import axiosInstance from '../axiosInstance';

// 생산관리 > 열처리 CHECK SHEET — 호기 × 생산일자 한 장, 행 = 통
// 행의 경도(표면/심부 X1~X5)는 경도측정(→ CPK·PPK), 비가동은 설비비가동현황, 불량은 부적합품관리로 바로 연동된다.

const BASE = '/api/production/checkSheet';
const data = (res) => res.data;

export const getEquips = (date) => axiosInstance.get(`${BASE}/equips`, { params: { date } }).then(data);
export const getSheets = (equipCode, from, to) => axiosInstance.get(`${BASE}/sheets`, { params: { equipCode, from, to } }).then(data);
export const getBoard = (equipCode, date) => axiosInstance.get(`${BASE}/board`, { params: { equipCode, date } }).then(data);
export const getProducts = (equipCode) => axiosInstance.get(`${BASE}/products`, { params: { equipCode } }).then(data);

// body: { equipCode, prodDate, copyFromRowId, userId, userName }
export const addRow = (body) => axiosInstance.post(`${BASE}/row`, body).then(data);
export const updateRow = (rowId, body) => axiosInstance.put(`${BASE}/row/${rowId}`, body).then(data);
// body: { userId, userName } — 기록에 남길 사람
export const deleteRow = (rowId, body) => axiosInstance.post(`${BASE}/row/${rowId}/delete`, body ?? {}).then(data);
// body: { itemName: '표면 경도'|'심부 경도', values: [X1..X5], userId, userName }
export const saveHardness = (rowId, body) => axiosInstance.put(`${BASE}/row/${rowId}/hardness`, body).then(data);

export const saveHead = (body) => axiosInstance.put(`${BASE}/head`, body).then(data);
// body: { equipCode, prodDate, slot, on, userId, userName, signName, signImg }
export const sign = (body) => axiosInstance.post(`${BASE}/sign`, body).then(data);
export const saveSettings = (body) => axiosInstance.put(`${BASE}/setting`, body).then(data);
// 기록 — params: { from, to, equipCode(비우면 전체 호기) } → { sheets, signs, logs }
export const getAudit = (params) => axiosInstance.get(`${BASE}/audit`, { params }).then(data);
