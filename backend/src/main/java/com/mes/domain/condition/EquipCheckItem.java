package com.mes.domain.condition;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnore;

/** 설비점검표 항목 — 점검개소 / 점검항목 / 주기 / 사진 */
public class EquipCheckItem {

    private Long itemId;
    private Long sheetId;
    private String location;
    private String itemName;
    private String cycle;
    private java.math.BigDecimal rangeMin; // 범위 하한 — 수치로 기록하면 벗어날 때 빨간색
    private java.math.BigDecimal rangeMax; // 범위 상한
    private String photoPath; // 저장 경로 — 화면에 내보내지 않는다
    private String photoName;
    private String photoType;
    private Integer seq;
    private String useYn;
    private LocalDateTime updDt;

    public Long getItemId() {
        return itemId;
    }

    public void setItemId(Long itemId) {
        this.itemId = itemId;
    }

    public Long getSheetId() {
        return sheetId;
    }

    public void setSheetId(Long sheetId) {
        this.sheetId = sheetId;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getItemName() {
        return itemName;
    }

    public void setItemName(String itemName) {
        this.itemName = itemName;
    }

    public java.math.BigDecimal getRangeMin() {
        return rangeMin;
    }

    public void setRangeMin(java.math.BigDecimal rangeMin) {
        this.rangeMin = rangeMin;
    }

    public java.math.BigDecimal getRangeMax() {
        return rangeMax;
    }

    public void setRangeMax(java.math.BigDecimal rangeMax) {
        this.rangeMax = rangeMax;
    }

    public String getCycle() {
        return cycle;
    }

    public void setCycle(String cycle) {
        this.cycle = cycle;
    }

    @JsonIgnore
    public String getPhotoPath() {
        return photoPath;
    }

    public void setPhotoPath(String photoPath) {
        this.photoPath = photoPath;
    }

    public String getPhotoName() {
        return photoName;
    }

    public void setPhotoName(String photoName) {
        this.photoName = photoName;
    }

    public String getPhotoType() {
        return photoType;
    }

    public void setPhotoType(String photoType) {
        this.photoType = photoType;
    }

    public Integer getSeq() {
        return seq;
    }

    public void setSeq(Integer seq) {
        this.seq = seq;
    }

    public String getUseYn() {
        return useYn;
    }

    public void setUseYn(String useYn) {
        this.useYn = useYn;
    }

    public LocalDateTime getUpdDt() {
        return updDt;
    }

    public void setUpdDt(LocalDateTime updDt) {
        this.updDt = updDt;
    }
}
