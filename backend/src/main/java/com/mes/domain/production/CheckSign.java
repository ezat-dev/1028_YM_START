package com.mes.domain.production;

import java.time.LocalDateTime;

/** CHECK SHEET 서명 — 담당/검토/승인/확인/협조팀 */
public class CheckSign {

    private Long sheetId;
    private String slot;
    private String userId;
    private String signName;
    private String signImg;
    private LocalDateTime signDt;

    public Long getSheetId() {
        return sheetId;
    }

    public void setSheetId(Long sheetId) {
        this.sheetId = sheetId;
    }

    public String getSlot() {
        return slot;
    }

    public void setSlot(String slot) {
        this.slot = slot;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getSignName() {
        return signName;
    }

    public void setSignName(String signName) {
        this.signName = signName;
    }

    public String getSignImg() {
        return signImg;
    }

    public void setSignImg(String signImg) {
        this.signImg = signImg;
    }

    public LocalDateTime getSignDt() {
        return signDt;
    }

    public void setSignDt(LocalDateTime signDt) {
        this.signDt = signDt;
    }
}
