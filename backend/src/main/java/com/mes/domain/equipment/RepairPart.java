package com.mes.domain.equipment;

import java.math.BigDecimal;

/**
 * 수리 때 교체한 부품 (equipment_repair_part) 1건.
 */
public class RepairPart {

    private Long partId; // PK
    private Long repairId;
    private String partName; // 부품명
    private String partNo; // 품번
    private BigDecimal qty; // 수량
    private Integer sortOrder;

    public Long getPartId() {
        return partId;
    }

    public void setPartId(Long partId) {
        this.partId = partId;
    }

    public Long getRepairId() {
        return repairId;
    }

    public void setRepairId(Long repairId) {
        this.repairId = repairId;
    }

    public String getPartName() {
        return partName;
    }

    public void setPartName(String partName) {
        this.partName = partName;
    }

    public String getPartNo() {
        return partNo;
    }

    public void setPartNo(String partNo) {
        this.partNo = partNo;
    }

    public BigDecimal getQty() {
        return qty;
    }

    public void setQty(BigDecimal qty) {
        this.qty = qty;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }
}
