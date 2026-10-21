import axiosInstance from '../axiosInstance';

// 품질관리 > 부적합품관리 · 불량 구분
// 열처리 CHECK SHEET 행에 불량을 적으면 부적합이 자동으로 생긴다(source=SHEET — 처리 내용만 고칠 수 있음).

const data = (res) => res.data;
const clean = (params) => {
  const p = {};
  Object.entries(params ?? {}).forEach(([k, v]) => { if (v !== '' && v != null) p[k] = v; });
  return p;
};

// params: { from, to: 'YYYY-MM-DD', equipCode, status, defectCode, keyword }
export const getList = (params) => axiosInstance.get('/api/quality/nonconform', { params: clean(params) }).then(data);
export const getNonconform = (ncId) => axiosInstance.get(`/api/quality/nonconform/${ncId}`).then(data);
export const createNonconform = (body) => axiosInstance.post('/api/quality/nonconform', body).then(data);
export const updateNonconform = (ncId, body) => axiosInstance.put(`/api/quality/nonconform/${ncId}`, body).then(data);
export const deleteNonconforms = (ids) => axiosInstance.post('/api/quality/nonconform/delete', ids).then(data);

export const getDefectTypes = (useYn) => axiosInstance.get('/api/quality/defect-type', { params: clean({ useYn }) }).then(data);
export const createDefectType = (body) => axiosInstance.post('/api/quality/defect-type', body).then(data);
export const updateDefectType = (defectId, body) => axiosInstance.put(`/api/quality/defect-type/${defectId}`, body).then(data);
export const deleteDefectTypes = (ids) => axiosInstance.post('/api/quality/defect-type/delete', ids).then(data);
