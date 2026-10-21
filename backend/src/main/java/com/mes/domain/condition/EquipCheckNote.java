package com.mes.domain.condition;

/** 설비점검표 항목별 '정기 점검' 메모(월마다) */
public class EquipCheckNote {

    private Long itemId;
    private String ym;
    private String note;

    public Long getItemId() {
        return itemId;
    }

    public void setItemId(Long itemId) {
        this.itemId = itemId;
    }

    public String getYm() {
        return ym;
    }

    public void setYm(String ym) {
        this.ym = ym;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }
}
