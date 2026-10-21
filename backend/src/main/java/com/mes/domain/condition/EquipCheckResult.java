package com.mes.domain.condition;

import java.time.LocalDateTime;

/** 설비점검표 일별 결과 — 항목 × 날짜 한 칸 */
public class EquipCheckResult {

    private Long resultId;
    private Long itemId;
    private String ym;
    private Integer day;
    private String mark;
    private String userId;
    private String userName;
    private LocalDateTime checkedDt;

    public Long getResultId() {
        return resultId;
    }

    public void setResultId(Long resultId) {
        this.resultId = resultId;
    }

    public Long getItemId() {
        return itemId;
    }

    public void setItemId(Long itemId) {
        this.itemId = itemId;
    }

    public String getYm() {
        return ym;
    }

    public void setYm(String ym) {
        this.ym = ym;
    }

    public Integer getDay() {
        return day;
    }

    public void setDay(Integer day) {
        this.day = day;
    }

    public String getMark() {
        return mark;
    }

    public void setMark(String mark) {
        this.mark = mark;
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

    public LocalDateTime getCheckedDt() {
        return checkedDt;
    }

    public void setCheckedDt(LocalDateTime checkedDt) {
        this.checkedDt = checkedDt;
    }
}
