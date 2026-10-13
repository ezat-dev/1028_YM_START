package com.mes.domain.base;

import java.time.LocalDateTime;

/**
 * 기준정보 > 거래처관리 (base_vendor) 1건.
 *
 * <p>목록 화면은 코드/거래처명/구분/대표자/사업자번호/대표전화/담당자/사용여부/등록일만 쓰고,
 * 나머지(업태·종목·주소·담당자 이메일·팩스·비고)는 등록/수정 모달에서만 쓴다.</p>
 */
public class Vendor {

    private Long vendorId; // PK
    private String vendorCode; // 거래처코드 (비워서 등록하면 서버가 V0001 형식으로 채번)
    private String vendorName; // 거래처명
    private String vendorType; // 구분: 매출처 | 매입처 | 외주처 | 겸용
    private String ceoName; // 대표자
    private String bizNo; // 사업자번호 000-00-00000
    private String bizType; // 업태
    private String bizItem; // 종목
    private String tel; // 대표전화
    private String fax; // 팩스
    private String zipCode; // 우편번호
    private String address; // 기본주소
    private String addressDetail; // 상세주소
    private String managerName; // 담당자
    private String managerPhone; // 담당자 연락처
    private String managerEmail; // 담당자 이메일
    private String remark; // 비고
    private String useYn; // 사용여부 Y/N
    private String regUserName; // 등록자
    private LocalDateTime regDt;
    private LocalDateTime updDt;

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

    public String getVendorType() {
        return vendorType;
    }

    public void setVendorType(String vendorType) {
        this.vendorType = vendorType;
    }

    public String getCeoName() {
        return ceoName;
    }

    public void setCeoName(String ceoName) {
        this.ceoName = ceoName;
    }

    public String getBizNo() {
        return bizNo;
    }

    public void setBizNo(String bizNo) {
        this.bizNo = bizNo;
    }

    public String getBizType() {
        return bizType;
    }

    public void setBizType(String bizType) {
        this.bizType = bizType;
    }

    public String getBizItem() {
        return bizItem;
    }

    public void setBizItem(String bizItem) {
        this.bizItem = bizItem;
    }

    public String getTel() {
        return tel;
    }

    public void setTel(String tel) {
        this.tel = tel;
    }

    public String getFax() {
        return fax;
    }

    public void setFax(String fax) {
        this.fax = fax;
    }

    public String getZipCode() {
        return zipCode;
    }

    public void setZipCode(String zipCode) {
        this.zipCode = zipCode;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getAddressDetail() {
        return addressDetail;
    }

    public void setAddressDetail(String addressDetail) {
        this.addressDetail = addressDetail;
    }

    public String getManagerName() {
        return managerName;
    }

    public void setManagerName(String managerName) {
        this.managerName = managerName;
    }

    public String getManagerPhone() {
        return managerPhone;
    }

    public void setManagerPhone(String managerPhone) {
        this.managerPhone = managerPhone;
    }

    public String getManagerEmail() {
        return managerEmail;
    }

    public void setManagerEmail(String managerEmail) {
        this.managerEmail = managerEmail;
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
}
