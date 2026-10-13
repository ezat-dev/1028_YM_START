import axiosInstance from '../axiosInstance';

// 기준정보 > 제품관리 — 목록에 각 제품의 images(slot 순)까지 같이 온다

export function getList(vendorId, useYn, keyword) {
  return axiosInstance
    .get('/api/base/product', {
      params: { vendorId: vendorId || undefined, useYn: useYn || undefined, keyword: keyword || undefined },
    })
    .then((res) => res.data);
}

export function createProduct(product) {
  return axiosInstance.post('/api/base/product', product).then((res) => res.data);
}

export function updateProduct(productId, product) {
  return axiosInstance.put(`/api/base/product/${productId}`, product).then((res) => res.data);
}

export function deleteProducts(productIds) {
  return axiosInstance.post('/api/base/product/delete', productIds).then((res) => res.data);
}

// 이미지는 업로드가 오래 걸릴 수 있어 기본 10초 timeout을 늘린다
export function uploadImage(productId, slot, file, thumbBlob) {
  const form = new FormData();
  form.append('file', file);
  if (thumbBlob) form.append('thumb', thumbBlob, 'thumb.jpg');
  return axiosInstance
    .post(`/api/base/product/${productId}/images`, form, { params: { slot }, timeout: 60000 })
    .then((res) => res.data);
}

export function deleteImage(productId, imageId) {
  return axiosInstance.delete(`/api/base/product/${productId}/images/${imageId}`).then((res) => res.data);
}

export function reorderImages(productId, slots) {
  return axiosInstance.put(`/api/base/product/${productId}/images/order`, slots).then((res) => res.data);
}

export function imageUrl(imageId, { thumb = false, download = false } = {}) {
  const q = [];
  if (thumb) q.push('thumb=true');
  if (download) q.push('mode=download');
  return `${axiosInstance.defaults.baseURL}/api/base/product/image/${imageId}${q.length ? `?${q.join('&')}` : ''}`;
}
