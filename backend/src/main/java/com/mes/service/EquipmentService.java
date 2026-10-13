package com.mes.service;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import com.mes.common.response.PageResponse;
import com.mes.domain.equipment.DownStatus;
import com.mes.domain.equipment.UtilRate;
import com.mes.domain.equipment.PowerUsage;
import com.mes.domain.equipment.History;
import com.mes.domain.equipment.EquipAttach;
import com.mes.domain.equipment.RepairPart;
import com.mes.domain.equipment.RepairHist;
import com.mes.domain.equipment.SparePart;
import com.mes.domain.equipment.SparePartHistory;

public interface EquipmentService {

    PageResponse<DownStatus> getDownStatusList(int page, int size, String keyword);

    PageResponse<UtilRate> getUtilRateList(int page, int size, String keyword);

    PageResponse<PowerUsage> getPowerUsageList(int page, int size, String keyword);

    List<SparePart> getSparePartList(String equipName, String keyword);

    List<String> getSparePartEquipNames();

    SparePart getSparePartById(Long id);

    SparePart createSparePart(SparePart sparePart, Integer initialQty, String regUserName);

    void updateSparePart(SparePart sparePart);

    void deleteSpareParts(List<Long> ids);

    List<SparePartHistory> getSparePartHistoryList(Long partId, String type, String from, String to);

    void createSparePartHistory(SparePartHistory history);

    void deleteSparePartHistory(Long id);

    // 설비이력관리
    List<History> getHistoryList(LocalDateTime from, LocalDateTime to, Long equipId, String histType, String keyword);

    History getHistory(Long histId);

    History createHistory(History history);

    History updateHistory(Long histId, History history);

    void deleteHistories(List<Long> histIds);

    // 수리이력관리
    List<RepairHist> getRepairHistList(LocalDateTime from, LocalDateTime to, Long equipId, String status, String repairKind, String keyword);

    RepairHist getRepairHist(Long repairId);

    RepairHist createRepairHist(RepairHist repair);

    RepairHist updateRepairHist(Long repairId, RepairHist repair);

    void deleteRepairHists(List<Long> repairIds);

    // 첨부파일 (설비이력·수리이력 공통)
    List<EquipAttach> uploadAttachments(String refType, Long refId, MultipartFile[] files, String regUserId, String regUserName);

    void deleteAttachments(List<Long> attachIds);

    EquipAttach getAttach(Long attachId);

    Resource loadAttach(EquipAttach attach);
}
