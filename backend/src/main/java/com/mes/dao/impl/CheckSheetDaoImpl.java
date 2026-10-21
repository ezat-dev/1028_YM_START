package com.mes.dao.impl;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.stereotype.Repository;

import com.mes.dao.CheckSheetDao;
import com.mes.domain.production.CheckAudit;
import com.mes.domain.production.CheckRow;
import com.mes.domain.production.CheckSheet;
import com.mes.domain.production.CheckSign;
import com.mes.domain.quality.HardnessMeas;

@Repository
public class CheckSheetDaoImpl implements CheckSheetDao {

    private static final String NS = "CheckSheetMapper.";

    private final SqlSessionTemplate sqlSession;

    public CheckSheetDaoImpl(SqlSessionTemplate sqlSession) {
        this.sqlSession = sqlSession;
    }

    @Override
    public List<Map<String, Object>> selectEquipSummary(LocalDate date) {
        Map<String, Object> p = new HashMap<>();
        p.put("date", date);
        return sqlSession.selectList(NS + "selectEquipSummary", p);
    }

    @Override
    public List<CheckSheet> selectSheetList(String equipCode, LocalDate from, LocalDate to) {
        Map<String, Object> p = new HashMap<>();
        p.put("equipCode", equipCode);
        p.put("from", from);
        p.put("to", to);
        return sqlSession.selectList(NS + "selectSheetList", p);
    }

    @Override
    public CheckSheet selectSheet(String equipCode, LocalDate prodDate) {
        Map<String, Object> p = new HashMap<>();
        p.put("equipCode", equipCode);
        p.put("prodDate", prodDate);
        return sqlSession.selectOne(NS + "selectSheet", p);
    }

    @Override
    public CheckSheet selectSheetById(Long sheetId) {
        return sqlSession.selectOne(NS + "selectSheetById", sheetId);
    }

    @Override
    public void insertSheet(CheckSheet sheet) {
        sqlSession.insert(NS + "insertSheet", sheet);
    }

    @Override
    public void updateSheetHead(CheckSheet sheet) {
        sqlSession.update(NS + "updateSheetHead", sheet);
    }

    @Override
    public List<CheckRow> selectRows(Long sheetId) {
        return sqlSession.selectList(NS + "selectRows", sheetId);
    }

    @Override
    public CheckRow selectRow(Long rowId) {
        return sqlSession.selectOne(NS + "selectRow", rowId);
    }

    @Override
    public int selectMaxRowNo(Long sheetId) {
        Integer n = sqlSession.selectOne(NS + "selectMaxRowNo", sheetId);
        return n == null ? 0 : n;
    }

    @Override
    public void insertRow(CheckRow row) {
        sqlSession.insert(NS + "insertRow", row);
    }

    @Override
    public void updateRow(CheckRow row) {
        sqlSession.update(NS + "updateRow", row);
    }

    @Override
    public void updateRowNo(Long rowId, int rowNo) {
        Map<String, Object> p = new HashMap<>();
        p.put("rowId", rowId);
        p.put("rowNo", rowNo);
        sqlSession.update(NS + "updateRowNo", p);
    }

    @Override
    public void deleteRow(Long rowId) {
        sqlSession.delete(NS + "deleteRow", rowId);
    }

    @Override
    public List<Map<String, Object>> selectRowHardness(Long sheetId) {
        return sqlSession.selectList(NS + "selectRowHardness", sheetId);
    }

    @Override
    public HardnessMeas selectMeasByRowItem(Long rowId, String itemName) {
        Map<String, Object> p = new HashMap<>();
        p.put("rowId", rowId);
        p.put("itemName", itemName);
        return sqlSession.selectOne(NS + "selectMeasByRowItem", p);
    }

    @Override
    public List<HardnessMeas> selectMeasByRow(Long rowId) {
        return sqlSession.selectList(NS + "selectMeasByRow", rowId);
    }

    @Override
    public void linkMeas(Long measId, Long rowId) {
        Map<String, Object> p = new HashMap<>();
        p.put("measId", measId);
        p.put("rowId", rowId);
        sqlSession.update(NS + "linkMeas", p);
    }

    @Override
    public void syncMeas(Long measId, String lotNo, String workerName, LocalDateTime measDt, String judgement) {
        Map<String, Object> p = new HashMap<>();
        p.put("measId", measId);
        p.put("lotNo", lotNo);
        p.put("workerName", workerName);
        p.put("measDt", measDt);
        p.put("judgement", judgement);
        sqlSession.update(NS + "syncMeas", p);
    }

    @Override
    public List<CheckSign> selectSigns(Long sheetId) {
        return sqlSession.selectList(NS + "selectSigns", sheetId);
    }

    @Override
    public CheckSign selectSign(Long sheetId, String slot) {
        Map<String, Object> p = new HashMap<>();
        p.put("sheetId", sheetId);
        p.put("slot", slot);
        return sqlSession.selectOne(NS + "selectSign", p);
    }

    @Override
    public void insertSign(CheckSign sign) {
        sqlSession.insert(NS + "insertSign", sign);
    }

    @Override
    public void deleteSign(Long sheetId, String slot) {
        Map<String, Object> p = new HashMap<>();
        p.put("sheetId", sheetId);
        p.put("slot", slot);
        sqlSession.delete(NS + "deleteSign", p);
    }

    @Override
    public List<Map<String, Object>> selectSettings() {
        return sqlSession.selectList(NS + "selectSettings");
    }

    @Override
    public void upsertSetting(String key, String value) {
        Map<String, Object> p = new HashMap<>();
        p.put("key", key);
        p.put("value", value);
        sqlSession.insert(NS + "upsertSetting", p);
    }

    @Override
    public List<Map<String, Object>> selectProducts(String equipCode) {
        return sqlSession.selectList(NS + "selectProducts", equipCode);
    }

    @Override
    public void insertAudit(CheckAudit audit) {
        sqlSession.insert(NS + "insertAudit", audit);
    }

    @Override
    public List<CheckAudit> selectAudits(LocalDate from, LocalDate to, String equipCode) {
        return sqlSession.selectList(NS + "selectAudits", range(from, to, equipCode));
    }

    @Override
    public List<Map<String, Object>> selectSheetsForAudit(LocalDate from, LocalDate to, String equipCode) {
        return sqlSession.selectList(NS + "selectSheetsForAudit", range(from, to, equipCode));
    }

    @Override
    public List<Map<String, Object>> selectSignsForAudit(LocalDate from, LocalDate to, String equipCode) {
        return sqlSession.selectList(NS + "selectSignsForAudit", range(from, to, equipCode));
    }

    private static Map<String, Object> range(LocalDate from, LocalDate to, String equipCode) {
        Map<String, Object> p = new HashMap<>();
        p.put("from", from);
        p.put("to", to);
        p.put("equipCode", equipCode);
        return p;
    }
}
