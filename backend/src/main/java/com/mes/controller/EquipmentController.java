package com.mes.controller;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.mes.common.response.ApiResponse;
import com.mes.common.response.PageResponse;
import com.mes.domain.equipment.DownStatus;
import com.mes.domain.equipment.UtilRate;
import com.mes.domain.equipment.PowerUsage;
import com.mes.domain.equipment.EquipAttach;
import com.mes.domain.equipment.History;
import com.mes.domain.equipment.RepairHist;
import com.mes.domain.equipment.SparePart;
import com.mes.domain.equipment.SparePartHistory;
import com.mes.service.EquipmentService;

/**
 * 설비관리(equipment) 중분류 REST 엔드포인트.
 *
 * <p>설비비가동현황/설비가동률분석/전력량 3개 메뉴는 여전히 1단계 골격(목록 조회 API만 존재)이다.
 * 설비이력관리/수리이력관리는 CRUD + 첨부파일(여러 개)까지 구현 — 수리가 '완료'되면 설비이력에 자동 기록된다. SPARE 부품관리(equipment_spare_part/_history)는 실제 구현됨 — 재고는 저장하지 않고
 * 입출고 이력에서 매번 계산한다(SparePartMapper.selectList 참고).
 */
@RestController
@RequestMapping("/api/equipment")
public class EquipmentController {

    private final EquipmentService equipmentService;

    public EquipmentController(EquipmentService equipmentService) {
        this.equipmentService = equipmentService;
    }

    @GetMapping("/downStatus")
    public ApiResponse<PageResponse<DownStatus>> getDownStatusList(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(equipmentService.getDownStatusList(page, size, keyword));
    }

    @GetMapping("/utilRate")
    public ApiResponse<PageResponse<UtilRate>> getUtilRateList(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(equipmentService.getUtilRateList(page, size, keyword));
    }

    @GetMapping("/powerUsage")
    public ApiResponse<PageResponse<PowerUsage>> getPowerUsageList(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(equipmentService.getPowerUsageList(page, size, keyword));
    }

    @GetMapping("/sparePart")
    public ApiResponse<List<SparePart>> getSparePartList(
            @RequestParam(required = false) String equipName,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(equipmentService.getSparePartList(equipName, keyword));
    }

    @GetMapping("/sparePart/equipNames")
    public ApiResponse<List<String>> getSparePartEquipNames() {
        return ApiResponse.success(equipmentService.getSparePartEquipNames());
    }

    @GetMapping("/sparePart/{id}")
    public ApiResponse<SparePart> getSparePartById(@PathVariable Long id) {
        return ApiResponse.success(equipmentService.getSparePartById(id));
    }

    @PostMapping("/sparePart")
    public ApiResponse<SparePart> createSparePart(
            @RequestBody SparePart sparePart,
            @RequestParam(required = false) Integer initialQty) {
        return ApiResponse.success(equipmentService.createSparePart(sparePart, initialQty, sparePart.getRegUserName()));
    }

    @PutMapping("/sparePart/{id}")
    public ApiResponse<Void> updateSparePart(@PathVariable Long id, @RequestBody SparePart sparePart) {
        sparePart.setId(id);
        equipmentService.updateSparePart(sparePart);
        return ApiResponse.success();
    }

    @PostMapping("/sparePart/delete")
    public ApiResponse<Void> deleteSpareParts(@RequestBody List<Long> ids) {
        equipmentService.deleteSpareParts(ids);
        return ApiResponse.success();
    }

    @GetMapping("/sparePart/history")
    public ApiResponse<List<SparePartHistory>> getSparePartHistoryList(
            @RequestParam(required = false) Long partId,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        return ApiResponse.success(equipmentService.getSparePartHistoryList(partId, type, from, to));
    }

    @PostMapping("/sparePart/history")
    public ApiResponse<Void> createSparePartHistory(@RequestBody SparePartHistory history) {
        equipmentService.createSparePartHistory(history);
        return ApiResponse.success();
    }

    @DeleteMapping("/sparePart/history/{id}")
    public ApiResponse<Void> deleteSparePartHistory(@PathVariable Long id) {
        equipmentService.deleteSparePartHistory(id);
        return ApiResponse.success();
    }

    // ===================== 설비이력관리 =====================

    /**
     * 설비이력 목록 — 발생일시 기간·설비·유형·키워드(이력번호/제목/내용/작업자/등록자).
     * 수리이력이 '완료'되면 자동으로 생긴 '수리' 이력도 함께 나온다(repairId/repairNo가 채워짐).
     */
    @GetMapping("/history")
    public ApiResponse<List<History>> getHistoryList(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(required = false) Long equipId,
            @RequestParam(required = false) String histType,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(equipmentService.getHistoryList(from, to, equipId, histType, keyword));
    }

    /** 설비이력 상세 — 첨부 포함(수리 연동 이력이면 그 수리의 첨부까지). */
    @GetMapping("/history/{histId}")
    public ApiResponse<History> getHistory(@PathVariable Long histId) {
        return ApiResponse.success(equipmentService.getHistory(histId));
    }

    @PostMapping("/history")
    public ApiResponse<History> createHistory(@RequestBody History history) {
        return ApiResponse.success(equipmentService.createHistory(history));
    }

    @PutMapping("/history/{histId}")
    public ApiResponse<History> updateHistory(@PathVariable Long histId, @RequestBody History history) {
        return ApiResponse.success(equipmentService.updateHistory(histId, history));
    }

    @PostMapping("/history/delete")
    public ApiResponse<Void> deleteHistories(@RequestBody List<Long> histIds) {
        equipmentService.deleteHistories(histIds);
        return ApiResponse.success();
    }

    // ===================== 수리이력관리 =====================

    /** 수리이력 목록 — 고장 발생일시 기간·설비·상태·수리 구분·키워드(수리번호/고장유형/증상/알람코드/담당자/업체). */
    @GetMapping("/repairHist")
    public ApiResponse<List<RepairHist>> getRepairHistList(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(required = false) Long equipId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String repairKind,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(equipmentService.getRepairHistList(from, to, equipId, status, repairKind, keyword));
    }

    /** 수리이력 상세 — 교체 부품·첨부 포함. */
    @GetMapping("/repairHist/{repairId}")
    public ApiResponse<RepairHist> getRepairHist(@PathVariable Long repairId) {
        return ApiResponse.success(equipmentService.getRepairHist(repairId));
    }

    /** 수리 등록 — 상태가 '완료'면 설비이력에 '수리' 이력이 자동으로 생긴다. */
    @PostMapping("/repairHist")
    public ApiResponse<RepairHist> createRepairHist(@RequestBody RepairHist repair) {
        return ApiResponse.success(equipmentService.createRepairHist(repair));
    }

    @PutMapping("/repairHist/{repairId}")
    public ApiResponse<RepairHist> updateRepairHist(@PathVariable Long repairId, @RequestBody RepairHist repair) {
        return ApiResponse.success(equipmentService.updateRepairHist(repairId, repair));
    }

    /** 수리 삭제 — 연동된 설비이력과 첨부파일도 함께 지운다. */
    @PostMapping("/repairHist/delete")
    public ApiResponse<Void> deleteRepairHists(@RequestBody List<Long> repairIds) {
        equipmentService.deleteRepairHists(repairIds);
        return ApiResponse.success();
    }

    // ===================== 첨부파일 (설비이력·수리이력 공통) =====================

    /** 첨부 여러 개 업로드. refType: HISTORY | REPAIR, refId: 이력/수리 ID. */
    @PostMapping(value = "/attach", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<List<EquipAttach>> uploadAttachments(
            @RequestParam String refType,
            @RequestParam Long refId,
            @RequestParam(value = "files", required = false) MultipartFile[] files,
            @RequestParam(required = false) String regUserId,
            @RequestParam(required = false) String regUserName) {
        return ApiResponse.success(equipmentService.uploadAttachments(refType, refId, files, regUserId, regUserName));
    }

    @PostMapping("/attach/delete")
    public ApiResponse<Void> deleteAttachments(@RequestBody List<Long> attachIds) {
        equipmentService.deleteAttachments(attachIds);
        return ApiResponse.success();
    }

    /** 첨부 열기 — mode=preview(브라우저에서 바로) | download(원래 파일명으로 저장). */
    @GetMapping("/attach/{attachId}")
    public ResponseEntity<Resource> getAttachment(
            @PathVariable Long attachId,
            @RequestParam(defaultValue = "preview") String mode) {
        EquipAttach meta = equipmentService.getAttach(attachId);
        Resource resource = equipmentService.loadAttach(meta);
        MediaType mediaType;
        try {
            mediaType = meta.getContentType() == null || meta.getContentType().isBlank()
                    ? MediaType.APPLICATION_OCTET_STREAM
                    : MediaType.parseMediaType(meta.getContentType());
        } catch (InvalidMediaTypeException e) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }
        ContentDisposition disposition = ("download".equals(mode)
                ? ContentDisposition.attachment()
                : ContentDisposition.inline())
                .filename(meta.getOrigName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(resource);
    }
}
