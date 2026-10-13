import axiosInstance from '../axiosInstance';

// 설비이력·수리이력 공통 첨부파일 — refType: 'HISTORY' | 'REPAIR', refId: histId | repairId

/** 여러 개 한 번에 업로드 */
export function uploadAttachments(refType, refId, files, user) {
  const fd = new FormData();
  fd.append('refType', refType);
  fd.append('refId', refId);
  fd.append('regUserId', user?.loginId ?? '');
  fd.append('regUserName', user?.userName ?? '');
  files.forEach((f) => fd.append('files', f));
  return axiosInstance
    .post('/api/equipment/attach', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })
    .then((res) => res.data);
}

export function deleteAttachments(attachIds) {
  return axiosInstance.post('/api/equipment/attach/delete', attachIds).then((res) => res.data);
}

export function attachUrl(attachId, download = false) {
  return `${axiosInstance.defaults.baseURL}/api/equipment/attach/${attachId}?mode=${download ? 'download' : 'preview'}`;
}
