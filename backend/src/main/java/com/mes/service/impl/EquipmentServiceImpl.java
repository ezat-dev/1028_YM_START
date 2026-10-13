package com.mes.service.impl;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.mes.common.exception.BusinessException;
import com.mes.common.exception.ErrorCode;
import com.mes.common.response.PageResponse;
import com.mes.common.util.Paging;
import com.mes.dao.BaseDao;
import com.mes.dao.EquipmentDao;
import com.mes.domain.base.User;
import com.mes.domain.equipment.DownStatus;
import com.mes.domain.equipment.UtilRate;
import com.mes.domain.equipment.PowerUsage;
import com.mes.domain.equipment.EquipAttach;
import com.mes.domain.equipment.History;
import com.mes.domain.equipment.RepairPart;
import com.mes.domain.equipment.RepairHist;
import com.mes.domain.equipment.SparePart;
import com.mes.domain.equipment.SparePartHistory;
import com.mes.service.EquipmentService;

@Service
@Transactional(readOnly = true)
public class EquipmentServiceImpl implements EquipmentService {

    private static final Set<String> SPARE_PART_HISTORY_TYPES = Set.of("IN", "OUT");

    private static final String REF_HISTORY = "HISTORY";
    private static final String REF_REPAIR = "REPAIR";
    private static final Set<String> HIST_TYPES = Set.of("점검", "교체", "변경", "설치", "개조", "수리", "기타");
    private static final Set<String> REPAIR_KINDS = Set.of("자체", "외주");
    private static final Set<String> REPAIR_STATUSES = Set.of("접수", "진행", "완료", "보류", "재수리필요");
    private static final Set<String> TEST_RESULTS = Set.of("", "정상", "이상");
    private static final int MAX_ATTACH = 20;
    // 실행 파일·스크립트(html/svg/js 등)는 받지 않는다 — 미리보기로 열려도 안전한 형식만
    private static final Set<String> ALLOWED_EXT = Set.of(
            "pdf", "jpg", "jpeg", "png", "gif", "bmp", "webp",
            "xls", "xlsx", "csv", "doc", "docx", "ppt", "pptx", "hwp", "hwpx", "txt",
            "dwg", "dxf", "zip", "7z", "mp4", "mov", "avi");
    private static final DateTimeFormatter YM = DateTimeFormatter.ofPattern("yyyyMM");

    private final EquipmentDao equipmentDao;
    private final BaseDao baseDao;

    /** 설비이력·수리이력 첨부파일 저장 폴더. 실제 파일은 {이 경로}/history|repair/{ID}/ 아래. */
    @Value("${app.equipment-file-dir}")
    private String equipmentFileDir;

    public EquipmentServiceImpl(EquipmentDao equipmentDao, BaseDao baseDao) {
        this.equipmentDao = equipmentDao;
        this.baseDao = baseDao;
    }

    @Override
    public PageResponse<DownStatus> getDownStatusList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<DownStatus> content = equipmentDao.selectDownStatusList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = equipmentDao.selectDownStatusCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    public PageResponse<UtilRate> getUtilRateList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<UtilRate> content = equipmentDao.selectUtilRateList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = equipmentDao.selectUtilRateCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    public PageResponse<PowerUsage> getPowerUsageList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<PowerUsage> content = equipmentDao.selectPowerUsageList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = equipmentDao.selectPowerUsageCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    public List<SparePart> getSparePartList(String equipName, String keyword) {
        return equipmentDao.selectSparePartList(equipName, keyword);
    }

    @Override
    public List<String> getSparePartEquipNames() {
        return equipmentDao.selectSparePartEquipNames();
    }

    @Override
    public SparePart getSparePartById(Long id) {
        SparePart sparePart = equipmentDao.selectSparePartById(id);
        if (sparePart == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "부품 정보를 찾을 수 없습니다.");
        }
        return sparePart;
    }

    @Override
    @Transactional
    public SparePart createSparePart(SparePart sparePart, Integer initialQty, String regUserName) {
        sparePart.setRegUserName(regUserName == null ? "" : regUserName);
        equipmentDao.insertSparePart(sparePart);
        if (initialQty != null && initialQty > 0) {
            SparePartHistory history = new SparePartHistory();
            history.setSparePartId(sparePart.getId());
            history.setType("IN");
            history.setQty(initialQty);
            history.setWorkDesc("최초 등록");
            history.setRegUserName(regUserName == null ? "" : regUserName);
            equipmentDao.insertSparePartHistory(history);
        }
        return getSparePartById(sparePart.getId());
    }

    @Override
    @Transactional
    public void updateSparePart(SparePart sparePart) {
        equipmentDao.updateSparePart(sparePart);
    }

    @Override
    @Transactional
    public void deleteSpareParts(List<Long> ids) {
        for (Long id : ids) {
            equipmentDao.softDeleteSparePart(id);
        }
    }

    @Override
    public List<SparePartHistory> getSparePartHistoryList(Long partId, String type, String from, String to) {
        return equipmentDao.selectSparePartHistoryList(partId, type, from, to);
    }

    @Override
    @Transactional
    public void createSparePartHistory(SparePartHistory history) {
        if (!SPARE_PART_HISTORY_TYPES.contains(history.getType())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "구분은 IN 또는 OUT이어야 합니다.");
        }
        if (history.getQty() == null || history.getQty() <= 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수량은 1 이상이어야 합니다.");
        }
        equipmentDao.insertSparePartHistory(history);
    }

    @Override
    @Transactional
    public void deleteSparePartHistory(Long id) {
        equipmentDao.deleteSparePartHistory(id);
    }

    // ===================== 설비이력관리 =====================

    @Override
    public List<History> getHistoryList(LocalDateTime from, LocalDateTime to, Long equipId, String histType, String keyword) {
        return equipmentDao.selectHistoryList(from, to, equipId, blankToNull(histType), blankToNull(keyword));
    }

    @Override
    public History getHistory(Long histId) {
        History h = equipmentDao.selectHistoryById(histId);
        if (h == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "설비이력을 찾을 수 없습니다.");
        }
        // 수리에서 자동 생성된 이력은 그 수리의 첨부도 함께 보여준다(refType으로 구분)
        List<EquipAttach> files = new ArrayList<>(equipmentDao.selectAttachList(REF_HISTORY, histId));
        if (h.getRepairId() != null) {
            files.addAll(equipmentDao.selectAttachList(REF_REPAIR, h.getRepairId()));
        }
        h.setAttachments(files);
        return h;
    }

    @Override
    @Transactional
    public History createHistory(History history) {
        String[] who = resolveUser(history.getRegUserId(), history.getRegUserName());
        history.setRegUserId(who[0]);
        history.setRegUserName(who[1]);
        validateHistory(history);
        history.setRepairId(null);
        history.setHistNo(nextNo("EQH-", true));
        equipmentDao.insertHistory(history);
        return getHistory(history.getHistId());
    }

    @Override
    @Transactional
    public History updateHistory(Long histId, History history) {
        History old = equipmentDao.selectHistoryById(histId);
        if (old == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "설비이력을 찾을 수 없습니다.");
        }
        if (old.getRepairId() != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수리이력에서 자동 생성된 이력은 수리이력관리에서 수정해주세요.");
        }
        String[] who = resolveUser(history.getUpdUserId(), history.getUpdUserName());
        history.setUpdUserId(who[0]);
        history.setUpdUserName(who[1]);
        history.setHistId(histId);
        validateHistory(history);
        equipmentDao.updateHistory(history);
        return getHistory(histId);
    }

    @Override
    @Transactional
    public void deleteHistories(List<Long> histIds) {
        if (histIds == null || histIds.isEmpty()) {
            return;
        }
        List<String> paths = new ArrayList<>();
        for (Long id : histIds) {
            History h = equipmentDao.selectHistoryById(id);
            if (h == null) {
                continue;
            }
            if (h.getRepairId() != null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                        "수리이력에서 자동 생성된 이력(" + h.getHistNo() + ")은 삭제할 수 없습니다. 수리이력관리에서 처리해주세요.");
            }
            paths.addAll(deleteAttachRows(REF_HISTORY, id));
            equipmentDao.deleteHistory(id);
        }
        removeFiles(paths);
    }

    private void validateHistory(History h) {
        requireEquipment(h.getEquipId());
        h.setHistType(trim(h.getHistType()));
        if (!HIST_TYPES.contains(h.getHistType())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이력 유형을 선택해주세요.");
        }
        h.setTitle(trim(h.getTitle()));
        if (h.getTitle().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이력 제목을 입력해주세요.");
        }
        if (h.getTitle().length() > 200) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이력 제목은 200자 이내로 입력해주세요.");
        }
        if (h.getWorkDt() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "발생일시를 입력해주세요.");
        }
        h.setContent(trim(h.getContent()));
        h.setWorkerName(limit(trim(h.getWorkerName()), 50));
    }

    // ===================== 수리이력관리 =====================

    @Override
    public List<RepairHist> getRepairHistList(LocalDateTime from, LocalDateTime to, Long equipId, String status, String repairKind, String keyword) {
        return equipmentDao.selectRepairHistList(from, to, equipId, blankToNull(status), blankToNull(repairKind), blankToNull(keyword));
    }

    @Override
    public RepairHist getRepairHist(Long repairId) {
        RepairHist r = equipmentDao.selectRepairHistById(repairId);
        if (r == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "수리이력을 찾을 수 없습니다.");
        }
        r.setParts(equipmentDao.selectRepairParts(repairId));
        r.setAttachments(equipmentDao.selectAttachList(REF_REPAIR, repairId));
        return r;
    }

    @Override
    @Transactional
    public RepairHist createRepairHist(RepairHist repair) {
        String[] who = resolveUser(repair.getRegUserId(), repair.getRegUserName());
        repair.setRegUserId(who[0]);
        repair.setRegUserName(who[1]);
        validateRepair(repair);
        repair.setRepairNo(nextNo("REP-", false));
        equipmentDao.insertRepairHist(repair);
        saveParts(repair.getRepairId(), repair.getParts());
        syncRepairHistory(repair, who);
        return getRepairHist(repair.getRepairId());
    }

    @Override
    @Transactional
    public RepairHist updateRepairHist(Long repairId, RepairHist repair) {
        if (equipmentDao.selectRepairHistById(repairId) == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "수리이력을 찾을 수 없습니다.");
        }
        String[] who = resolveUser(repair.getUpdUserId(), repair.getUpdUserName());
        repair.setUpdUserId(who[0]);
        repair.setUpdUserName(who[1]);
        repair.setRepairId(repairId);
        validateRepair(repair);
        equipmentDao.updateRepairHist(repair);
        equipmentDao.deleteRepairParts(repairId);
        saveParts(repairId, repair.getParts());
        RepairHist saved = equipmentDao.selectRepairHistById(repairId);
        syncRepairHistory(saved, who);
        return getRepairHist(repairId);
    }

    @Override
    @Transactional
    public void deleteRepairHists(List<Long> repairIds) {
        if (repairIds == null || repairIds.isEmpty()) {
            return;
        }
        List<String> paths = new ArrayList<>();
        for (Long id : repairIds) {
            if (equipmentDao.selectRepairHistById(id) == null) {
                continue;
            }
            History linked = equipmentDao.selectHistoryByRepairId(id);
            if (linked != null) {
                paths.addAll(deleteAttachRows(REF_HISTORY, linked.getHistId()));
                equipmentDao.deleteHistory(linked.getHistId());
            }
            paths.addAll(deleteAttachRows(REF_REPAIR, id));
            equipmentDao.deleteRepairHist(id); // 교체 부품은 FK CASCADE
        }
        removeFiles(paths);
    }

    private void validateRepair(RepairHist r) {
        requireEquipment(r.getEquipId());
        if (r.getFailDt() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "고장 발생일시를 입력해주세요.");
        }
        r.setFailType(limit(trim(r.getFailType()), 50));
        if (r.getFailType().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "고장 유형을 입력해주세요.");
        }
        r.setSymptom(trim(r.getSymptom()));
        if (r.getSymptom().length() > 500) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "고장 증상은 500자 이내로 입력해주세요.");
        }
        r.setAlarmCode(limit(trim(r.getAlarmCode()), 50));
        r.setCause(trim(r.getCause()));
        r.setAction(trim(r.getAction()));
        r.setRepairerName(limit(trim(r.getRepairerName()), 50));
        r.setRepairKind(trim(r.getRepairKind()).isEmpty() ? "자체" : trim(r.getRepairKind()));
        if (!REPAIR_KINDS.contains(r.getRepairKind())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수리 구분은 자체 또는 외주입니다.");
        }
        r.setVendorName("외주".equals(r.getRepairKind()) ? limit(trim(r.getVendorName()), 100) : "");
        r.setTestResult(trim(r.getTestResult()));
        if (!TEST_RESULTS.contains(r.getTestResult())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "시운전 결과는 정상/이상 중 하나입니다.");
        }
        r.setStatus(trim(r.getStatus()).isEmpty() ? "접수" : trim(r.getStatus()));
        if (!REPAIR_STATUSES.contains(r.getStatus())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수리 상태를 선택해주세요.");
        }
        if (r.getStartDt() != null && r.getStartDt().isBefore(r.getFailDt())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수리 시작일시는 고장 발생일시 이후여야 합니다.");
        }
        if (r.getStartDt() != null && r.getEndDt() != null && r.getEndDt().isBefore(r.getStartDt())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수리 완료일시는 수리 시작일시 이후여야 합니다.");
        }
        if (r.getRecoverDt() != null && r.getRecoverDt().isBefore(r.getFailDt())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "복구일시는 고장 발생일시 이후여야 합니다.");
        }
        if ("완료".equals(r.getStatus()) && r.getEndDt() == null && r.getRecoverDt() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "완료 처리하려면 수리 완료일시나 복구일시를 입력해주세요.");
        }
        r.setPartCost(r.getPartCost() == null ? 0L : r.getPartCost());
        r.setOutsourceCost(r.getOutsourceCost() == null ? 0L : r.getOutsourceCost());
        if (r.getPartCost() < 0 || r.getOutsourceCost() < 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "비용은 0 이상이어야 합니다.");
        }
        if (r.getParts() != null) {
            for (RepairPart p : r.getParts()) {
                if (p == null || trim(p.getPartName()).isEmpty()) {
                    continue;
                }
                if (p.getQty() != null && p.getQty().signum() <= 0) {
                    throw new BusinessException(ErrorCode.INVALID_PARAMETER, "부품 수량은 0보다 커야 합니다. (" + trim(p.getPartName()) + ")");
                }
            }
        }
    }

    private void saveParts(Long repairId, List<RepairPart> parts) {
        if (parts == null) {
            return;
        }
        int order = 0;
        for (RepairPart p : parts) {
            if (p == null || trim(p.getPartName()).isEmpty()) {
                continue;
            }
            p.setRepairId(repairId);
            p.setPartName(limit(trim(p.getPartName()), 100));
            p.setPartNo(limit(trim(p.getPartNo()), 100));
            p.setQty(p.getQty() == null ? BigDecimal.ONE : p.getQty());
            p.setSortOrder(order++);
            equipmentDao.insertRepairPart(p);
        }
    }

    /**
     * 수리가 '완료'면 설비이력에 '수리' 유형 행을 만들거나 고치고, 완료가 아니게 되면 그 행을 지운다.
     * 이 행은 repair_id로 묶여 있어 설비이력관리 화면에서는 읽기 전용이다.
     */
    private void syncRepairHistory(RepairHist r, String[] who) {
        History linked = equipmentDao.selectHistoryByRepairId(r.getRepairId());
        if (!"완료".equals(r.getStatus())) {
            if (linked != null) {
                removeFiles(deleteAttachRows(REF_HISTORY, linked.getHistId()));
                equipmentDao.deleteHistory(linked.getHistId());
            }
            return;
        }
        History h = linked != null ? linked : new History();
        h.setEquipId(r.getEquipId());
        h.setHistType("수리");
        String symptom = trim(r.getSymptom());
        h.setTitle(limit("[" + r.getFailType() + "] " + (symptom.isEmpty() ? "수리 완료" : symptom), 200));
        StringBuilder content = new StringBuilder();
        if (!trim(r.getCause()).isEmpty()) {
            content.append("원인: ").append(trim(r.getCause())).append('\n');
        }
        if (!trim(r.getAction()).isEmpty()) {
            content.append("조치: ").append(trim(r.getAction())).append('\n');
        }
        List<RepairPart> parts = equipmentDao.selectRepairParts(r.getRepairId());
        if (!parts.isEmpty()) {
            StringBuilder ps = new StringBuilder();
            for (RepairPart p : parts) {
                if (ps.length() > 0) {
                    ps.append(", ");
                }
                ps.append(p.getPartName()).append(" ×").append(p.getQty().stripTrailingZeros().toPlainString());
            }
            content.append("교체 부품: ").append(ps).append('\n');
        }
        if (!trim(r.getTestResult()).isEmpty()) {
            content.append("시운전: ").append(r.getTestResult()).append('\n');
        }
        h.setContent(content.toString().trim());
        h.setWorkDt(r.getEndDt() != null ? r.getEndDt() : r.getRecoverDt());
        String worker = trim(r.getRepairerName());
        if ("외주".equals(r.getRepairKind()) && !trim(r.getVendorName()).isEmpty()) {
            worker = worker.isEmpty() ? trim(r.getVendorName()) : worker + " (" + trim(r.getVendorName()) + ")";
        }
        h.setWorkerName(limit(worker, 50));
        if (linked == null) {
            h.setRepairId(r.getRepairId());
            h.setHistNo(nextNo("EQH-", true));
            h.setRegUserId(who[0]);
            h.setRegUserName(who[1]);
            equipmentDao.insertHistory(h);
        } else {
            h.setUpdUserId(who[0]);
            h.setUpdUserName(who[1]);
            equipmentDao.updateHistory(h);
        }
    }

    // ===================== 첨부파일 =====================

    @Override
    @Transactional
    public List<EquipAttach> uploadAttachments(String refType, Long refId, MultipartFile[] files, String regUserId, String regUserName) {
        String type = trim(refType).toUpperCase();
        if (!REF_HISTORY.equals(type) && !REF_REPAIR.equals(type)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "첨부 대상이 올바르지 않습니다.");
        }
        if (REF_HISTORY.equals(type)) {
            History h = equipmentDao.selectHistoryById(refId);
            if (h == null) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "설비이력을 찾을 수 없습니다.");
            }
            if (h.getRepairId() != null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수리이력에서 자동 생성된 이력의 첨부는 수리이력관리에서 등록해주세요.");
            }
        } else if (equipmentDao.selectRepairHistById(refId) == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "수리이력을 찾을 수 없습니다.");
        }
        List<MultipartFile> list = new ArrayList<>();
        if (files != null) {
            for (MultipartFile f : files) {
                if (f != null && !f.isEmpty()) {
                    list.add(f);
                }
            }
        }
        if (list.isEmpty()) {
            return List.of();
        }
        int existing = equipmentDao.selectAttachList(type, refId).size();
        if (existing + list.size() > MAX_ATTACH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "첨부파일은 한 건당 최대 " + MAX_ATTACH + "개까지 등록할 수 있습니다.");
        }
        for (MultipartFile f : list) {
            String ext = extOf(originalName(f));
            if (!ALLOWED_EXT.contains(ext)) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                        "허용되지 않는 파일 형식입니다: " + originalName(f) + " (PDF·이미지·오피스·한글·CAD·압축·동영상)");
            }
        }

        String[] who = resolveUser(regUserId, regUserName);
        Path base = Paths.get(equipmentFileDir).toAbsolutePath().normalize();
        String sub = (REF_HISTORY.equals(type) ? "history" : "repair") + "/" + refId;
        List<Path> written = new ArrayList<>();
        List<EquipAttach> saved = new ArrayList<>();
        try {
            Path dir = base.resolve(sub);
            Files.createDirectories(dir);
            for (MultipartFile f : list) {
                String original = originalName(f);
                String stored = UUID.randomUUID().toString().replace("-", "") + "." + extOf(original);
                Path target = dir.resolve(stored);
                f.transferTo(target);
                written.add(target);

                EquipAttach a = new EquipAttach();
                a.setRefType(type);
                a.setRefId(refId);
                a.setOrigName(limit(original, 255));
                a.setStoredPath(sub + "/" + stored);
                a.setFileSize(f.getSize());
                a.setContentType(limit(f.getContentType() == null ? "" : f.getContentType(), 100));
                a.setRegUserId(who[0]);
                a.setRegUserName(who[1]);
                equipmentDao.insertAttach(a);
                saved.add(equipmentDao.selectAttachById(a.getAttachId()));
            }
        } catch (IOException | RuntimeException e) {
            for (Path p : written) {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignore) {
                    // 남은 파일은 DB 행이 없어 화면에 안 보인다
                }
            }
            if (e instanceof BusinessException be) {
                throw be;
            }
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "첨부파일 저장에 실패했습니다.");
        }
        return saved;
    }

    @Override
    @Transactional
    public void deleteAttachments(List<Long> attachIds) {
        if (attachIds == null || attachIds.isEmpty()) {
            return;
        }
        List<String> paths = new ArrayList<>();
        for (Long id : attachIds) {
            EquipAttach a = equipmentDao.selectAttachById(id);
            if (a == null) {
                continue;
            }
            equipmentDao.deleteAttach(id);
            paths.add(a.getStoredPath());
        }
        removeFiles(paths);
    }

    @Override
    public EquipAttach getAttach(Long attachId) {
        EquipAttach a = equipmentDao.selectAttachById(attachId);
        if (a == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "첨부파일을 찾을 수 없습니다.");
        }
        return a;
    }

    @Override
    public Resource loadAttach(EquipAttach attach) {
        Path target = resolveStored(attach.getStoredPath());
        if (target == null || !Files.isRegularFile(target)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "파일을 찾을 수 없습니다.");
        }
        try {
            return new UrlResource(target.toUri());
        } catch (MalformedURLException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "파일을 읽을 수 없습니다.");
        }
    }

    /** 첨부 행을 지우고 실제 파일 경로 목록을 돌려준다(파일은 DB 정리 뒤에 지운다). */
    private List<String> deleteAttachRows(String refType, Long refId) {
        List<String> paths = new ArrayList<>();
        for (EquipAttach a : equipmentDao.selectAttachList(refType, refId)) {
            equipmentDao.deleteAttach(a.getAttachId());
            paths.add(a.getStoredPath());
        }
        return paths;
    }

    private void removeFiles(List<String> storedPaths) {
        for (String sp : storedPaths) {
            Path p = resolveStored(sp);
            if (p == null) {
                continue;
            }
            try {
                Files.deleteIfExists(p);
                // 마지막 파일이었으면 {ID} 폴더도 지운다(비어 있지 않으면 예외 → 무시)
                Files.deleteIfExists(p.getParent());
            } catch (IOException ignore) {
                // 파일이 잠겨 있어도 DB는 이미 정리됨 — 고아 파일만 남는다
            }
        }
    }

    /** 기준 폴더 밖을 가리키는 경로는 거부한다. */
    private Path resolveStored(String storedPath) {
        if (storedPath == null || storedPath.isBlank()) {
            return null;
        }
        Path base = Paths.get(equipmentFileDir).toAbsolutePath().normalize();
        Path target = base.resolve(storedPath).normalize();
        return target.startsWith(base) ? target : null;
    }

    private static String originalName(MultipartFile f) {
        String n = f.getOriginalFilename();
        if (n == null || n.isBlank()) {
            return "file";
        }
        // 브라우저에 따라 경로가 붙어 오는 경우가 있다
        n = n.replace('\\', '/');
        return n.substring(n.lastIndexOf('/') + 1);
    }

    private static String extOf(String name) {
        int i = name.lastIndexOf('.');
        return i < 0 ? "" : name.substring(i + 1).toLowerCase();
    }

    // ===================== 공통 =====================

    private void requireEquipment(Long equipId) {
        if (equipId == null || baseDao.selectEquipmentById(equipId) == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비를 선택해주세요.");
        }
    }

    /** EQH-202610-001 형식. 월이 바뀌면 001부터. */
    private String nextNo(String head, boolean history) {
        String prefix = head + LocalDate.now().format(YM) + "-";
        int max = history ? equipmentDao.selectHistoryMaxNo(prefix) : equipmentDao.selectRepairHistMaxNo(prefix);
        return prefix + String.format("%03d", max + 1);
    }

    /** 로그인 ID로 사용자 이름을 찾아 [ID, 이름]을 돌려준다. 못 찾으면 화면이 보낸 이름을 쓴다. */
    private String[] resolveUser(String loginId, String fallbackName) {
        String id = trim(loginId);
        String name = trim(fallbackName);
        if (!id.isEmpty()) {
            User u = baseDao.selectUserByLoginId(id);
            if (u != null && u.getUserName() != null && !u.getUserName().isBlank()) {
                name = u.getUserName();
            }
        }
        return new String[] { limit(id, 50), limit(name, 50) };
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String limit(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
