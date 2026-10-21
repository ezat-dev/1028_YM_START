package com.mes.domain.condition;

import java.time.LocalDateTime;

/** 설비점검표 월 기록 — 머리의 점검자, 특기사항, 결재 1~3(담당/검토/확인) */
public class EquipCheckMonth {

    private Long monthId;
    private Long sheetId;
    private String ym;
    private String inspectorName;
    private String remark;
    private String sign1UserId;
    private String sign1Name;
    private LocalDateTime sign1Dt;
    private String sign1Img; // 서명 이미지(PNG data URL) — 없으면 이름만
    private String sign2UserId;
    private String sign2Name;
    private LocalDateTime sign2Dt;
    private String sign2Img; // 서명 이미지(PNG data URL) — 없으면 이름만
    private String sign3UserId;
    private String sign3Name;
    private LocalDateTime sign3Dt;
    private String sign3Img; // 서명 이미지(PNG data URL) — 없으면 이름만

    public Long getMonthId() {
        return monthId;
    }

    public void setMonthId(Long monthId) {
        this.monthId = monthId;
    }

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

    public String getInspectorName() {
        return inspectorName;
    }

    public void setInspectorName(String inspectorName) {
        this.inspectorName = inspectorName;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }

    public String getSign1UserId() {
        return sign1UserId;
    }

    public void setSign1UserId(String sign1UserId) {
        this.sign1UserId = sign1UserId;
    }

    public String getSign1Name() {
        return sign1Name;
    }

    public void setSign1Name(String sign1Name) {
        this.sign1Name = sign1Name;
    }

    public LocalDateTime getSign1Dt() {
        return sign1Dt;
    }

    public void setSign1Dt(LocalDateTime sign1Dt) {
        this.sign1Dt = sign1Dt;
    }

    public String getSign2UserId() {
        return sign2UserId;
    }

    public void setSign2UserId(String sign2UserId) {
        this.sign2UserId = sign2UserId;
    }

    public String getSign2Name() {
        return sign2Name;
    }

    public void setSign2Name(String sign2Name) {
        this.sign2Name = sign2Name;
    }

    public LocalDateTime getSign2Dt() {
        return sign2Dt;
    }

    public void setSign2Dt(LocalDateTime sign2Dt) {
        this.sign2Dt = sign2Dt;
    }

    public String getSign3UserId() {
        return sign3UserId;
    }

    public void setSign3UserId(String sign3UserId) {
        this.sign3UserId = sign3UserId;
    }

    public String getSign3Name() {
        return sign3Name;
    }

    public void setSign3Name(String sign3Name) {
        this.sign3Name = sign3Name;
    }

    public LocalDateTime getSign3Dt() {
        return sign3Dt;
    }

    public void setSign3Dt(LocalDateTime sign3Dt) {
        this.sign3Dt = sign3Dt;
    }

    public String getSign1Img() {
        return sign1Img;
    }

    public void setSign1Img(String sign1Img) {
        this.sign1Img = sign1Img;
    }

    public String getSign2Img() {
        return sign2Img;
    }

    public void setSign2Img(String sign2Img) {
        this.sign2Img = sign2Img;
    }

    public String getSign3Img() {
        return sign3Img;
    }

    public void setSign3Img(String sign3Img) {
        this.sign3Img = sign3Img;
    }
}
