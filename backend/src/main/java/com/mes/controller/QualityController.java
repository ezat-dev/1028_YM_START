package com.mes.controller;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.mes.common.exception.BusinessException;
import com.mes.common.exception.ErrorCode;
import com.mes.common.response.ApiResponse;
import com.mes.common.response.PageResponse;
import com.mes.domain.quality.Cpk;
import com.mes.domain.quality.Ppk;
import com.mes.domain.quality.TempUniform;
import com.mes.domain.quality.Hardness;
import com.mes.domain.quality.Nonconform;
import com.mes.service.QualityService;

/**
 * 품질관리(quality) 중분류 REST 엔드포인트.
 *
 * <p>CPK분석/PPK분석/경도관리/부적합품관리 4개 메뉴는 여전히 1단계 골격(목록 조회 API만 존재)이다.
 * 온도균일성보고서(quality_temp_uniform)는 실제 구현됨 — 편차/판정은 서버가 계산해서 저장한다.
 * F/PROOF SAVE·LIST는 ez_scada 알람 데이터를 쓰는 실제 구현이다(설비 = 알람 폴더).
 */
@RestController
@RequestMapping("/api/quality")
public class QualityController {

    private final QualityService qualityService;

    public QualityController(QualityService qualityService) {
        this.qualityService = qualityService;
    }

    @GetMapping("/cpk")
    public ApiResponse<PageResponse<Cpk>> getCpkList(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(qualityService.getCpkList(page, size, keyword));
    }

    @GetMapping("/ppk")
    public ApiResponse<PageResponse<Ppk>> getPpkList(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(qualityService.getPpkList(page, size, keyword));
    }

    // ── F/PROOF SAVE (대상 알람 지정 + 설비별 시작/종료 트리거) ──

    /** 설비(알람 폴더) 목록. 각 설비에 최종 트리거(startTagId/endTagId, custom 여부)와 알람 태그 목록(tags)이 붙는다. */
    @GetMapping("/fproof/equips")
    public ApiResponse<List<Map<String, Object>>> getFproofEquips() {
        return ApiResponse.success(qualityService.getFproofEquips());
    }

    @GetMapping("/fproof/selected")
    public ApiResponse<List<Integer>> getFproofSelected(@RequestParam Integer folderId) {
        return ApiResponse.success(qualityService.getFproofSelected(folderId));
    }

    @PostMapping("/fproof/select")
    public ApiResponse<Void> selectFproofTag(@RequestParam Integer tagId, @RequestParam Integer folderId) {
        qualityService.selectFproofTag(tagId, folderId);
        return ApiResponse.success();
    }

    @PostMapping("/fproof/deselect")
    public ApiResponse<Void> deselectFproofTag(@RequestParam Integer tagId, @RequestParam Integer folderId) {
        qualityService.deselectFproofTag(tagId, folderId);
        return ApiResponse.success();
    }

    @PutMapping("/fproof/trigger")
    public ApiResponse<Void> saveFproofTrigger(
            @RequestParam Integer folderId,
            @RequestParam Integer startTagId,
            @RequestParam Integer endTagId) {
        qualityService.saveFproofTrigger(folderId, startTagId, endTagId);
        return ApiResponse.success();
    }

    /** 설비의 트리거 지정을 지워 기본값('Fool Proof 시작/종료' 문구)으로 되돌린다. */
    @DeleteMapping("/fproof/trigger")
    public ApiResponse<Void> resetFproofTrigger(@RequestParam Integer folderId) {
        qualityService.resetFproofTrigger(folderId);
        return ApiResponse.success();
    }

    // ── F/PROOF LIST (세션별 지정 알람 이력) ──

    @GetMapping("/fproofList/sessions")
    public ApiResponse<List<Map<String, Object>>> getFproofSessions(
            @RequestParam String from,
            @RequestParam String to) {
        return ApiResponse.success(qualityService.getFproofSessions(from, to));
    }

    @GetMapping("/fproofList/detail")
    public ApiResponse<List<Map<String, Object>>> getFproofDetail(
            @RequestParam Integer folderId,
            @RequestParam String start,
            @RequestParam(required = false) String end) {
        return ApiResponse.success(qualityService.getFproofDetail(folderId, start, end));
    }

    /** 엑셀 출력용 — 기간 내 모든 세션과 그 세션의 지정 알람을 한 번에(세션 수만큼 detail을 반복 호출하지 않도록). */
    @GetMapping("/fproofList/export")
    public ApiResponse<List<Map<String, Object>>> getFproofExport(
            @RequestParam String from,
            @RequestParam String to) {
        return ApiResponse.success(qualityService.getFproofExport(from, to));
    }

    @GetMapping("/tempUniform")
    public ApiResponse<List<TempUniform>> getTempUniformList(
            @RequestParam(required = false) String equipName,
            @RequestParam(required = false) String judgment,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        return ApiResponse.success(qualityService.getTempUniformList(equipName, judgment, from, to));
    }

    @GetMapping("/tempUniform/equipNames")
    public ApiResponse<List<String>> getTempUniformEquipNames() {
        return ApiResponse.success(qualityService.getTempUniformEquipNames());
    }

    @GetMapping("/tempUniform/{id}")
    public ApiResponse<TempUniform> getTempUniformById(@PathVariable Long id) {
        return ApiResponse.success(qualityService.getTempUniformById(id));
    }

    @PostMapping("/tempUniform")
    public ApiResponse<TempUniform> createTempUniform(
            @RequestParam String equipName,
            @RequestParam String surveyDate,
            @RequestParam BigDecimal setTemp,
            @RequestParam BigDecimal maxTemp,
            @RequestParam BigDecimal minTemp,
            @RequestParam(required = false) BigDecimal tolerance,
            @RequestParam(required = false) String inspector,
            @RequestParam(required = false) String remark,
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(required = false) String regUserName) {
        TempUniform meta = new TempUniform();
        meta.setEquipName(equipName);
        meta.setSurveyDate(surveyDate);
        meta.setSetTemp(setTemp);
        meta.setMaxTemp(maxTemp);
        meta.setMinTemp(minTemp);
        meta.setTolerance(tolerance);
        meta.setInspector(inspector);
        meta.setRemark(remark);
        meta.setRegUserName(regUserName);
        return ApiResponse.success(qualityService.createTempUniform(meta, file));
    }

    @PutMapping("/tempUniform/{id}")
    public ApiResponse<TempUniform> updateTempUniform(
            @PathVariable Long id,
            @RequestParam String equipName,
            @RequestParam String surveyDate,
            @RequestParam BigDecimal setTemp,
            @RequestParam BigDecimal maxTemp,
            @RequestParam BigDecimal minTemp,
            @RequestParam(required = false) BigDecimal tolerance,
            @RequestParam(required = false) String inspector,
            @RequestParam(required = false) String remark,
            @RequestParam(value = "file", required = false) MultipartFile file) {
        TempUniform meta = new TempUniform();
        meta.setEquipName(equipName);
        meta.setSurveyDate(surveyDate);
        meta.setSetTemp(setTemp);
        meta.setMaxTemp(maxTemp);
        meta.setMinTemp(minTemp);
        meta.setTolerance(tolerance);
        meta.setInspector(inspector);
        meta.setRemark(remark);
        return ApiResponse.success(qualityService.updateTempUniform(id, meta, file));
    }

    @DeleteMapping("/tempUniform/{id}")
    public ApiResponse<Void> deleteTempUniform(@PathVariable Long id) {
        qualityService.deleteTempUniform(id);
        return ApiResponse.success();
    }

    @GetMapping("/tempUniform/{id}/file")
    public ResponseEntity<Resource> getTempUniformFile(
            @PathVariable Long id,
            @RequestParam(defaultValue = "preview") String mode) throws IOException {
        TempUniform meta = qualityService.getTempUniformById(id);
        if (meta.getFileName() == null || meta.getFileName().isBlank()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "첨부된 파일이 없습니다.");
        }
        Resource resource = qualityService.loadTempUniformFile(meta.getFileName());
        String contentType = Files.probeContentType(resource.getFile().toPath());
        MediaType mediaType = contentType != null
                ? MediaType.parseMediaType(contentType)
                : MediaType.APPLICATION_OCTET_STREAM;
        ContentDisposition disposition = "download".equals(mode)
                ? ContentDisposition.attachment().filename(meta.getOrigFileName(), StandardCharsets.UTF_8).build()
                : ContentDisposition.inline().build();
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(resource);
    }

    @GetMapping("/hardness")
    public ApiResponse<PageResponse<Hardness>> getHardnessList(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(qualityService.getHardnessList(page, size, keyword));
    }

    @GetMapping("/nonconform")
    public ApiResponse<PageResponse<Nonconform>> getNonconformList(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(qualityService.getNonconformList(page, size, keyword));
    }

}
