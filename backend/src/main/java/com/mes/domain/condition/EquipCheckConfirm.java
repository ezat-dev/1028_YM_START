package com.mes.domain.condition;

import java.time.LocalDateTime;

/** 설비점검표 관리책임자 주간 확인(1~7, 8~14, 15~21, 22~28, 29~말일) */
public class EquipCheckConfirm {

    private Long sheetId;
    private String ym;
    private Integer weekNo;
    private String userId;
    private String userName; // 서명 이름
    private String signImg; // 서명 이미지(PNG data URL) — 없으면 이름만
    private LocalDateTime confirmDt;

    public Long getSheetId() {
        return sheetId;
    }

    public void setSheetId(Long sheetId) {
        this.sheetId = sheetId;
    }

    public String getYm() {
        return ym;
    }

    public void setYm(String ym) {
        this.ym = ym;
    }

    public Integer getWeekNo() {
        return weekNo;
    }

    public void setWeekNo(Integer weekNo) {
        this.weekNo = weekNo;
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

    public LocalDateTime getConfirmDt() {
        return confirmDt;
    }

    public void setConfirmDt(LocalDateTime confirmDt) {
        this.confirmDt = confirmDt;
    }

    public String getSignImg() {
        return signImg;
    }

    public void setSignImg(String signImg) {
        this.signImg = signImg;
    }
}
