package com.mes.domain.condition;

import java.util.List;

/** 설비점검표 한 달 화면 — 양식 + 항목 + 그달 기록 전부 */
public class EquipCheckBoard {

    private EquipCheckSheet sheet;
    private List<EquipCheckItem> items;
    private EquipCheckMonth month;
    private List<EquipCheckResult> results;
    private List<EquipCheckNote> notes;
    private List<EquipCheckConfirm> confirms;
    private String today; // 서버 기준 오늘(YYYY-MM-DD) — 미래 날짜 막기용
    private Boolean locked; // 마지막 결재(확인)가 끝나 기록을 고칠 수 없는 달

    public EquipCheckSheet getSheet() {
        return sheet;
    }

    public void setSheet(EquipCheckSheet sheet) {
        this.sheet = sheet;
    }

    public List<EquipCheckItem> getItems() {
        return items;
    }

    public void setItems(List<EquipCheckItem> items) {
        this.items = items;
    }

    public EquipCheckMonth getMonth() {
        return month;
    }

    public void setMonth(EquipCheckMonth month) {
        this.month = month;
    }

    public List<EquipCheckResult> getResults() {
        return results;
    }

    public void setResults(List<EquipCheckResult> results) {
        this.results = results;
    }

    public List<EquipCheckNote> getNotes() {
        return notes;
    }

    public void setNotes(List<EquipCheckNote> notes) {
        this.notes = notes;
    }

    public List<EquipCheckConfirm> getConfirms() {
        return confirms;
    }

    public void setConfirms(List<EquipCheckConfirm> confirms) {
        this.confirms = confirms;
    }

    public String getToday() {
        return today;
    }

    public void setToday(String today) {
        this.today = today;
    }

    public Boolean getLocked() {
        return locked;
    }

    public void setLocked(Boolean locked) {
        this.locked = locked;
    }
}
