package com.mes.domain.quality;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 경도 측정값 1개(quality_hardness_value) — 경도1~n 중 한 칸 */
public class HardnessValue {

    private Long valueId;
    private Long setId;
    private Integer idx; // 1~n
    private BigDecimal value;
    private String source; // AUTO | MANUAL
    private String deviceId;
    private LocalDateTime measuredAt;

    public Long getValueId() {
        return valueId;
    }

    public void setValueId(Long valueId) {
        this.valueId = valueId;
    }

    public Long getSetId() {
        return setId;
    }

    public void setSetId(Long setId) {
        this.setId = setId;
    }

    public Integer getIdx() {
        return idx;
    }

    public void setIdx(Integer idx) {
        this.idx = idx;
    }

    public BigDecimal getValue() {
        return value;
    }

    public void setValue(BigDecimal value) {
        this.value = value;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public LocalDateTime getMeasuredAt() {
        return measuredAt;
    }

    public void setMeasuredAt(LocalDateTime measuredAt) {
        this.measuredAt = measuredAt;
    }
}
