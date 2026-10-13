package com.mes.domain.equipment;

import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonIgnore;

/**
 * 설비이력·수리이력 첨부파일 (equipment_attach) 1건. refType: HISTORY | REPAIR
 */
public class EquipAttach {

    private Long attachId; // PK
    private String refType; // HISTORY | REPAIR
    private Long refId; // 설비이력 hist_id 또는 수리이력 repair_id
    private String origName; // 원래 파일명
    private String storedPath; // 저장 경로(기준 폴더 아래 상대 경로) — 화면에는 내려주지 않는다
    private Long fileSize; // 바이트
    private String contentType; // MIME
    private String regUserId;
    private String regUserName;
    private LocalDateTime regDt;

    public Long getAttachId() {
        return attachId;
    }

    public void setAttachId(Long attachId) {
        this.attachId = attachId;
    }

    public String getRefType() {
        return refType;
    }

    public void setRefType(String refType) {
        this.refType = refType;
    }

    public Long getRefId() {
        return refId;
    }

    public void setRefId(Long refId) {
        this.refId = refId;
    }

    public String getOrigName() {
        return origName;
    }

    public void setOrigName(String origName) {
        this.origName = origName;
    }

    @JsonIgnore
    public String getStoredPath() {
        return storedPath;
    }

    public void setStoredPath(String storedPath) {
        this.storedPath = storedPath;
    }

    public Long getFileSize() {
        return fileSize;
    }

    public void setFileSize(Long fileSize) {
        this.fileSize = fileSize;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public String getRegUserId() {
        return regUserId;
    }

    public void setRegUserId(String regUserId) {
        this.regUserId = regUserId;
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
}
