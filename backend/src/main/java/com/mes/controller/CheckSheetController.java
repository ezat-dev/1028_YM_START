package com.mes.controller;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

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
import com.mes.domain.production.CheckBoard;
import com.mes.domain.production.CheckRow;
import com.mes.domain.production.CheckSheet;
import com.mes.domain.production.CheckSign;
import com.mes.service.CheckSheetService;

/**
 * 생산관리 > 열처리 CHECK SHEET — 호기 × 생산일자 한 장, 행 = 통.
 * 행의 경도(표면/심부 X1~X5)는 경도측정(→ CPK·PPK), 비가동은 설비비가동현황, 불량은 부적합품관리로 바로 연동된다.
 */
@RestController
@RequestMapping("/api/production/checkSheet")
public class CheckSheetController {

    private final CheckSheetService service;

    public CheckSheetController(CheckSheetService service) {
        this.service = service;
    }

    public record HardnessRequest(String itemName, List<BigDecimal> values, String userId, String userName) {
    }

    public record HeadRequest(String equipCode, LocalDate prodDate, String workerDay, String workerNight, String qcName,
            String userId, String userName) {
    }

    public record SignRequest(String equipCode, LocalDate prodDate, String slot, Boolean on, String userId, String userName,
            String signName, String signImg) {
    }

    public record SettingRequest(String subtitle, String note) {
    }

    public record UserRef(String userId, String userName) {
    }

    /** 호기 버튼 — 사용 중 설비와 그날 통 수 */
    @GetMapping("/equips")
    public ApiResponse<List<Map<String, Object>>> getEquips(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ApiResponse.success(service.getEquips(date));
    }

    /** 왼쪽 날짜 목록 */
    @GetMapping("/sheets")
    public ApiResponse<List<CheckSheet>> getSheets(
            @RequestParam String equipCode,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.success(service.getSheets(equipCode, from, to));
    }

    @GetMapping("/board")
    public ApiResponse<CheckBoard> getBoard(
            @RequestParam String equipCode,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ApiResponse.success(service.getBoard(equipCode, date));
    }

    /** Part No 고르기 — 제품관리 + 이 호기 경도 규격 품번 */
    @GetMapping("/products")
    public ApiResponse<List<Map<String, Object>>> getProducts(@RequestParam String equipCode) {
        return ApiResponse.success(service.getProducts(equipCode));
    }

    /** 통(행) 추가 — body: { equipCode, prodDate, copyFromRowId, userId, userName } */
    @PostMapping("/row")
    public ApiResponse<CheckRow> addRow(@RequestBody CheckRow req) {
        return ApiResponse.success(service.addRow(req));
    }

    @PutMapping("/row/{rowId}")
    public ApiResponse<CheckRow> updateRow(@PathVariable Long rowId, @RequestBody CheckRow req) {
        return ApiResponse.success(service.updateRow(rowId, req));
    }

    @PostMapping("/row/{rowId}/delete")
    public ApiResponse<Void> deleteRow(@PathVariable Long rowId, @RequestBody(required = false) UserRef req) {
        service.deleteRow(rowId, req == null ? null : req.userId(), req == null ? null : req.userName());
        return ApiResponse.success();
    }

    /** 기록 — 기간의 결재 현황(시트·서명) + 작성·수정 기록(누가·계정·IP·전→후). equipCode를 비우면 전체 호기 */
    @GetMapping("/audit")
    public ApiResponse<Map<String, Object>> getAudit(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String equipCode) {
        return ApiResponse.success(service.getAudit(from, to, equipCode));
    }

    /** 표면/심부 경도 X1~X5 — 값이 모두 비면 그 경도 기록을 지운다 */
    @PutMapping("/row/{rowId}/hardness")
    public ApiResponse<CheckRow> saveHardness(@PathVariable Long rowId, @RequestBody HardnessRequest req) {
        return ApiResponse.success(service.saveHardness(rowId, req.itemName(), req.values(), req.userId(), req.userName()));
    }

    @PutMapping("/head")
    public ApiResponse<CheckSheet> saveHead(@RequestBody HeadRequest req) {
        CheckSheet h = new CheckSheet();
        h.setWorkerDay(req.workerDay());
        h.setWorkerNight(req.workerNight());
        h.setQcName(req.qcName());
        h.setRegUserId(req.userId());
        h.setRegUserName(req.userName());
        return ApiResponse.success(service.saveHead(req.equipCode(), req.prodDate(), h));
    }

    /** slot: 담당·검토·승인·확인·설비관리·품질관리·품질보증·생산관리, on=false면 본인 서명 취소 */
    @PostMapping("/sign")
    public ApiResponse<List<CheckSign>> sign(@RequestBody SignRequest req) {
        return ApiResponse.success(service.sign(req.equipCode(), req.prodDate(), req.slot(), !Boolean.FALSE.equals(req.on()),
                req.userId(), req.userName(), req.signName(), req.signImg()));
    }

    @GetMapping("/setting")
    public ApiResponse<Map<String, String>> getSettings() {
        return ApiResponse.success(service.getSettings());
    }

    @PutMapping("/setting")
    public ApiResponse<Map<String, String>> saveSettings(@RequestBody SettingRequest req) {
        return ApiResponse.success(service.saveSettings(req.subtitle(), req.note()));
    }
}
