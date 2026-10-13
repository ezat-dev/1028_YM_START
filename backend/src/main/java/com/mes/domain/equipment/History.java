package com.mes.domain.equipment;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 설비관리 > 설비이력관리 (equipment_history) 1건 — 설비 생애주기 기록(점검·교체·변경·설치·개조·수리·기타).
 *
 * <p>repairId가 있으면 수리이력이 '완료'될 때 자동으로 만들어진 행이라 여기서는 고치지 않는다(수리이력에서 관리).</p>
 */
public class History {

    private Long histId; // PK
    private String histNo; // 이력번호 EQH-YYYYMM-NNN
    private Long equipId; // 설비
    private String histType; // 점검 | 교체 | 변경 | 설치 | 개조 | 수리 | 기타
    private String title; // 이력 제목
    private String content; // 작업 내용
    private LocalDateTime workDt; // 발생(작업)일시
    private String workerName; // 작업자
    private Long repairId; // 연결된 수리이력(자동 생성 행)
    private String regUserId; // 등록자 로그인 ID
    private String regUserName; // 등록자
    private String updUserId; // 마지막 수정자 로그인 ID
    private String updUserName; // 마지막 수정자
    private LocalDateTime regDt;
    private LocalDateTime updDt;
    private String equipCode; // 조회용
    private String equipName; // 조회용
    private String repairNo; // 조회용: 연결된 수리번호
    private Integer attachCount; // 조회용: 첨부 개수
    private List<EquipAttach> attachments; // 상세 조회 때만

    public Long getHistId() {
        return histId;
    }

    public void setHistId(Long histId) {
        this.histId = histId;
    }

    public String getHistNo() {
        return histNo;
    }

    public void setHistNo(String histNo) {
        this.histNo = histNo;
    }

    public Long getEquipId() {
        return equipId;
    }

    public void setEquipId(Long equipId) {
        this.equipId = equipId;
    }

    public String getHistType() {
        return histType;
    }

    public void setHistType(String histType) {
        this.histType = histType;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public LocalDateTime getWorkDt() {
        return workDt;
    }

    public void setWorkDt(LocalDateTime workDt) {
        this.workDt = workDt;
    }

    public String getWorkerName() {
        return workerName;
    }

    public void setWorkerName(String workerName) {
        this.workerName = workerName;
    }

    public Long getRepairId() {
        return repairId;
    }

    public void setRepairId(Long repairId) {
        this.repairId = repairId;
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

    public String getRepairNo() {
        return repairNo;
    }

    public void setRepairNo(String repairNo) {
        this.repairNo = repairNo;
    }

    public Integer getAttachCount() {
        return attachCount;
    }

    public void setAttachCount(Integer attachCount) {
        this.attachCount = attachCount;
    }

    public List<EquipAttach> getAttachments() {
        return attachments;
    }

    public void setAttachments(List<EquipAttach> attachments) {
        this.attachments = attachments;
    }
}
