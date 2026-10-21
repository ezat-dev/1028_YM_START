package com.mes.domain.condition;

import java.time.LocalDateTime;

/** 설비점검표 양식 — 머리(제목/설비명/모델NO)와 범례·주기 범례·결재란·하단 문구 */
public class EquipCheckSheet {

    private Long sheetId;
    private String title;
    private String equipName;
    private String modelNo;
    private String legendJson; // 범례 JSON [{"mark":"○","label":"양호"},…] — 첫 번째가 양호
    private String cycleJson; // 주기 범례 JSON [{"code":"D","label":"매일"},…]
    private String signJson; // 결재란 이름 JSON ["담당","검토","확인"]
    private String footerNote;
    private Integer sortOrder;
    private String useYn;
    private String regUserId;
    private String regUserName;
    private LocalDateTime regDt;
    private String updUserId;
    private String updUserName;
    private LocalDateTime updDt;
    private Long copyFromId; // 새 점검표를 만들 때 항목·범례를 복사해 올 점검표(요청에만 씀)
    private Integer itemCount; // 목록용: 사용 중 항목 수
    private Integer todayDone; // 목록용: 오늘 기록한 항목 수
    private Integer monthIssueCount; // 목록용: 이번 달 양호가 아닌 기록 수
    private LocalDateTime lastCheckedDt; // 목록용: 마지막 점검 시각

    public Long getSheetId() {
        return sheetId;
    }

    public void setSheetId(Long sheetId) {
        this.sheetId = sheetId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getEquipName() {
        return equipName;
    }

    public void setEquipName(String equipName) {
        this.equipName = equipName;
    }

    public String getModelNo() {
        return modelNo;
    }

    public void setModelNo(String modelNo) {
        this.modelNo = modelNo;
    }

    public String getLegendJson() {
        return legendJson;
    }

    public void setLegendJson(String legendJson) {
        this.legendJson = legendJson;
    }

    public String getCycleJson() {
        return cycleJson;
    }

    public void setCycleJson(String cycleJson) {
        this.cycleJson = cycleJson;
    }

    public String getSignJson() {
        return signJson;
    }

    public void setSignJson(String signJson) {
        this.signJson = signJson;
    }

    public String getFooterNote() {
        return footerNote;
    }

    public void setFooterNote(String footerNote) {
        this.footerNote = footerNote;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }

    public String getUseYn() {
        return useYn;
    }

    public void setUseYn(String useYn) {
        this.useYn = useYn;
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

    public Long getCopyFromId() {
        return copyFromId;
    }

    public void setCopyFromId(Long copyFromId) {
        this.copyFromId = copyFromId;
    }

    public Integer getItemCount() {
        return itemCount;
    }

    public void setItemCount(Integer itemCount) {
        this.itemCount = itemCount;
    }

    public Integer getTodayDone() {
        return todayDone;
    }

    public void setTodayDone(Integer todayDone) {
        this.todayDone = todayDone;
    }

    public Integer getMonthIssueCount() {
        return monthIssueCount;
    }

    public void setMonthIssueCount(Integer monthIssueCount) {
        this.monthIssueCount = monthIssueCount;
    }

    public LocalDateTime getLastCheckedDt() {
        return lastCheckedDt;
    }

    public void setLastCheckedDt(LocalDateTime lastCheckedDt) {
        this.lastCheckedDt = lastCheckedDt;
    }
}
