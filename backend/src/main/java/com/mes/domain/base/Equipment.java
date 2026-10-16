package com.mes.domain.base;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 기준정보 > 설비관리 (base_equipment) 1건.
 *
 * <p>설비 상태는 가동 | 정지 | 고장 | 점검 | 유지보수. 비가동 내역(base_downtime)이 이 설비를 참조한다.</p>
 */
public class Equipment {

    private Long equipId; // PK
    private String equipCode; // 설비코드 (예: MBF1)
    private String equipName; // 설비명
    private String equipType; // 설비 유형
    private String maker; // 제조사
    private String modelName; // 모델명
    private String managerName; // 관리 담당자
    private LocalDate installDate; // 설치일
    private LocalDate startDate; // 가동 개시일
    private String equipStatus; // 가동 | 정지 | 고장 | 점검 | 유지보수
    private String plcModel; // PLC 모델
    private String plcIp; // PLC IP
    private String plcProtocol; // 통신방식
    private String remark; // 비고
    private String useYn; // 사용여부 Y/N
    private String regUserName; // 등록자
    private LocalDateTime regDt;
    private LocalDateTime updDt;

    public Long getEquipId() {
        return equipId;
    }

    public void setEquipId(Long equipId) {
        this.equipId = equipId;
    }

    public String getEquipCode() {
        return equipCode;
    }

    public void setEquipCode(String equipCode) {
        this.equipCode = equipCode;
    }

    public String getEquipName() {
        return equipName;
    }

    public void setEquipName(String equipName) {
        this.equipName = equipName;
    }

    public String getEquipType() {
        return equipType;
    }

    public void setEquipType(String equipType) {
        this.equipType = equipType;
    }

    public String getMaker() {
        return maker;
    }

    public void setMaker(String maker) {
        this.maker = maker;
    }

    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }

    public String getManagerName() {
        return managerName;
    }

    public void setManagerName(String managerName) {
        this.managerName = managerName;
    }

    public LocalDate getInstallDate() {
        return installDate;
    }

    public void setInstallDate(LocalDate installDate) {
        this.installDate = installDate;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public String getEquipStatus() {
        return equipStatus;
    }

    public void setEquipStatus(String equipStatus) {
        this.equipStatus = equipStatus;
    }

    public String getPlcModel() {
        return plcModel;
    }

    public void setPlcModel(String plcModel) {
        this.plcModel = plcModel;
    }

    public String getPlcIp() {
        return plcIp;
    }

    public void setPlcIp(String plcIp) {
        this.plcIp = plcIp;
    }

    public String getPlcProtocol() {
        return plcProtocol;
    }

    public void setPlcProtocol(String plcProtocol) {
        this.plcProtocol = plcProtocol;
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
