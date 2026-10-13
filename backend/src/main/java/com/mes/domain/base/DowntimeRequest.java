package com.mes.domain.base;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 비가동 수동 등록 요청 — 설비를 여러 대 골라 같은 내용을 한 번에 등록한다(설비마다 1건씩 저장).
 */
public class DowntimeRequest {

    private List<Long> equipIds; // 등록할 설비들
    private Long reasonId; // 사유
    private LocalDateTime startDt; // 시작
    private LocalDateTime endDt; // 종료 (비우면 진행 중)
    private String memo; // 메모
    private String regUserId; // 등록자 로그인 ID
    private String regUserName; // 등록자

    public List<Long> getEquipIds() {
        return equipIds;
    }

    public void setEquipIds(List<Long> equipIds) {
        this.equipIds = equipIds;
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

    public String getRegUserId() {
        return regUserId;
    }

    public void setRegUserId(String regUserId) {
        this.regUserId = regUserId;
    }
}
