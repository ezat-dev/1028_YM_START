package com.mes.domain.base;

import java.time.LocalDateTime;

/**
 * 기준정보 > 비가동관리 — 비가동 사유 기준정보 (base_downtime_reason) 1건.
 *
 * <p>구분: 계획정지 | 고장정지 | 대기 | 기타. 수동 등록 화면의 사유 선택 목록이 된다.</p>
 */
public class DowntimeReason {

    private Long reasonId; // PK
    private String reasonCode; // 사유코드 (비워서 등록하면 DR001 형식으로 채번)
    private String reasonName; // 사유명
    private String reasonType; // 계획정지 | 고장정지 | 대기 | 기타
    private Integer sortOrder; // 선택 목록 순서
    private String remark; // 비고
    private String useYn; // 사용여부 Y/N
    private String regUserId; // 등록자 로그인 ID
    private String regUserName; // 등록자
    private String updUserId; // 마지막 수정자 로그인 ID
    private String updUserName; // 마지막 수정자
    private Long useCount; // 이 사유로 등록된 비가동 건수(목록 조회 때만)
    private LocalDateTime regDt;
    private LocalDateTime updDt;

    public Long getReasonId() {
        return reasonId;
    }

    public void setReasonId(Long reasonId) {
        this.reasonId = reasonId;
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

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }

    public String getUseYn() {
        return useYn;
    }

    public void setUseYn(String useYn) {
        this.useYn = useYn;
    }

    public String getRegUserName() {
        return regUserName;
    }

    public void setRegUserName(String regUserName) {
        this.regUserName = regUserName;
    }

    public Long getUseCount() {
        return useCount;
    }

    public void setUseCount(Long useCount) {
        this.useCount = useCount;
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

    public String getUpdUserName() {
        return updUserName;
    }

    public void setUpdUserName(String updUserName) {
        this.updUserName = updUserName;
    }
}
