package com.mes.domain.quality;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** 품질관리 > 경도측정 — 측정 1건(quality_hardness_meas) */
public class HardnessMeas {

    private Long measId;
    private String measNo; // HDM-YYYYMM-NNN
    private Long specId;
    private Long checkRowId; // CHECK SHEET 행에서 입력된 측정이면 그 행
    private String partNo;
    private String productName;
    private String itemName;
    private String unit;
    private BigDecimal lsl; // 측정 당시 하한
    private BigDecimal usl; // 측정 당시 상한
    private Integer sampleSize;
    private Integer decimals; // 조회용: 규격 소수 자리
    private String lotNo;
    private String equipCode;
    private LocalDateTime measDt;
    private String status; // 측정중 | 완료
    private String judgement; // 합격 | 불합격 | ''
    private String receiving; // Y면 경도계 자동 수신 대상
    private String workerName;
    private String remark;
    private LocalDateTime completedDt;
    private String regUserId; // 등록자 로그인 ID
    private String regUserName;
    private String updUserId;
    private String updUserName;
    private LocalDateTime regDt;
    private LocalDateTime updDt;
    private Integer setCount; // 조회용
    private Integer valueCount; // 조회용: 입력된 값 수
    private Integer ngCount; // 조회용: 규격 밖 값 수
    private List<HardnessSet> sets; // 상세 조회 때

    public Long getMeasId() {
        return measId;
    }

    public void setMeasId(Long measId) {
        this.measId = measId;
    }

    public String getMeasNo() {
        return measNo;
    }

    public void setMeasNo(String measNo) {
        this.measNo = measNo;
    }

    public Long getSpecId() {
        return specId;
    }

    public void setSpecId(Long specId) {
        this.specId = specId;
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

    public Integer getSampleSize() {
        return sampleSize;
    }

    public void setSampleSize(Integer sampleSize) {
        this.sampleSize = sampleSize;
    }

    public Integer getDecimals() {
        return decimals;
    }

    public void setDecimals(Integer decimals) {
        this.decimals = decimals;
    }

    public String getLotNo() {
        return lotNo;
    }

    public void setLotNo(String lotNo) {
        this.lotNo = lotNo;
    }

    public String getEquipCode() {
        return equipCode;
    }

    public void setEquipCode(String equipCode) {
        this.equipCode = equipCode;
    }

    public LocalDateTime getMeasDt() {
        return measDt;
    }

    public void setMeasDt(LocalDateTime measDt) {
        this.measDt = measDt;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getJudgement() {
        return judgement;
    }

    public void setJudgement(String judgement) {
        this.judgement = judgement;
    }

    public String getReceiving() {
        return receiving;
    }

    public void setReceiving(String receiving) {
        this.receiving = receiving;
    }

    public String getWorkerName() {
        return workerName;
    }

    public void setWorkerName(String workerName) {
        this.workerName = workerName;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }

    public LocalDateTime getCompletedDt() {
        return completedDt;
    }

    public void setCompletedDt(LocalDateTime completedDt) {
        this.completedDt = completedDt;
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

    public Integer getSetCount() {
        return setCount;
    }

    public void setSetCount(Integer setCount) {
        this.setCount = setCount;
    }

    public Integer getValueCount() {
        return valueCount;
    }

    public void setValueCount(Integer valueCount) {
        this.valueCount = valueCount;
    }

    public Integer getNgCount() {
        return ngCount;
    }

    public void setNgCount(Integer ngCount) {
        this.ngCount = ngCount;
    }

    public List<HardnessSet> getSets() {
        return sets;
    }

    public void setSets(List<HardnessSet> sets) {
        this.sets = sets;
    }

    public Long getCheckRowId() {
        return checkRowId;
    }

    public void setCheckRowId(Long checkRowId) {
        this.checkRowId = checkRowId;
    }
}
