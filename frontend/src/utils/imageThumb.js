// 업로드 전에 브라우저에서 목록용 썸네일(JPEG)을 만든다.
// 서버(Java ImageIO)에서 만들면 휴대폰 사진의 EXIF 회전 정보를 무시해 썸네일만 옆으로 눕는데,
// 브라우저의 createImageBitmap은 imageOrientation: 'from-image'로 회전을 반영해 준다.
// 만들 수 없는 형식이면 null을 돌려주고, 그때 서버는 원본을 썸네일 대신 쓴다.
export async function makeThumbnail(file, maxSize = 360, quality = 0.85) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // 투명 PNG를 JPEG로 바꾸면 배경이 검게 나오므로 흰색을 먼저 깐다
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  } catch {
    return null;
  }
}

export const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function isAllowedImage(file) {
  return /\.(jpe?g|png|webp|gif)$/i.test(file?.name ?? '');
}
