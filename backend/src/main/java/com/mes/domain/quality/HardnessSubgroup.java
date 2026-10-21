package com.mes.domain.quality;

import java.time.LocalDateTime;
import java.util.List;

/** 공정능력 분석용 부분군(측정 세트 하나) */
public class HardnessSubgroup {

    private Long measId;
    private String measNo;
    private String lotNo;
    private String equipCode;
    private String setType;
    private Integer seq;
    private LocalDateTime measDt;
    private List<Double> values;
    private Double mean;
    private Double range;

    public Long getMeasId() {
        return measId;
    }

    public void setMeasId(Long measId) {
        this.measId = measId;
    }

    public String getMeasNo() {
        return measNo;
    }

    public void setMeasNo(String measNo) {
        this.measNo = measNo;
    }

    public String getLotNo() {
        return lotNo;
    }

    public void setLotNo(String lotNo) {
        this.lotNo = lotNo;
    }

    public String getEquipCode() {
        return equipCode;
    }

    public void setEquipCode(String equipCode) {
        this.equipCode = equipCode;
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

    public LocalDateTime getMeasDt() {
        return measDt;
    }

    public void setMeasDt(LocalDateTime measDt) {
        this.measDt = measDt;
    }

    public List<Double> getValues() {
        return values;
    }

    public void setValues(List<Double> values) {
        this.values = values;
    }

    public Double getMean() {
        return mean;
    }

    public void setMean(Double mean) {
        this.mean = mean;
    }

    public Double getRange() {
        return range;
    }

    public void setRange(Double range) {
        this.range = range;
    }
}
