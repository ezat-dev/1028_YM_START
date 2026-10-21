package com.mes.domain.quality;

import java.util.List;

/** 경도 측정 세트(초물/중물/종물) — CPK 부분군 하나 */
public class HardnessSet {

    private Long setId;
    private Long measId;
    private String setType; // 초물 | 중물 | 종물
    private Integer seq;
    private List<HardnessValue> values; // 경도1~n

    public Long getSetId() {
        return setId;
    }

    public void setSetId(Long setId) {
        this.setId = setId;
    }

    public Long getMeasId() {
        return measId;
    }

    public void setMeasId(Long measId) {
        this.measId = measId;
    }

    public String getSetType() {
        return setType;
    }

    public void setSetType(String setType) {
        this.setType = setType;
    }

    public Integer getSeq() {
        return seq;
    }

    public void setSeq(Integer seq) {
        this.seq = seq;
    }

    public List<HardnessValue> getValues() {
        return values;
    }

    public void setValues(List<HardnessValue> values) {
        this.values = values;
    }
}
