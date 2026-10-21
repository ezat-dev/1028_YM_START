package com.mes.domain.quality;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 기준정보 > 경도관리 — 품번·검사항목별 경도 규격(base_hardness_spec) */
public class HardnessSpec {

    private Long specId; // PK
    private String equipCode; // 호기(설비코드) — 같은 품번도 호기마다 규격이 다르다
    private String equipName; // 조회용: 설비명
    private Long productId; // 제품관리 — 품번은 제품관리에서 고른다
    private String vendorName; // 조회용: 업체
    private String material; // 조회용: 재질
    private String partNo; // 품번
    private String productName; // 품명
    private String itemName; // 검사 항목
    private String unit; // HV/HRC/...
    private BigDecimal lsl; // 하한
    private BigDecimal usl; // 상한
    private BigDecimal target; // 목표값
    private Integer decimals; // 표시 소수 자리
    private Integer sampleSize; // 세트당 측정 개수(경도1~n)
    private String useYn;
    private String remark;
    private String regUserId; // 등록자 로그인 ID
    private String regUserName;
    private String updUserId;
    private String updUserName;
    private LocalDateTime regDt;
    private LocalDateTime updDt;
    private Integer measCount; // 조회용: 측정 건수
    private LocalDateTime lastMeasDt; // 조회용: 마지막 측정 일시

    public Long getSpecId() {
        return specId;
    }

    public void setSpecId(Long specId) {
        this.specId = specId;
    }

    public String getVendorName() {
        return vendorName;
    }

    public void setVendorName(String vendorName) {
        this.vendorName = vendorName;
    }

    public String getMaterial() {
        return material;
    }

    public void setMaterial(String material) {
        this.material = material;
    }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public String getPartNo() {
        return partNo;
    }

    public void setPartNo(String partNo) {
        this.partNo = partNo;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }

    public String getItemName() {
        return itemName;
    }

    public void setItemName(String itemName) {
        this.itemName = itemName;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public BigDecimal getLsl() {
        return lsl;
    }

    public void setLsl(BigDecimal lsl) {
        this.lsl = lsl;
    }

    public BigDecimal getUsl() {
        return usl;
    }

    public void setUsl(BigDecimal usl) {
        this.usl = usl;
    }

    public BigDecimal getTarget() {
        return target;
    }

    public void setTarget(BigDecimal target) {
        this.target = target;
    }

    public Integer getDecimals() {
        return decimals;
    }

    public void setDecimals(Integer decimals) {
        this.decimals = decimals;
    }

    public Integer getSampleSize() {
        return sampleSize;
    }

    public void setSampleSize(Integer sampleSize) {
        this.sampleSize = sampleSize;
    }

    public String getUseYn() {
        return useYn;
    }

    public void setUseYn(String useYn) {
        this.useYn = useYn;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }

    public String getRegUserId() {
        return regUserId;
    }

    public void setRegUserId(String regUserId) {
        this.regUserId = regUserId;
    }

    public String getRegUserName() {
        return regUserName;
    }

    public void setRegUserName(String regUserName) {
        this.regUserName = regUserName;
    }

    public String getUpdUserId() {
        return updUserId;
    }

    public void setUpdUserId(String updUserId) {
        this.updUserId = updUserId;
    }

    public String getUpdUserName() {
        return updUserName;
    }

    public void setUpdUserName(String updUserName) {
        this.updUserName = updUserName;
    }

    public LocalDateTime getRegDt() {
        return regDt;
    }

    public void setRegDt(LocalDateTime regDt) {
        this.regDt = regDt;
    }

    public LocalDateTime getUpdDt() {
        return updDt;
    }

    public void setUpdDt(LocalDateTime updDt) {
        this.updDt = updDt;
    }

    public Integer getMeasCount() {
        return measCount;
    }

    public void setMeasCount(Integer measCount) {
        this.measCount = measCount;
    }

    public LocalDateTime getLastMeasDt() {
        return lastMeasDt;
    }

    public void setLastMeasDt(LocalDateTime lastMeasDt) {
        this.lastMeasDt = lastMeasDt;
    }

    public String getEquipCode() {
        return equipCode;
    }

    public void setEquipCode(String equipCode) {
        this.equipCode = equipCode;
    }

    public String getEquipName() {
        return equipName;
    }

    public void setEquipName(String equipName) {
        this.equipName = equipName;
    }
}
