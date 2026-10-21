package com.mes.domain.production;

import java.time.LocalDate;
import java.util.List;

/** CHECK SHEET 한 장 화면 — 머리 + 행 + 서명 + 양식 설정 */
public class CheckBoard {

    private String equipCode;
    private String equipName;
    private LocalDate prodDate;
    private CheckSheet sheet; // 아직 없으면 null
    private List<CheckRow> rows;
    private List<CheckSign> signs;
    private String subtitle; // 제목 아래 문구
    private String note; // 특기사항
    private String today; // 서버 기준 오늘

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

    public LocalDate getProdDate() {
        return prodDate;
    }

    public void setProdDate(LocalDate prodDate) {
        this.prodDate = prodDate;
    }

    public CheckSheet getSheet() {
        return sheet;
    }

    public void setSheet(CheckSheet sheet) {
        this.sheet = sheet;
    }

    public List<CheckRow> getRows() {
        return rows;
    }

    public void setRows(List<CheckRow> rows) {
        this.rows = rows;
    }

    public List<CheckSign> getSigns() {
        return signs;
    }

    public void setSigns(List<CheckSign> signs) {
        this.signs = signs;
    }

    public String getSubtitle() {
        return subtitle;
    }

    public void setSubtitle(String subtitle) {
        this.subtitle = subtitle;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public String getToday() {
        return today;
    }

    public void setToday(String today) {
        this.today = today;
    }
}
