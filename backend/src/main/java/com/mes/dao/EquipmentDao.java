package com.mes.dao;

import java.time.LocalDateTime;
import java.util.List;

import com.mes.domain.equipment.DownStatus;
import com.mes.domain.equipment.UtilRate;
import com.mes.domain.equipment.PowerUsage;
import com.mes.domain.equipment.History;
import com.mes.domain.equipment.EquipAttach;
import com.mes.domain.equipment.RepairPart;
import com.mes.domain.equipment.RepairHist;
import com.mes.domain.equipment.SparePart;
import com.mes.domain.equipment.SparePartHistory;

/**
 * 설비관리 전체 메뉴의 데이터 접근 계약.
 */
public interface EquipmentDao {

    List<DownStatus> selectDownStatusList(int offset, int size, String keyword);

    long selectDownStatusCount(String keyword);

    List<UtilRate> selectUtilRateList(int offset, int size, String keyword);

    long selectUtilRateCount(String keyword);

    List<PowerUsage> selectPowerUsageList(int offset, int size, String keyword);

    long selectPowerUsageCount(String keyword);

    List<SparePart> selectSparePartList(String equipName, String keyword);

    List<String> selectSparePartEquipNames();

    SparePart selectSparePartById(Long id);

    void insertSparePart(SparePart sparePart);

    void updateSparePart(SparePart sparePart);

    void softDeleteSparePart(Long id);

    List<SparePartHistory> selectSparePartHistoryList(Long partId, String type, String from, String to);

    void insertSparePartHistory(SparePartHistory history);

    void deleteSparePartHistory(Long id);


    // 설비이력관리
    List<History> selectHistoryList(LocalDateTime from, LocalDateTime to, Long equipId, String histType, String keyword);

    History selectHistoryById(Long histId);

    History selectHistoryByRepairId(Long repairId);

    int selectHistoryMaxNo(String prefix);

    void insertHistory(History history);

    void updateHistory(History history);

    void deleteHistory(Long histId);

    // 수리이력관리
    List<RepairHist> selectRepairHistList(LocalDateTime from, LocalDateTime to, Long equipId, String status, String repairKind, String keyword);

    RepairHist selectRepairHistById(Long repairId);

    int selectRepairHistMaxNo(String prefix);

    void insertRepairHist(RepairHist repair);

    void updateRepairHist(RepairHist repair);

    void deleteRepairHist(Long repairId);

    List<RepairPart> selectRepairParts(Long repairId);

    void insertRepairPart(RepairPart part);

    void deleteRepairParts(Long repairId);

    // 첨부파일
    List<EquipAttach> selectAttachList(String refType, Long refId);

    EquipAttach selectAttachById(Long attachId);

    void insertAttach(EquipAttach attach);

    void deleteAttach(Long attachId);
}
