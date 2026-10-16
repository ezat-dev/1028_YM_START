import axiosInstance from '../axiosInstance';

// 품질관리 > F/PROOF SAVE / F/PROOF LIST
// 설비 = 알람 폴더(folderId). 응답은 ApiResponse({ success, data }) 그대로 돌려준다.

// ── F/PROOF SAVE ──

// 설비 목록. 각 설비: { folderId, folderName, startTagId, endTagId, custom, tags: [{ tagId, tagName, address, alarmMsg, level }] }
export function getEquips() {
  return axiosInstance.get('/api/quality/fproof/equips').then((res) => res.data);
}

// 설비에서 F/PROOF 대상으로 지정된 알람 태그 ID 배열
export function getSelected(folderId) {
  return axiosInstance.get('/api/quality/fproof/selected', { params: { folderId } }).then((res) => res.data);
}

export function selectTag(tagId, folderId) {
  return axiosInstance.post('/api/quality/fproof/select', null, { params: { tagId, folderId } }).then((res) => res.data);
}

export function deselectTag(tagId, folderId) {
  return axiosInstance.post('/api/quality/fproof/deselect', null, { params: { tagId, folderId } }).then((res) => res.data);
}

// 설비의 시작/종료 트리거 지정
export function saveTrigger(folderId, startTagId, endTagId) {
  return axiosInstance
    .put('/api/quality/fproof/trigger', null, { params: { folderId, startTagId, endTagId } })
    .then((res) => res.data);
}

// 설비의 트리거 지정을 지워 기본값('Fool Proof 시작/종료' 문구)으로 되돌린다
export function resetTrigger(folderId) {
  return axiosInstance.delete('/api/quality/fproof/trigger', { params: { folderId } }).then((res) => res.data);
}

// ── F/PROOF LIST ──

// 세션 목록: [{ folderId, folderName, startTime, endTime(null=미종료), alarmCount }]
export function getSessions(from, to) {
  return axiosInstance.get('/api/quality/fproofList/sessions', { params: { from, to } }).then((res) => res.data);
}

// 세션 구간의 지정 알람 이력: [{ tagName, alarmMsg, occurTime, clearTime }]
export function getDetail(folderId, start, end) {
  return axiosInstance
    .get('/api/quality/fproofList/detail', { params: { folderId, start, end: end || undefined } })
    .then((res) => res.data);
}

// 엑셀용 평탄화 행: [{ folderId, folderName, startTime, endTime, tagName, alarmMsg, occurTime, clearTime }]
export function getExport(from, to) {
  return axiosInstance
    .get('/api/quality/fproofList/export', { params: { from, to }, timeout: 60000 })
    .then((res) => res.data);
}
