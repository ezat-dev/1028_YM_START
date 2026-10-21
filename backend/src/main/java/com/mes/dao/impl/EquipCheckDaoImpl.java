package com.mes.dao.impl;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.stereotype.Repository;

import com.mes.dao.EquipCheckDao;
import com.mes.domain.condition.EquipCheckConfirm;
import com.mes.domain.condition.EquipCheckItem;
import com.mes.domain.condition.EquipCheckMonth;
import com.mes.domain.condition.EquipCheckNote;
import com.mes.domain.condition.EquipCheckResult;
import com.mes.domain.condition.EquipCheckSheet;

@Repository
public class EquipCheckDaoImpl implements EquipCheckDao {

    private static final String NS = "EquipCheckMapper.";

    private final SqlSessionTemplate sqlSession;

    public EquipCheckDaoImpl(SqlSessionTemplate sqlSession) {
        this.sqlSession = sqlSession;
    }

    private static Map<String, Object> sheetYm(Long sheetId, String ym) {
        Map<String, Object> p = new HashMap<>();
        p.put("sheetId", sheetId);
        p.put("ym", ym);
        return p;
    }

    private static Map<String, Object> itemYm(Long itemId, String ym) {
        Map<String, Object> p = new HashMap<>();
        p.put("itemId", itemId);
        p.put("ym", ym);
        return p;
    }

    // ===================== 점검표(양식) =====================

    @Override
    public List<EquipCheckSheet> selectSheetList(String useYn, String ym, int day) {
        Map<String, Object> p = new HashMap<>();
        p.put("useYn", useYn);
        p.put("ym", ym);
        p.put("day", day);
        return sqlSession.selectList(NS + "selectSheetList", p);
    }

    @Override
    public List<Map<String, Object>> selectMarkCounts(String ym) {
        return sqlSession.selectList(NS + "selectMarkCounts", ym);
    }

    @Override
    public EquipCheckSheet selectSheetById(Long sheetId) {
        return sqlSession.selectOne(NS + "selectSheetById", sheetId);
    }

    @Override
    public int selectMaxSortOrder() {
        Integer n = sqlSession.selectOne(NS + "selectMaxSortOrder");
        return n == null ? 0 : n;
    }

    @Override
    public void insertSheet(EquipCheckSheet sheet) {
        sqlSession.insert(NS + "insertSheet", sheet);
    }

    @Override
    public void updateSheet(EquipCheckSheet sheet) {
        sqlSession.update(NS + "updateSheet", sheet);
    }

    @Override
    public void deleteSheet(Long sheetId) {
        sqlSession.delete(NS + "deleteSheet", sheetId);
    }

    // ===================== 항목 =====================

    @Override
    public List<EquipCheckItem> selectBoardItems(Long sheetId, String ym) {
        return sqlSession.selectList(NS + "selectBoardItems", sheetYm(sheetId, ym));
    }

    @Override
    public List<EquipCheckItem> selectActiveItems(Long sheetId) {
        return sqlSession.selectList(NS + "selectActiveItems", sheetId);
    }

    @Override
    public EquipCheckItem selectItemById(Long itemId) {
        return sqlSession.selectOne(NS + "selectItemById", itemId);
    }

    @Override
    public List<String> selectItemPhotoPaths(Long sheetId) {
        return sqlSession.selectList(NS + "selectItemPhotoPaths", sheetId);
    }

    @Override
    public int selectMaxItemSeq(Long sheetId) {
        Integer n = sqlSession.selectOne(NS + "selectMaxItemSeq", sheetId);
        return n == null ? 0 : n;
    }

    @Override
    public int countItemUsage(Long itemId) {
        Integer n = sqlSession.selectOne(NS + "countItemUsage", itemId);
        return n == null ? 0 : n;
    }

    @Override
    public int countItemsByCycle(Long sheetId, String cycle) {
        Map<String, Object> p = new HashMap<>();
        p.put("sheetId", sheetId);
        p.put("cycle", cycle);
        Integer n = sqlSession.selectOne(NS + "countItemsByCycle", p);
        return n == null ? 0 : n;
    }

    @Override
    public void insertItem(EquipCheckItem item) {
        sqlSession.insert(NS + "insertItem", item);
    }

    @Override
    public void updateItem(EquipCheckItem item) {
        sqlSession.update(NS + "updateItem", item);
    }

    @Override
    public void updateItemSeq(Long itemId, int seq) {
        Map<String, Object> p = new HashMap<>();
        p.put("itemId", itemId);
        p.put("seq", seq);
        sqlSession.update(NS + "updateItemSeq", p);
    }

    @Override
    public void updateItemPhoto(EquipCheckItem item) {
        sqlSession.update(NS + "updateItemPhoto", item);
    }

    @Override
    public void hideItem(Long itemId) {
        sqlSession.update(NS + "hideItem", itemId);
    }

    @Override
    public void deleteItem(Long itemId) {
        sqlSession.delete(NS + "deleteItem", itemId);
    }

    // ===================== 월 기록 =====================

    @Override
    public EquipCheckMonth selectMonth(Long sheetId, String ym) {
        return sqlSession.selectOne(NS + "selectMonth", sheetYm(sheetId, ym));
    }

    @Override
    public void ensureMonth(Long sheetId, String ym) {
        sqlSession.insert(NS + "ensureMonth", sheetYm(sheetId, ym));
    }

    @Override
    public void updateMonthInfo(Long sheetId, String ym, String inspectorName, String remark) {
        Map<String, Object> p = sheetYm(sheetId, ym);
        p.put("inspectorName", inspectorName);
        p.put("remark", remark);
        sqlSession.update(NS + "updateMonthInfo", p);
    }

    @Override
    public void fillInspectorIfEmpty(Long sheetId, String ym, String inspectorName) {
        Map<String, Object> p = sheetYm(sheetId, ym);
        p.put("inspectorName", inspectorName);
        sqlSession.update(NS + "fillInspectorIfEmpty", p);
    }

    @Override
    public void updateSign(Long sheetId, String ym, int slot, String userId, String userName, LocalDateTime signDt,
            String signImg) {
        Map<String, Object> p = sheetYm(sheetId, ym);
        p.put("slot", slot);
        p.put("userId", userId);
        p.put("userName", userName);
        p.put("signDt", signDt);
        p.put("signImg", signImg);
        sqlSession.update(NS + "updateSign", p);
    }

    // ===================== 일별 결과 =====================

    @Override
    public List<EquipCheckResult> selectResults(Long sheetId, String ym) {
        return sqlSession.selectList(NS + "selectResults", sheetYm(sheetId, ym));
    }

    @Override
    public void upsertResult(EquipCheckResult result) {
        sqlSession.insert(NS + "upsertResult", result);
    }

    @Override
    public int insertResultIfEmpty(EquipCheckResult result) {
        return sqlSession.insert(NS + "insertResultIfEmpty", result);
    }

    @Override
    public void deleteResult(Long itemId, String ym, int day) {
        Map<String, Object> p = itemYm(itemId, ym);
        p.put("day", day);
        sqlSession.delete(NS + "deleteResult", p);
    }

    // ===================== 정기 점검 메모 =====================

    @Override
    public List<EquipCheckNote> selectNotes(Long sheetId, String ym) {
        return sqlSession.selectList(NS + "selectNotes", sheetYm(sheetId, ym));
    }

    @Override
    public void upsertNote(Long itemId, String ym, String note) {
        Map<String, Object> p = itemYm(itemId, ym);
        p.put("note", note);
        sqlSession.insert(NS + "upsertNote", p);
    }

    @Override
    public void deleteNote(Long itemId, String ym) {
        sqlSession.delete(NS + "deleteNote", itemYm(itemId, ym));
    }

    // ===================== 관리책임자 주간 확인 =====================

    @Override
    public List<EquipCheckConfirm> selectConfirms(Long sheetId, String ym) {
        return sqlSession.selectList(NS + "selectConfirms", sheetYm(sheetId, ym));
    }

    @Override
    public EquipCheckConfirm selectConfirm(Long sheetId, String ym, int weekNo) {
        Map<String, Object> p = sheetYm(sheetId, ym);
        p.put("weekNo", weekNo);
        return sqlSession.selectOne(NS + "selectConfirm", p);
    }

    @Override
    public void insertConfirm(Long sheetId, String ym, int weekNo, String userId, String userName, String signImg) {
        Map<String, Object> p = sheetYm(sheetId, ym);
        p.put("weekNo", weekNo);
        p.put("userId", userId);
        p.put("userName", userName);
        p.put("signImg", signImg);
        sqlSession.insert(NS + "insertConfirm", p);
    }

    @Override
    public void deleteConfirm(Long sheetId, String ym, int weekNo) {
        Map<String, Object> p = sheetYm(sheetId, ym);
        p.put("weekNo", weekNo);
        sqlSession.delete(NS + "deleteConfirm", p);
    }
}
