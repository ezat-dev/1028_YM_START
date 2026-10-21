import axiosInstance from '../axiosInstance';

// 조건관리 > 설비점검표 — 현장 종이 '설비점검표'(설비 1대 = 1장, 항목 × 1~31일)

const BASE = '/api/condition/equipCheck';
const data = (res) => res.data;

// ── 점검표(양식) ──
export const getSheets = (useYn) => axiosInstance.get(`${BASE}/sheet`, { params: useYn ? { useYn } : {} }).then(data);
// body: { title, equipName, modelNo, copyFromId, regUserId, regUserName }
export const createSheet = (body) => axiosInstance.post(`${BASE}/sheet`, body).then(data);
// body: 점검표 전체(제목·설비명·모델 NO·legendJson·cycleJson·signJson·footerNote) + updUserId/updUserName
export const updateSheet = (sheetId, body) => axiosInstance.put(`${BASE}/sheet/${sheetId}`, body).then(data);
export const deleteSheets = (ids) => axiosInstance.post(`${BASE}/sheet/delete`, ids).then(data);
export const getBoard = (sheetId, ym) => axiosInstance.get(`${BASE}/sheet/${sheetId}/board`, { params: { ym } }).then(data);

// ── 항목 ──
export const addItem = (sheetId, body) => axiosInstance.post(`${BASE}/sheet/${sheetId}/item`, body).then(data);
export const updateItem = (itemId, body) => axiosInstance.put(`${BASE}/item/${itemId}`, body).then(data);
export const deleteItem = (itemId) => axiosInstance.post(`${BASE}/item/${itemId}/delete`).then(data);
export const moveItem = (itemId, dir) => axiosInstance.post(`${BASE}/item/${itemId}/move`, null, { params: { dir } }).then(data);
export const uploadPhoto = (itemId, file) => {
  const form = new FormData();
  form.append('file', file);
  return axiosInstance.post(`${BASE}/item/${itemId}/photo`, form, { timeout: 60000 }).then(data);
};
export const deletePhoto = (itemId) => axiosInstance.post(`${BASE}/item/${itemId}/photo/delete`).then(data);
/** 사진 주소 — updDt를 붙여 바꾼 사진이 캐시로 안 보이는 일을 막는다 */
export const photoUrl = (item) => `${axiosInstance.defaults.baseURL}${BASE}/item/${item.itemId}/photo?v=${encodeURIComponent(item.updDt ?? '')}`;

// ── 기록 ──
// mark가 ''면 칸을 지운다
export const setResult = (itemId, body) => axiosInstance.put(`${BASE}/item/${itemId}/result`, body).then(data);
// body: { ym, day, mark(없으면 양호), userId, userName } — 그날 빈 칸만 채운다
export const fillDay = (sheetId, body) => axiosInstance.post(`${BASE}/sheet/${sheetId}/fill`, body).then(data);
export const saveMonth = (sheetId, body) => axiosInstance.put(`${BASE}/sheet/${sheetId}/month`, body).then(data);
export const saveNote = (itemId, body) => axiosInstance.put(`${BASE}/item/${itemId}/note`, body).then(data);

// ── 결재 · 관리책임자 확인 ──
// body: { ym, slot: 1~3, on, userId, userName }
export const sign = (sheetId, body) => axiosInstance.post(`${BASE}/sheet/${sheetId}/sign`, body).then(data);
// body: { ym, weekNo: 1~5, on, userId, userName }
export const confirmWeek = (sheetId, body) => axiosInstance.post(`${BASE}/sheet/${sheetId}/confirm`, body).then(data);
