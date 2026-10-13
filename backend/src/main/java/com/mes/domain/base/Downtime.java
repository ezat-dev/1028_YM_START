package com.mes.domain.base;

import java.time.LocalDateTime;

/**
 * 기준정보 > 비가동관리 — 비가동 내역 (base_downtime) 1건. 설비 1대당 1건.
 *
 * <p>endDt가 null이면 진행 중. 목록 조회 때는 설비·사유 정보와 지속 시간(분)을 같이 채운다.</p>
 */
public class Downtime {

    private Long downtimeId; // PK
    private Long equipId; // 설비
    private Long reasonId; // 사유
    private LocalDateTime startDt; // 시작
    private LocalDateTime endDt; // 종료 (null = 진행 중)
    private String source; // MANUAL(수동) | PLC(신호 — 추후)
    private String memo; // 메모
    private String regUserId; // 등록자 로그인 ID
    private String regUserName; // 등록자
    private String updUserId; // 마지막 수정자 로그인 ID
    private String updUserName; // 수정자
    private LocalDateTime regDt;
    private LocalDateTime updDt;
    private String equipCode; // 조회용: 설비코드
    private String equipName; // 조회용: 설비명
    private String reasonCode; // 조회용: 사유코드
    private String reasonName; // 조회용: 사유명
    private String reasonType; // 조회용: 사유 구분
    private Long durationMin; // 조회용: 지속 시간(분) — 진행 중이면 지금까지

    public Long getDowntimeId() {
        return downtimeId;
    }

    public void setDowntimeId(Long downtimeId) {
        this.downtimeId = downtimeId;
    }

    public Long getEquipId() {
        return equipId;
    }

    public void setEquipId(Long equipId) {
        this.equipId = equipId;
    }

    public Long getReasonId() {
        return reasonId;
    }

    public void setReasonId(Long reasonId) {
        this.reasonId = reasonId;
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

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getMemo() {
        return memo;
    }

    public void setMemo(String memo) {
        this.memo = memo;
    }

    public String getRegUserName() {
        return regUserName;
    }

    public void setRegUserName(String regUserName) {
        this.regUserName = regUserName;
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

    public String getReasonCode() {
        return reasonCode;
    }

    public void setReasonCode(String reasonCode) {
        this.reasonCode = reasonCode;
    }

    public String getReasonName() {
        return reasonName;
    }

    public void setReasonName(String reasonName) {
        this.reasonName = reasonName;
    }

    public String getReasonType() {
        return reasonType;
    }

    public void setReasonType(String reasonType) {
        this.reasonType = reasonType;
    }

    public Long getDurationMin() {
        return durationMin;
    }

    public void setDurationMin(Long durationMin) {
        this.durationMin = durationMin;
    }

    public String getRegUserId() {
        return regUserId;
    }

    public void setRegUserId(String regUserId) {
        this.regUserId = regUserId;
    }

    public String getUpdUserId() {
        return updUserId;
    }

    public void setUpdUserId(String updUserId) {
        this.updUserId = updUserId;
    }
}
