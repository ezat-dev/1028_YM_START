package com.mes.domain.equipment;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 설비관리 > 수리이력관리 (equipment_repair_hist) 1건 — 고장 발생부터 복구까지.
 *
 * <p>상태: 접수 | 진행 | 완료 | 보류 | 재수리필요. '완료'로 저장하면 설비이력에 '수리' 이력이 자동으로 생긴다.</p>
 */
public class RepairHist {

    private Long repairId; // PK
    private String repairNo; // 수리번호 REP-YYYYMM-NNN
    private Long equipId; // 설비
    private LocalDateTime failDt; // 고장 발생일시
    private String failType; // 고장 유형
    private String alarmCode; // 알람 코드
    private String symptom; // 고장 증상
    private String cause; // 원인 분석
    private String action; // 조치 내용
    private String repairerName; // 수리 담당자
    private String repairKind; // 자체 | 외주
    private String vendorName; // 외주 업체
    private LocalDateTime startDt; // 수리 시작
    private LocalDateTime endDt; // 수리 완료
    private LocalDateTime recoverDt; // 정상 가동 복구
    private String testResult; // 시운전 결과: 정상 | 이상 | ''
    private String status; // 접수 | 진행 | 완료 | 보류 | 재수리필요
    private Long partCost; // 부품비(원)
    private Long outsourceCost; // 외주비(원)
    private String regUserId; // 등록자 로그인 ID
    private String regUserName; // 등록자
    private String updUserId; // 마지막 수정자 로그인 ID
    private String updUserName; // 마지막 수정자
    private LocalDateTime regDt;
    private LocalDateTime updDt;
    private String equipCode; // 조회용
    private String equipName; // 조회용
    private Long totalCost; // 조회용: 부품비 + 외주비
    private Long downMin; // 조회용: 고장 발생 → 복구(분)
    private Long workMin; // 조회용: 수리 시작 → 완료(분)
    private Integer attachCount; // 조회용: 첨부 개수
    private Integer partCount; // 조회용: 교체 부품 수
    private List<RepairPart> parts; // 상세 조회·저장 때
    private List<EquipAttach> attachments; // 상세 조회 때만

    public Long getRepairId() {
        return repairId;
    }

    public void setRepairId(Long repairId) {
        this.repairId = repairId;
    }

    public String getRepairNo() {
        return repairNo;
    }

    public void setRepairNo(String repairNo) {
        this.repairNo = repairNo;
    }

    public Long getEquipId() {
        return equipId;
    }

    public void setEquipId(Long equipId) {
        this.equipId = equipId;
    }

    public LocalDateTime getFailDt() {
        return failDt;
    }

    public void setFailDt(LocalDateTime failDt) {
        this.failDt = failDt;
    }

    public String getFailType() {
        return failType;
    }

    public void setFailType(String failType) {
        this.failType = failType;
    }

    public String getAlarmCode() {
        return alarmCode;
    }

    public void setAlarmCode(String alarmCode) {
        this.alarmCode = alarmCode;
    }

    public String getSymptom() {
        return symptom;
    }

    public void setSymptom(String symptom) {
        this.symptom = symptom;
    }

    public String getCause() {
        return cause;
    }

    public void setCause(String cause) {
        this.cause = cause;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getRepairerName() {
        return repairerName;
    }

    public void setRepairerName(String repairerName) {
        this.repairerName = repairerName;
    }

    public String getRepairKind() {
        return repairKind;
    }

    public void setRepairKind(String repairKind) {
        this.repairKind = repairKind;
    }

    public String getVendorName() {
        return vendorName;
    }

    public void setVendorName(String vendorName) {
        this.vendorName = vendorName;
    }

    public LocalDateTime getStartDt() {
        return startDt;
    }

    public void setStartDt(LocalDateTime startDt) {
        this.startDt = startDt;
    }

    public LocalDateTime getEndDt() {
        return endDt;
    }

    public void setEndDt(LocalDateTime endDt) {
        this.endDt = endDt;
    }

    public LocalDateTime getRecoverDt() {
        return recoverDt;
    }

    public void setRecoverDt(LocalDateTime recoverDt) {
        this.recoverDt = recoverDt;
    }

    public String getTestResult() {
        return testResult;
    }

    public void setTestResult(String testResult) {
        this.testResult = testResult;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Long getPartCost() {
        return partCost;
    }

    public void setPartCost(Long partCost) {
        this.partCost = partCost;
    }

    public Long getOutsourceCost() {
        return outsourceCost;
    }

    public void setOutsourceCost(Long outsourceCost) {
        this.outsourceCost = outsourceCost;
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

    public Long getTotalCost() {
        return totalCost;
    }

    public void setTotalCost(Long totalCost) {
        this.totalCost = totalCost;
    }

    public Long getDownMin() {
        return downMin;
    }

    public void setDownMin(Long downMin) {
        this.downMin = downMin;
    }

    public Long getWorkMin() {
        return workMin;
    }

    public void setWorkMin(Long workMin) {
        this.workMin = workMin;
    }

    public Integer getAttachCount() {
        return attachCount;
    }

    public void setAttachCount(Integer attachCount) {
        this.attachCount = attachCount;
    }

    public Integer getPartCount() {
        return partCount;
    }

    public void setPartCount(Integer partCount) {
        this.partCount = partCount;
    }

    public List<RepairPart> getParts() {
        return parts;
    }

    public void setParts(List<RepairPart> parts) {
        this.parts = parts;
    }

    public List<EquipAttach> getAttachments() {
        return attachments;
    }

    public void setAttachments(List<EquipAttach> attachments) {
        this.attachments = attachments;
    }
}
