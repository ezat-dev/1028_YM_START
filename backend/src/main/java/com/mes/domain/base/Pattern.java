package com.mes.domain.base;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 기준정보 > 패턴관리 (base_pattern) 1건 — 제품별 열처리 조건.
 *
 * <p>vendor*, partNo, productName, spec, material, 경도 필드는 base_product/base_vendor 조인 결과(읽기 전용).</p>
 */
public class Pattern {

    private Long patternId; // PK
    private String patternCode; // 패턴코드 (비워서 등록하면 PT0001 형식으로 채번)
    private String patternName; // 패턴명
    private Long productId; // 제품 FK
    private BigDecimal chargeWeightKg; // 장입량 kg
    private BigDecimal q1Zone; // 퀜칭로 1존 ℃
    private BigDecimal q2Zone; // 퀜칭로 2존 ℃
    private BigDecimal q3Zone; // 퀜칭로 3존 ℃
    private BigDecimal q4Zone; // 퀜칭로 4존 ℃
    private BigDecimal q5Zone; // 퀜칭로 5존 ℃
    private BigDecimal quenchSpeed; // 퀜칭로 속도
    private BigDecimal cp; // 카본포텐셜 %
    private BigDecimal t1Zone; // 템퍼링로 1존 ℃
    private BigDecimal t2Zone; // 템퍼링로 2존 ℃
    private BigDecimal t3Zone; // 템퍼링로 3존 ℃
    private BigDecimal t4Zone; // 템퍼링로 4존 ℃
    private BigDecimal t5Zone; // 템퍼링로 5존 ℃
    private BigDecimal temperSpeed; // 템퍼링로 속도
    private String speedUnit; // Hz | mm/min | m/h
    private String remark; // 비고
    private String useYn; // 사용여부 Y/N
    private String regUserName; // 등록자
    private String updUserName; // 최종 수정자
    private LocalDateTime regDt;
    private LocalDateTime updDt;
    private String productCode; // 조인: 제품코드
    private String partNo; // 조인: 품번
    private String productName; // 조인: 품명
    private String spec; // 조인: 규격
    private String material; // 조인: 재질
    private BigDecimal surfaceHardMin; // 조인: 표면경도 하한
    private BigDecimal surfaceHardMax; // 조인: 표면경도 상한
    private String surfaceHardUnit; // 조인
    private BigDecimal coreHardMin; // 조인: 심부경도 하한
    private BigDecimal coreHardMax; // 조인: 심부경도 상한
    private String coreHardUnit; // 조인
    private Long vendorId; // 조인: 거래처 FK
    private String vendorCode; // 조인: 거래처코드
    private String vendorName; // 조인: 거래처명

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

    public String getPatternName() {
        return patternName;
    }

    public void setPatternName(String patternName) {
        this.patternName = patternName;
    }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public BigDecimal getChargeWeightKg() {
        return chargeWeightKg;
    }

    public void setChargeWeightKg(BigDecimal chargeWeightKg) {
        this.chargeWeightKg = chargeWeightKg;
    }

    public BigDecimal getQ1Zone() {
        return q1Zone;
    }

    public void setQ1Zone(BigDecimal q1Zone) {
        this.q1Zone = q1Zone;
    }

    public BigDecimal getQ2Zone() {
        return q2Zone;
    }

    public void setQ2Zone(BigDecimal q2Zone) {
        this.q2Zone = q2Zone;
    }

    public BigDecimal getQ3Zone() {
        return q3Zone;
    }

    public void setQ3Zone(BigDecimal q3Zone) {
        this.q3Zone = q3Zone;
    }

    public BigDecimal getQ4Zone() {
        return q4Zone;
    }

    public void setQ4Zone(BigDecimal q4Zone) {
        this.q4Zone = q4Zone;
    }

    public BigDecimal getQ5Zone() {
        return q5Zone;
    }

    public void setQ5Zone(BigDecimal q5Zone) {
        this.q5Zone = q5Zone;
    }

    public BigDecimal getQuenchSpeed() {
        return quenchSpeed;
    }

    public void setQuenchSpeed(BigDecimal quenchSpeed) {
        this.quenchSpeed = quenchSpeed;
    }

    public BigDecimal getCp() {
        return cp;
    }

    public void setCp(BigDecimal cp) {
        this.cp = cp;
    }

    public BigDecimal getT1Zone() {
        return t1Zone;
    }

    public void setT1Zone(BigDecimal t1Zone) {
        this.t1Zone = t1Zone;
    }

    public BigDecimal getT2Zone() {
        return t2Zone;
    }

    public void setT2Zone(BigDecimal t2Zone) {
        this.t2Zone = t2Zone;
    }

    public BigDecimal getT3Zone() {
        return t3Zone;
    }

    public void setT3Zone(BigDecimal t3Zone) {
        this.t3Zone = t3Zone;
    }

    public BigDecimal getT4Zone() {
        return t4Zone;
    }

    public void setT4Zone(BigDecimal t4Zone) {
        this.t4Zone = t4Zone;
    }

    public BigDecimal getT5Zone() {
        return t5Zone;
    }

    public void setT5Zone(BigDecimal t5Zone) {
        this.t5Zone = t5Zone;
    }

    public BigDecimal getTemperSpeed() {
        return temperSpeed;
    }

    public void setTemperSpeed(BigDecimal temperSpeed) {
        this.temperSpeed = temperSpeed;
    }

    public String getSpeedUnit() {
        return speedUnit;
    }

    public void setSpeedUnit(String speedUnit) {
        this.speedUnit = speedUnit;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }

    public String getUseYn() {
        return useYn;
    }

    public void setUseYn(String useYn) {
        this.useYn = useYn;
    }

    public String getRegUserName() {
        return regUserName;
    }

    public void setRegUserName(String regUserName) {
        this.regUserName = regUserName;
    }

    public String getUpdUserName() {
        return updUserName;
    }

    public void setUpdUserName(String updUserName) {
        this.updUserName = updUserName;
    }

    public LocalDateTime getRegDt() {
        return regDt;
    }

    public void setRegDt(LocalDateTime regDt) {
        this.regDt = regDt;
    }

    public LocalDateTime getUpdDt() {
        return updDt;
    }

    public void setUpdDt(LocalDateTime updDt) {
        this.updDt = updDt;
    }

    public String getProductCode() {
        return productCode;
    }

    public void setProductCode(String productCode) {
        this.productCode = productCode;
    }

    public String getPartNo() {
        return partNo;
    }

    public void setPartNo(String partNo) {
        this.partNo = partNo;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }

    public String getSpec() {
        return spec;
    }

    public void setSpec(String spec) {
        this.spec = spec;
    }

    public String getMaterial() {
        return material;
    }

    public void setMaterial(String material) {
        this.material = material;
    }

    public BigDecimal getSurfaceHardMin() {
        return surfaceHardMin;
    }

    public void setSurfaceHardMin(BigDecimal surfaceHardMin) {
        this.surfaceHardMin = surfaceHardMin;
    }

    public BigDecimal getSurfaceHardMax() {
        return surfaceHardMax;
    }

    public void setSurfaceHardMax(BigDecimal surfaceHardMax) {
        this.surfaceHardMax = surfaceHardMax;
    }

    public String getSurfaceHardUnit() {
        return surfaceHardUnit;
    }

    public void setSurfaceHardUnit(String surfaceHardUnit) {
        this.surfaceHardUnit = surfaceHardUnit;
    }

    public BigDecimal getCoreHardMin() {
        return coreHardMin;
    }

    public void setCoreHardMin(BigDecimal coreHardMin) {
        this.coreHardMin = coreHardMin;
    }

    public BigDecimal getCoreHardMax() {
        return coreHardMax;
    }

    public void setCoreHardMax(BigDecimal coreHardMax) {
        this.coreHardMax = coreHardMax;
    }

    public String getCoreHardUnit() {
        return coreHardUnit;
    }

    public void setCoreHardUnit(String coreHardUnit) {
        this.coreHardUnit = coreHardUnit;
    }

    public Long getVendorId() {
        return vendorId;
    }

    public void setVendorId(Long vendorId) {
        this.vendorId = vendorId;
    }

    public String getVendorCode() {
        return vendorCode;
    }

    public void setVendorCode(String vendorCode) {
        this.vendorCode = vendorCode;
    }

    public String getVendorName() {
        return vendorName;
    }

    public void setVendorName(String vendorName) {
        this.vendorName = vendorName;
    }
}
