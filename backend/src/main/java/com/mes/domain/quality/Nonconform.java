package com.mes.domain.quality;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** 품질관리 > 부적합품 1건 */
public class Nonconform {

    private Long ncId;
    private String ncNo; // NC-YYYYMM-NNN
    private LocalDate occurDate;
    private String equipCode;
    private String equipName; // 조회용
    private String partNo;
    private String productName;
    private String lotNo;
    private String defectCode;
    private String defectName;
    private BigDecimal qty;
    private String unit;
    private String status; // 대기 / 처리중 / 완료
    private String disposition; // 폐기 / 재작업 / 선별 / 특채 / 반품
    private String actionNote;
    private String source; // MANUAL / SHEET
    private Long checkRowId;
    private String remark;
    private String regUserId;
    private String regUserName;
    private LocalDateTime regDt;
    private String updUserId;
    private String updUserName;
    private LocalDateTime updDt;
    private Integer sheetRowNo; // 조회용: CHECK SHEET 행 번호

    public Long getNcId() {
        return ncId;
    }

    public void setNcId(Long ncId) {
        this.ncId = ncId;
    }

    public String getNcNo() {
        return ncNo;
    }

    public void setNcNo(String ncNo) {
        this.ncNo = ncNo;
    }

    public LocalDate getOccurDate() {
        return occurDate;
    }

    public void setOccurDate(LocalDate occurDate) {
        this.occurDate = occurDate;
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

    public String getLotNo() {
        return lotNo;
    }

    public void setLotNo(String lotNo) {
        this.lotNo = lotNo;
    }

    public String getDefectCode() {
        return defectCode;
    }

    public void setDefectCode(String defectCode) {
        this.defectCode = defectCode;
    }

    public String getDefectName() {
        return defectName;
    }

    public void setDefectName(String defectName) {
        this.defectName = defectName;
    }

    public BigDecimal getQty() {
        return qty;
    }

    public void setQty(BigDecimal qty) {
        this.qty = qty;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getDisposition() {
        return disposition;
    }

    public void setDisposition(String disposition) {
        this.disposition = disposition;
    }

    public String getActionNote() {
        return actionNote;
    }

    public void setActionNote(String actionNote) {
        this.actionNote = actionNote;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Long getCheckRowId() {
        return checkRowId;
    }

    public void setCheckRowId(Long checkRowId) {
        this.checkRowId = checkRowId;
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

    public LocalDateTime getRegDt() {
        return regDt;
    }

    public void setRegDt(LocalDateTime regDt) {
        this.regDt = regDt;
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

    public LocalDateTime getUpdDt() {
        return updDt;
    }

    public void setUpdDt(LocalDateTime updDt) {
        this.updDt = updDt;
    }

    public Integer getSheetRowNo() {
        return sheetRowNo;
    }

    public void setSheetRowNo(Integer sheetRowNo) {
        this.sheetRowNo = sheetRowNo;
    }
}
