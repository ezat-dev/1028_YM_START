package com.mes.domain.production;

import java.util.List;

/** CHECK SHEET 행의 경도(표면/심부) — 값은 경도측정 테이블에 저장 */
public class CheckHardness {

    private String itemName; // 표면 경도 / 심부 경도
    private Long specId;
    private Long measId;
    private String judgement;
    private List<java.math.BigDecimal> values; // X1~X5 (빈 칸은 null)

    public String getItemName() {
        return itemName;
    }

    public void setItemName(String itemName) {
        this.itemName = itemName;
    }

    public Long getSpecId() {
        return specId;
    }

    public void setSpecId(Long specId) {
        this.specId = specId;
    }

    public Long getMeasId() {
        return measId;
    }

    public void setMeasId(Long measId) {
        this.measId = measId;
    }

    public String getJudgement() {
        return judgement;
    }

    public void setJudgement(String judgement) {
        this.judgement = judgement;
    }

    public List<java.math.BigDecimal> getValues() {
        return values;
    }

    public void setValues(List<java.math.BigDecimal> values) {
        this.values = values;
    }
}
