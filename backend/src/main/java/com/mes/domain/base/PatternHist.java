package com.mes.domain.base;

import java.time.LocalDateTime;

/**
 * 기준정보 > 패턴관리 변경 이력 (base_pattern_hist) 1건.
 *
 * <p>등록/삭제는 한 줄(fieldLabel 빈 값), 수정은 바뀐 항목마다 한 줄.</p>
 */
public class PatternHist {

    private Long histId; // PK
    private Long patternId;
    private String patternCode;
    private String action; // 등록 | 수정 | 삭제
    private String fieldLabel; // 바뀐 항목
    private String beforeValue;
    private String afterValue;
    private String userName;
    private LocalDateTime regDt;

    public Long getHistId() {
        return histId;
    }

    public void setHistId(Long histId) {
        this.histId = histId;
    }

    public Long getPatternId() {
        return patternId;
    }

    public void setPatternId(Long patternId) {
        this.patternId = patternId;
    }

    public String getPatternCode() {
        return patternCode;
    }

    public void setPatternCode(String patternCode) {
        this.patternCode = patternCode;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getFieldLabel() {
        return fieldLabel;
    }

    public void setFieldLabel(String fieldLabel) {
        this.fieldLabel = fieldLabel;
    }

    public String getBeforeValue() {
        return beforeValue;
    }

    public void setBeforeValue(String beforeValue) {
        this.beforeValue = beforeValue;
    }

    public String getAfterValue() {
        return afterValue;
    }

    public void setAfterValue(String afterValue) {
        this.afterValue = afterValue;
    }

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }

    public LocalDateTime getRegDt() {
        return regDt;
    }

    public void setRegDt(LocalDateTime regDt) {
        this.regDt = regDt;
    }
}
