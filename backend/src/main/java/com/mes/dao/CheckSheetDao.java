package com.mes.dao;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import com.mes.domain.production.CheckAudit;
import com.mes.domain.production.CheckRow;
import com.mes.domain.production.CheckSheet;
import com.mes.domain.production.CheckSign;
import com.mes.domain.quality.HardnessMeas;

/** 생산관리 > 열처리 CHECK SHEET */
public interface CheckSheetDao {

    List<Map<String, Object>> selectEquipSummary(LocalDate date);

    List<CheckSheet> selectSheetList(String equipCode, LocalDate from, LocalDate to);

    CheckSheet selectSheet(String equipCode, LocalDate prodDate);

    CheckSheet selectSheetById(Long sheetId);

    void insertSheet(CheckSheet sheet);

    void updateSheetHead(CheckSheet sheet);

    List<CheckRow> selectRows(Long sheetId);

    CheckRow selectRow(Long rowId);

    int selectMaxRowNo(Long sheetId);

    void insertRow(CheckRow row);

    void updateRow(CheckRow row);

    void updateRowNo(Long rowId, int rowNo);

    void deleteRow(Long rowId);

    List<Map<String, Object>> selectRowHardness(Long sheetId);

    HardnessMeas selectMeasByRowItem(Long rowId, String itemName);

    List<HardnessMeas> selectMeasByRow(Long rowId);

    void linkMeas(Long measId, Long rowId);

    void syncMeas(Long measId, String lotNo, String workerName, LocalDateTime measDt, String judgement);

    List<CheckSign> selectSigns(Long sheetId);

    CheckSign selectSign(Long sheetId, String slot);

    void insertSign(CheckSign sign);

    void deleteSign(Long sheetId, String slot);

    List<Map<String, Object>> selectSettings();

    void upsertSetting(String key, String value);

    List<Map<String, Object>> selectProducts(String equipCode);

    void insertAudit(CheckAudit audit);

    List<CheckAudit> selectAudits(LocalDate from, LocalDate to, String equipCode);

    List<Map<String, Object>> selectSheetsForAudit(LocalDate from, LocalDate to, String equipCode);

    List<Map<String, Object>> selectSignsForAudit(LocalDate from, LocalDate to, String equipCode);
}
