package com.mes.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.mes.domain.production.CheckBoard;
import com.mes.domain.production.CheckRow;
import com.mes.domain.production.CheckSheet;
import com.mes.domain.production.CheckSign;

/**
 * 생산관리 > 열처리 CHECK SHEET — 호기 × 생산일자 한 장, 행 = 통.
 * 행의 경도는 경도측정(→ CPK·PPK), 비가동은 설비비가동현황, 불량은 부적합품관리에 바로 연동된다.
 */
public interface CheckSheetService {

    List<Map<String, Object>> getEquips(LocalDate date);

    List<CheckSheet> getSheets(String equipCode, LocalDate from, LocalDate to);

    CheckBoard getBoard(String equipCode, LocalDate date);

    List<Map<String, Object>> getProducts(String equipCode);

    Map<String, Object> getAudit(LocalDate from, LocalDate to, String equipCode);

    CheckRow addRow(CheckRow req);

    CheckRow updateRow(Long rowId, CheckRow req);

    void deleteRow(Long rowId, String userId, String userName);

    CheckRow saveHardness(Long rowId, String itemName, List<BigDecimal> values, String userId, String userName);

    CheckSheet saveHead(String equipCode, LocalDate date, CheckSheet head);

    List<CheckSign> sign(String equipCode, LocalDate date, String slot, boolean on, String userId, String userName,
            String signName, String signImg);

    Map<String, String> getSettings();

    Map<String, String> saveSettings(String subtitle, String note);
}
