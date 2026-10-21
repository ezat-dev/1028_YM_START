package com.mes.controller;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.mes.common.response.ApiResponse;
import com.mes.domain.quality.DefectType;
import com.mes.domain.quality.Nonconform;
import com.mes.service.NonconformService;

/**
 * 품질관리 > 부적합품관리 · 불량 구분.
 * 열처리 CHECK SHEET 행에 불량을 적으면 여기에 자동으로 한 건이 생긴다(source=SHEET) — 그 건은 처리 내용만 고친다.
 */
@RestController
@RequestMapping("/api/quality")
public class NonconformController {

    private final NonconformService service;

    public NonconformController(NonconformService service) {
        this.service = service;
    }

    @GetMapping("/nonconform")
    public ApiResponse<List<Nonconform>> getList(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String equipCode,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String defectCode,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(service.getList(from, to, equipCode, status, defectCode, keyword));
    }

    @GetMapping("/nonconform/{ncId}")
    public ApiResponse<Nonconform> get(@PathVariable Long ncId) {
        return ApiResponse.success(service.get(ncId));
    }

    @PostMapping("/nonconform")
    public ApiResponse<Nonconform> create(@RequestBody Nonconform nc) {
        return ApiResponse.success(service.create(nc));
    }

    @PutMapping("/nonconform/{ncId}")
    public ApiResponse<Nonconform> update(@PathVariable Long ncId, @RequestBody Nonconform nc) {
        return ApiResponse.success(service.update(ncId, nc));
    }

    @PostMapping("/nonconform/delete")
    public ApiResponse<Void> delete(@RequestBody List<Long> ncIds) {
        service.delete(ncIds);
        return ApiResponse.success();
    }

    // ===================== 불량 구분 =====================

    @GetMapping("/defect-type")
    public ApiResponse<List<DefectType>> getDefectTypes(@RequestParam(required = false) String useYn) {
        return ApiResponse.success(service.getDefectTypes(useYn));
    }

    @PostMapping("/defect-type")
    public ApiResponse<DefectType> createDefectType(@RequestBody DefectType t) {
        return ApiResponse.success(service.createDefectType(t));
    }

    @PutMapping("/defect-type/{defectId}")
    public ApiResponse<DefectType> updateDefectType(@PathVariable Long defectId, @RequestBody DefectType t) {
        return ApiResponse.success(service.updateDefectType(defectId, t));
    }

    @PostMapping("/defect-type/delete")
    public ApiResponse<Void> deleteDefectTypes(@RequestBody List<Long> defectIds) {
        service.deleteDefectTypes(defectIds);
        return ApiResponse.success();
    }
}
