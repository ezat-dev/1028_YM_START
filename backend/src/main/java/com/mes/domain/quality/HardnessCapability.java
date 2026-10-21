package com.mes.domain.quality;

import java.util.List;

/** 경도 공정능력 분석 결과 — CPK(부분군 내 σ = R̄/d₂)와 PPK(전체 σ)를 함께 담는다 */
public class HardnessCapability {

    private HardnessSpec spec;
    private Integer subgroupSize; // n
    private Integer subgroupSizeMin; // 부분군 크기 최소(CHECK SHEET는 행마다 1~5개)
    private Integer subgroupSizeMax; // 부분군 크기 최대
    private Integer subgroupCount; // k
    private Integer totalCount; // N
    private Double mean; // X̄̄
    private Double rangeBar; // R̄
    private Double sigmaWithin; // R̄/d₂
    private Double sigmaOverall; // 전체 표준편차(n-1)
    private Double min;
    private Double max;
    private Double cp;
    private Double cpu;
    private Double cpl;
    private Double cpk;
    private Double pp;
    private Double ppu;
    private Double ppl;
    private Double ppk;
    private Double uclX; // X̄ 관리도
    private Double lclX;
    private Double uclR; // R 관리도
    private Double lclR;
    private Integer outOfSpec; // 규격 밖 값 수
    private Integer minSubgroups; // 신뢰할 만한 최소 부분군 수(25)
    private List<HardnessSubgroup> subgroups;

    public HardnessSpec getSpec() {
        return spec;
    }

    public void setSpec(HardnessSpec spec) {
        this.spec = spec;
    }

    public Integer getSubgroupSize() {
        return subgroupSize;
    }

    public void setSubgroupSize(Integer subgroupSize) {
        this.subgroupSize = subgroupSize;
    }

    public Integer getSubgroupCount() {
        return subgroupCount;
    }

    public void setSubgroupCount(Integer subgroupCount) {
        this.subgroupCount = subgroupCount;
    }

    public Integer getTotalCount() {
        return totalCount;
    }

    public void setTotalCount(Integer totalCount) {
        this.totalCount = totalCount;
    }

    public Double getMean() {
        return mean;
    }

    public void setMean(Double mean) {
        this.mean = mean;
    }

    public Double getRangeBar() {
        return rangeBar;
    }

    public void setRangeBar(Double rangeBar) {
        this.rangeBar = rangeBar;
    }

    public Double getSigmaWithin() {
        return sigmaWithin;
    }

    public void setSigmaWithin(Double sigmaWithin) {
        this.sigmaWithin = sigmaWithin;
    }

    public Double getSigmaOverall() {
        return sigmaOverall;
    }

    public void setSigmaOverall(Double sigmaOverall) {
        this.sigmaOverall = sigmaOverall;
    }

    public Double getMin() {
        return min;
    }

    public void setMin(Double min) {
        this.min = min;
    }

    public Double getMax() {
        return max;
    }

    public void setMax(Double max) {
        this.max = max;
    }

    public Double getCp() {
        return cp;
    }

    public void setCp(Double cp) {
        this.cp = cp;
    }

    public Double getCpu() {
        return cpu;
    }

    public void setCpu(Double cpu) {
        this.cpu = cpu;
    }

    public Double getCpl() {
        return cpl;
    }

    public void setCpl(Double cpl) {
        this.cpl = cpl;
    }

    public Double getCpk() {
        return cpk;
    }

    public void setCpk(Double cpk) {
        this.cpk = cpk;
    }

    public Double getPp() {
        return pp;
    }

    public void setPp(Double pp) {
        this.pp = pp;
    }

    public Double getPpu() {
        return ppu;
    }

    public void setPpu(Double ppu) {
        this.ppu = ppu;
    }

    public Double getPpl() {
        return ppl;
    }

    public void setPpl(Double ppl) {
        this.ppl = ppl;
    }

    public Double getPpk() {
        return ppk;
    }

    public void setPpk(Double ppk) {
        this.ppk = ppk;
    }

    public Double getUclX() {
        return uclX;
    }

    public void setUclX(Double uclX) {
        this.uclX = uclX;
    }

    public Double getLclX() {
        return lclX;
    }

    public void setLclX(Double lclX) {
        this.lclX = lclX;
    }

    public Double getUclR() {
        return uclR;
    }

    public void setUclR(Double uclR) {
        this.uclR = uclR;
    }

    public Double getLclR() {
        return lclR;
    }

    public void setLclR(Double lclR) {
        this.lclR = lclR;
    }

    public Integer getOutOfSpec() {
        return outOfSpec;
    }

    public void setOutOfSpec(Integer outOfSpec) {
        this.outOfSpec = outOfSpec;
    }

    public Integer getMinSubgroups() {
        return minSubgroups;
    }

    public void setMinSubgroups(Integer minSubgroups) {
        this.minSubgroups = minSubgroups;
    }

    public List<HardnessSubgroup> getSubgroups() {
        return subgroups;
    }

    public void setSubgroups(List<HardnessSubgroup> subgroups) {
        this.subgroups = subgroups;
    }

    public Integer getSubgroupSizeMin() {
        return subgroupSizeMin;
    }

    public void setSubgroupSizeMin(Integer subgroupSizeMin) {
        this.subgroupSizeMin = subgroupSizeMin;
    }

    public Integer getSubgroupSizeMax() {
        return subgroupSizeMax;
    }

    public void setSubgroupSizeMax(Integer subgroupSizeMax) {
        this.subgroupSizeMax = subgroupSizeMax;
    }
}
