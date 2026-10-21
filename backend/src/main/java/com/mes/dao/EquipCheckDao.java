package com.mes.dao;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import com.mes.domain.condition.EquipCheckConfirm;
import com.mes.domain.condition.EquipCheckItem;
import com.mes.domain.condition.EquipCheckMonth;
import com.mes.domain.condition.EquipCheckNote;
import com.mes.domain.condition.EquipCheckResult;
import com.mes.domain.condition.EquipCheckSheet;

/** 조건관리 > 설비점검표 */
public interface EquipCheckDao {

    // 점검표(양식)
    List<EquipCheckSheet> selectSheetList(String useYn, String ym, int day);

    List<Map<String, Object>> selectMarkCounts(String ym);

    EquipCheckSheet selectSheetById(Long sheetId);

    int selectMaxSortOrder();

    void insertSheet(EquipCheckSheet sheet);

    void updateSheet(EquipCheckSheet sheet);

    void deleteSheet(Long sheetId);

    // 항목
    List<EquipCheckItem> selectBoardItems(Long sheetId, String ym);

    List<EquipCheckItem> selectActiveItems(Long sheetId);

    EquipCheckItem selectItemById(Long itemId);

    List<String> selectItemPhotoPaths(Long sheetId);

    int selectMaxItemSeq(Long sheetId);

    int countItemUsage(Long itemId);

    int countItemsByCycle(Long sheetId, String cycle);

    void insertItem(EquipCheckItem item);

    void updateItem(EquipCheckItem item);

    void updateItemSeq(Long itemId, int seq);

    void updateItemPhoto(EquipCheckItem item);

    void hideItem(Long itemId);

    void deleteItem(Long itemId);

    // 월 기록
    EquipCheckMonth selectMonth(Long sheetId, String ym);

    void ensureMonth(Long sheetId, String ym);

    void updateMonthInfo(Long sheetId, String ym, String inspectorName, String remark);

    void fillInspectorIfEmpty(Long sheetId, String ym, String inspectorName);

    void updateSign(Long sheetId, String ym, int slot, String userId, String userName, LocalDateTime signDt, String signImg);

    // 일별 결과
    List<EquipCheckResult> selectResults(Long sheetId, String ym);

    void upsertResult(EquipCheckResult result);

    int insertResultIfEmpty(EquipCheckResult result);

    void deleteResult(Long itemId, String ym, int day);

    // 정기 점검 메모
    List<EquipCheckNote> selectNotes(Long sheetId, String ym);

    void upsertNote(Long itemId, String ym, String note);

    void deleteNote(Long itemId, String ym);

    // 관리책임자 주간 확인
    List<EquipCheckConfirm> selectConfirms(Long sheetId, String ym);

    EquipCheckConfirm selectConfirm(Long sheetId, String ym, int weekNo);

    void insertConfirm(Long sheetId, String ym, int weekNo, String userId, String userName, String signImg);

    void deleteConfirm(Long sheetId, String ym, int weekNo);
}
