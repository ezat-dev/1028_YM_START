package com.mes.domain.production;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 열처리 CHECK SHEET 행 — 통 하나 */
public class CheckRow {

    private Long rowId;
    private Long sheetId;
    private Integer rowNo;
    private String outTime; // 출로시간 HH:MM
    private String vendor; // 업체
    private String partNo; // 제품 품번
    private String productName; // 품명
    private String specText; // 규격(치수)
    private String lotNo; // 작지 No(LOT)
    private BigDecimal qtyKg; // 생산량(Kg)
    private BigDecimal defectQty; // 불량 수량
    private String defectCode; // 불량 구분
    private String downCode; // 비가동 표기(코드)
    private String downStart; // 비가동 시작 HH:MM
    private String downEnd; // 비가동 끝 HH:MM
    private String material; // 재질
    private String heatLotNo; // 열처리 LOT NO
    private String worker;
    private String leader; // 조장
    private String qc; // 공정QC
    private Long downtimeId; // 연동된 설비비가동
    private Long ncId; // 연동된 부적합품
    private String ncNo; // 조회용: 부적합 번호
    private String ncStatus; // 조회용: 부적합 처리상태
    private List<CheckHardness> hardness; // 표면·심부 경도 측정값
    private LocalDateTime updDt;
    private Long copyFromRowId; // 요청용: 이 행 내용을 복사해 새 행
    private String equipCode; // 요청용: 호기
    private LocalDate prodDate; // 요청용: 생산일자
    private String userId; // 요청용
    private String userName; // 요청용

    public Long getRowId() {
        return rowId;
    }

    public void setRowId(Long rowId) {
        this.rowId = rowId;
    }

    public Long getSheetId() {
        return sheetId;
    }

    public void setSheetId(Long sheetId) {
        this.sheetId = sheetId;
    }

    public Integer getRowNo() {
        return rowNo;
    }

    public void setRowNo(Integer rowNo) {
        this.rowNo = rowNo;
    }

    public String getOutTime() {
        return outTime;
    }

    public void setOutTime(String outTime) {
        this.outTime = outTime;
    }

    public String getVendor() {
        return vendor;
    }

    public void setVendor(String vendor) {
        this.vendor = vendor;
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

    public String getSpecText() {
        return specText;
    }

    public void setSpecText(String specText) {
        this.specText = specText;
    }

    public String getLotNo() {
        return lotNo;
    }

    public void setLotNo(String lotNo) {
        this.lotNo = lotNo;
    }

    public BigDecimal getQtyKg() {
        return qtyKg;
    }

    public void setQtyKg(BigDecimal qtyKg) {
        this.qtyKg = qtyKg;
    }

    public BigDecimal getDefectQty() {
        return defectQty;
    }

    public void setDefectQty(BigDecimal defectQty) {
        this.defectQty = defectQty;
    }

    public String getDefectCode() {
        return defectCode;
    }

    public void setDefectCode(String defectCode) {
        this.defectCode = defectCode;
    }

    public String getDownCode() {
        return downCode;
    }

    public void setDownCode(String downCode) {
        this.downCode = downCode;
    }

    public String getDownStart() {
        return downStart;
    }

    public void setDownStart(String downStart) {
        this.downStart = downStart;
    }

    public String getDownEnd() {
        return downEnd;
    }

    public void setDownEnd(String downEnd) {
        this.downEnd = downEnd;
    }

    public String getMaterial() {
        return material;
    }

    public void setMaterial(String material) {
        this.material = material;
    }

    public String getHeatLotNo() {
        return heatLotNo;
    }

    public void setHeatLotNo(String heatLotNo) {
        this.heatLotNo = heatLotNo;
    }

    public String getWorker() {
        return worker;
    }

    public void setWorker(String worker) {
        this.worker = worker;
    }

    public String getLeader() {
        return leader;
    }

    public void setLeader(String leader) {
        this.leader = leader;
    }

    public String getQc() {
        return qc;
    }

    public void setQc(String qc) {
        this.qc = qc;
    }

    public Long getDowntimeId() {
        return downtimeId;
    }

    public void setDowntimeId(Long downtimeId) {
        this.downtimeId = downtimeId;
    }

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

    public String getNcStatus() {
        return ncStatus;
    }

    public void setNcStatus(String ncStatus) {
        this.ncStatus = ncStatus;
    }

    public List<CheckHardness> getHardness() {
        return hardness;
    }

    public void setHardness(List<CheckHardness> hardness) {
        this.hardness = hardness;
    }

    public LocalDateTime getUpdDt() {
        return updDt;
    }

    public void setUpdDt(LocalDateTime updDt) {
        this.updDt = updDt;
    }

    public Long getCopyFromRowId() {
        return copyFromRowId;
    }

    public void setCopyFromRowId(Long copyFromRowId) {
        this.copyFromRowId = copyFromRowId;
    }

    public String getEquipCode() {
        return equipCode;
    }

    public void setEquipCode(String equipCode) {
        this.equipCode = equipCode;
    }

    public LocalDate getProdDate() {
        return prodDate;
    }

    public void setProdDate(LocalDate prodDate) {
        this.prodDate = prodDate;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }
}
