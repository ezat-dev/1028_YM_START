package com.mes.domain.base;

import java.time.LocalDateTime;

/**
 * 기준정보 > 제품관리 이미지 (base_product_image) 1건. slot 1이 대표 이미지.
 */
public class ProductImage {

    private Long imageId; // PK
    private Long productId;
    private Integer slot; // 1~5
    private String origFileName; // 업로드한 원래 파일명
    private String fileName; // 저장된 원본 파일명
    private String thumbFileName; // 저장된 썸네일 파일명 (없으면 원본으로 대신)
    private Long fileSize;
    private LocalDateTime regDt;

    public Long getImageId() {
        return imageId;
    }

    public void setImageId(Long imageId) {
        this.imageId = imageId;
    }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public Integer getSlot() {
        return slot;
    }

    public void setSlot(Integer slot) {
        this.slot = slot;
    }

    public String getOrigFileName() {
        return origFileName;
    }

    public void setOrigFileName(String origFileName) {
        this.origFileName = origFileName;
    }

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    public String getThumbFileName() {
        return thumbFileName;
    }

    public void setThumbFileName(String thumbFileName) {
        this.thumbFileName = thumbFileName;
    }

    public Long getFileSize() {
        return fileSize;
    }

    public void setFileSize(Long fileSize) {
        this.fileSize = fileSize;
    }

    public LocalDateTime getRegDt() {
        return regDt;
    }

    public void setRegDt(LocalDateTime regDt) {
        this.regDt = regDt;
    }
}
