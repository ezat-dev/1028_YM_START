package com.mes.domain.production;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** 열처리 CHECK SHEET — 호기 × 생산일자 한 장 */
public class CheckSheet {

    private Long sheetId;
    private String equipCode;
    private String equipName; // 조회용
    private LocalDate prodDate;
    private String workerDay; // 작업자(주간)
    private String workerNight; // 작업자(야간)
    private String qcName; // 공정QC 담당자
    private String regUserId;
    private String regUserName;
    private LocalDateTime regDt;
    private LocalDateTime updDt;
    private Integer rowCount; // 목록용: 통(행) 수
    private BigDecimal qtySum; // 목록용: 생산량 합(Kg)
    private BigDecimal defectSum; // 목록용: 불량 합
    private Integer downCount; // 목록용: 비가동 건수
    private Integer signCount; // 목록용: 서명 수
    private Integer ngCount; // 목록용: 경도 불합격 행 수

    public Long getSheetId() {
        return sheetId;
    }

    public void setSheetId(Long sheetId) {
        this.sheetId = sheetId;
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

    public LocalDate getProdDate() {
        return prodDate;
    }

    public void setProdDate(LocalDate prodDate) {
        this.prodDate = prodDate;
    }

    public String getWorkerDay() {
        return workerDay;
    }

    public void setWorkerDay(String workerDay) {
        this.workerDay = workerDay;
    }

    public String getWorkerNight() {
        return workerNight;
    }

    public void setWorkerNight(String workerNight) {
        this.workerNight = workerNight;
    }

    public String getQcName() {
        return qcName;
    }

    public void setQcName(String qcName) {
        this.qcName = qcName;
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

    public Integer getRowCount() {
        return rowCount;
    }

    public void setRowCount(Integer rowCount) {
        this.rowCount = rowCount;
    }

    public BigDecimal getQtySum() {
        return qtySum;
    }

    public void setQtySum(BigDecimal qtySum) {
        this.qtySum = qtySum;
    }

    public BigDecimal getDefectSum() {
        return defectSum;
    }

    public void setDefectSum(BigDecimal defectSum) {
        this.defectSum = defectSum;
    }

    public Integer getDownCount() {
        return downCount;
    }

    public void setDownCount(Integer downCount) {
        this.downCount = downCount;
    }

    public Integer getSignCount() {
        return signCount;
    }

    public void setSignCount(Integer signCount) {
        this.signCount = signCount;
    }

    public Integer getNgCount() {
        return ngCount;
    }

    public void setNgCount(Integer ngCount) {
        this.ngCount = ngCount;
    }
}
