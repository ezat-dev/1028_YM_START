package com.mes.domain.base;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 기준정보 > 제품관리 (base_product) 1건.
 *
 * <p>vendorCode/vendorName은 base_vendor 조인 결과(읽기 전용), images는 base_product_image 목록이다.</p>
 */
public class Product {

    private Long productId; // PK
    private String productCode; // 제품코드 (비워서 등록하면 P0001 형식으로 채번)
    private Long vendorId; // 거래처 FK
    private String vendorCode; // 조인: 거래처코드
    private String vendorName; // 조인: 거래처명
    private String partNo; // 품번
    private String productName; // 품명
    private String material; // 재질
    private String spec; // 규격
    private BigDecimal chargeWeightKg; // 1회 장입량 kg
    private BigDecimal unitWeightG; // 개당 중량 g
    private BigDecimal unitPrice; // 단가 (원)
    private String priceUnit; // 단가 기준 KG | EA
    private BigDecimal surfaceHardMin; // 표면경도 하한
    private BigDecimal surfaceHardMax; // 표면경도 상한
    private String surfaceHardUnit; // HRC | HV | HB | HRB
    private BigDecimal coreHardMin; // 심부경도 하한
    private BigDecimal coreHardMax; // 심부경도 상한
    private String coreHardUnit; // HRC | HV | HB | HRB
    private String remark; // 비고
    private String useYn; // 사용여부 Y/N
    private String regUserName; // 등록자
    private LocalDateTime regDt;
    private LocalDateTime updDt;
    private List<ProductImage> images; // 이미지 (slot 순)

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public String getProductCode() {
        return productCode;
    }

    public void setProductCode(String productCode) {
        this.productCode = productCode;
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

    public String getMaterial() {
        return material;
    }

    public void setMaterial(String material) {
        this.material = material;
    }

    public String getSpec() {
        return spec;
    }

    public void setSpec(String spec) {
        this.spec = spec;
    }

    public BigDecimal getChargeWeightKg() {
        return chargeWeightKg;
    }

    public void setChargeWeightKg(BigDecimal chargeWeightKg) {
        this.chargeWeightKg = chargeWeightKg;
    }

    public BigDecimal getUnitWeightG() {
        return unitWeightG;
    }

    public void setUnitWeightG(BigDecimal unitWeightG) {
        this.unitWeightG = unitWeightG;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public void setUnitPrice(BigDecimal unitPrice) {
        this.unitPrice = unitPrice;
    }

    public String getPriceUnit() {
        return priceUnit;
    }

    public void setPriceUnit(String priceUnit) {
        this.priceUnit = priceUnit;
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

    public List<ProductImage> getImages() {
        return images;
    }

    public void setImages(List<ProductImage> images) {
        this.images = images;
    }
}
