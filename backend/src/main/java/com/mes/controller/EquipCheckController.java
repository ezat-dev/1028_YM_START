package com.mes.controller;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
import com.mes.domain.condition.EquipCheckBoard;
import com.mes.domain.condition.EquipCheckConfirm;
import com.mes.domain.condition.EquipCheckItem;
import com.mes.domain.condition.EquipCheckMonth;
import com.mes.domain.condition.EquipCheckResult;
import com.mes.domain.condition.EquipCheckSheet;
import com.mes.service.EquipCheckService;

/**
 * 조건관리 > 설비점검표 — 현장 종이 '설비점검표'(설비 1대 = 1장, 항목 × 1~31일)를 그대로 옮긴 화면.
 * 범례(○ 양호 △ 수리 □ 조정 X 교환)·주기 범례(D/W/M)·결재란은 점검표마다 편집할 수 있다.
 */
@RestController
@RequestMapping("/api/condition/equipCheck")
public class EquipCheckController {

    private final EquipCheckService service;

    public EquipCheckController(EquipCheckService service) {
        this.service = service;
    }

    public record ResultRequest(String ym, Integer day, String mark, String userId, String userName) {
    }

    public record FillRequest(String ym, Integer day, String mark, String userId, String userName) {
    }

    public record MonthRequest(String ym, String inspectorName, String remark) {
    }

    public record NoteRequest(String ym, String note) {
    }

    /** signName: 서명 이름(비면 로그인 사용자), signImg: 마우스/터치 서명 PNG data URL(없으면 이름만) */
    public record SignRequest(String ym, Integer slot, Boolean on, String userId, String userName,
            String signName, String signImg) {
    }

    public record ConfirmRequest(String ym, Integer weekNo, Boolean on, String userId, String userName,
            String signName, String signImg) {
    }

    // ===================== 점검표(양식) =====================

    @GetMapping("/sheet")
    public ApiResponse<List<EquipCheckSheet>> getSheets(@RequestParam(required = false) String useYn) {
        return ApiResponse.success(service.getSheets(useYn));
    }

    /** body: { title, equipName, modelNo, copyFromId, regUserId, regUserName } */
    @PostMapping("/sheet")
    public ApiResponse<EquipCheckSheet> createSheet(@RequestBody EquipCheckSheet body) {
        return ApiResponse.success(service.createSheet(body));
    }

    /** 머리·범례·주기 범례·결재란·하단 문구 (편집 모드) */
    @PutMapping("/sheet/{sheetId}")
    public ApiResponse<EquipCheckSheet> updateSheet(@PathVariable Long sheetId, @RequestBody EquipCheckSheet body) {
        return ApiResponse.success(service.updateSheet(sheetId, body));
    }

    @PostMapping("/sheet/delete")
    public ApiResponse<Void> deleteSheets(@RequestBody List<Long> sheetIds) {
        service.deleteSheets(sheetIds);
        return ApiResponse.success();
    }

    /** 한 달 점검표 전체(양식 + 항목 + 기록 + 결재) */
    @GetMapping("/sheet/{sheetId}/board")
    public ApiResponse<EquipCheckBoard> getBoard(@PathVariable Long sheetId, @RequestParam String ym) {
        return ApiResponse.success(service.getBoard(sheetId, ym));
    }

    // ===================== 항목 =====================

    @PostMapping("/sheet/{sheetId}/item")
    public ApiResponse<EquipCheckItem> addItem(@PathVariable Long sheetId, @RequestBody EquipCheckItem body) {
        return ApiResponse.success(service.addItem(sheetId, body));
    }

    @PutMapping("/item/{itemId}")
    public ApiResponse<EquipCheckItem> updateItem(@PathVariable Long itemId, @RequestBody EquipCheckItem body) {
        return ApiResponse.success(service.updateItem(itemId, body));
    }

    @PostMapping("/item/{itemId}/delete")
    public ApiResponse<Void> deleteItem(@PathVariable Long itemId) {
        service.deleteItem(itemId);
        return ApiResponse.success();
    }

    /** dir: up | down */
    @PostMapping("/item/{itemId}/move")
    public ApiResponse<Void> moveItem(@PathVariable Long itemId, @RequestParam String dir) {
        service.moveItem(itemId, dir);
        return ApiResponse.success();
    }

    @PostMapping(value = "/item/{itemId}/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<EquipCheckItem> uploadPhoto(@PathVariable Long itemId, @RequestParam("file") MultipartFile file) {
        return ApiResponse.success(service.uploadPhoto(itemId, file));
    }

    @PostMapping("/item/{itemId}/photo/delete")
    public ApiResponse<EquipCheckItem> deletePhoto(@PathVariable Long itemId) {
        return ApiResponse.success(service.deletePhoto(itemId));
    }

    @GetMapping("/item/{itemId}/photo")
    public ResponseEntity<Resource> getPhoto(@PathVariable Long itemId) {
        EquipCheckItem item = service.getItem(itemId);
        Resource resource = service.loadPhoto(item);
        MediaType mediaType;
        try {
            mediaType = item.getPhotoType() == null || item.getPhotoType().isBlank()
                    ? MediaType.APPLICATION_OCTET_STREAM
                    : MediaType.parseMediaType(item.getPhotoType());
        } catch (InvalidMediaTypeException e) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }
        String name = item.getPhotoName() == null ? "photo" : item.getPhotoName();
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(name, StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(resource);
    }

    // ===================== 기록 =====================

    /** 한 칸 기록 — mark가 비면 칸을 지운다. 지운 경우 data는 null */
    @PutMapping("/item/{itemId}/result")
    public ApiResponse<EquipCheckResult> setResult(@PathVariable Long itemId, @RequestBody ResultRequest req) {
        return ApiResponse.success(service.setResult(itemId, req.ym(), req.day() == null ? 0 : req.day(),
                req.mark(), req.userId(), req.userName()));
    }

    /** 그날 빈 칸 전부를 한 기호(기본: 범례 첫 기호=양호)로 */
    @PostMapping("/sheet/{sheetId}/fill")
    public ApiResponse<EquipCheckBoard> fillDay(@PathVariable Long sheetId, @RequestBody FillRequest req) {
        return ApiResponse.success(service.fillDay(sheetId, req.ym(), req.day() == null ? 0 : req.day(),
                req.mark(), req.userId(), req.userName()));
    }

    /** 머리의 점검자 · 특기사항 */
    @PutMapping("/sheet/{sheetId}/month")
    public ApiResponse<EquipCheckMonth> saveMonth(@PathVariable Long sheetId, @RequestBody MonthRequest req) {
        return ApiResponse.success(service.saveMonth(sheetId, req.ym(), req.inspectorName(), req.remark()));
    }

    /** 항목별 정기 점검 메모 */
    @PutMapping("/item/{itemId}/note")
    public ApiResponse<Void> saveNote(@PathVariable Long itemId, @RequestBody NoteRequest req) {
        service.saveNote(itemId, req.ym(), req.note());
        return ApiResponse.success();
    }

    // ===================== 결재 · 관리책임자 확인 =====================

    /** slot 1~3(담당/검토/확인), on=false면 본인 결재 취소 */
    @PostMapping("/sheet/{sheetId}/sign")
    public ApiResponse<EquipCheckMonth> sign(@PathVariable Long sheetId, @RequestBody SignRequest req) {
        return ApiResponse.success(service.sign(sheetId, req.ym(), req.slot() == null ? 0 : req.slot(),
                !Boolean.FALSE.equals(req.on()), req.userId(), req.userName(), req.signName(), req.signImg()));
    }

    /** weekNo 1~5(1~7일, 8~14일, 15~21일, 22~28일, 29일~말일) */
    @PostMapping("/sheet/{sheetId}/confirm")
    public ApiResponse<List<EquipCheckConfirm>> confirm(@PathVariable Long sheetId, @RequestBody ConfirmRequest req) {
        return ApiResponse.success(service.confirm(sheetId, req.ym(), req.weekNo() == null ? 0 : req.weekNo(),
                !Boolean.FALSE.equals(req.on()), req.userId(), req.userName(), req.signName(), req.signImg()));
    }
}
