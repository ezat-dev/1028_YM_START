package com.mes.service;

import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import com.mes.domain.condition.EquipCheckBoard;
import com.mes.domain.condition.EquipCheckConfirm;
import com.mes.domain.condition.EquipCheckItem;
import com.mes.domain.condition.EquipCheckMonth;
import com.mes.domain.condition.EquipCheckResult;
import com.mes.domain.condition.EquipCheckSheet;

/** 조건관리 > 설비점검표 */
public interface EquipCheckService {

    // 점검표(양식)
    List<EquipCheckSheet> getSheets(String useYn);

    EquipCheckSheet createSheet(EquipCheckSheet sheet);

    EquipCheckSheet updateSheet(Long sheetId, EquipCheckSheet sheet);

    void deleteSheets(List<Long> sheetIds);

    // 한 달 화면
    EquipCheckBoard getBoard(Long sheetId, String ym);

    // 항목
    EquipCheckItem addItem(Long sheetId, EquipCheckItem item);

    EquipCheckItem updateItem(Long itemId, EquipCheckItem item);

    void deleteItem(Long itemId);

    void moveItem(Long itemId, String dir);

    EquipCheckItem uploadPhoto(Long itemId, MultipartFile file);

    EquipCheckItem deletePhoto(Long itemId);

    EquipCheckItem getItem(Long itemId);

    Resource loadPhoto(EquipCheckItem item);

    // 기록
    EquipCheckResult setResult(Long itemId, String ym, int day, String mark, String userId, String userName);

    EquipCheckBoard fillDay(Long sheetId, String ym, int day, String mark, String userId, String userName);

    EquipCheckMonth saveMonth(Long sheetId, String ym, String inspectorName, String remark);

    void saveNote(Long itemId, String ym, String note);

    // 결재 · 관리책임자 확인
    /** signName: 서명 이름(비면 로그인 사용자 이름), signImg: 마우스/터치 서명(PNG data URL, 없으면 이름만) */
    EquipCheckMonth sign(Long sheetId, String ym, int slot, boolean on, String userId, String userName,
            String signName, String signImg);

    List<EquipCheckConfirm> confirm(Long sheetId, String ym, int weekNo, boolean on, String userId, String userName,
            String signName, String signImg);
}
