package com.mes.controller;

import java.math.BigDecimal;
import java.time.LocalDateTime;
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
import com.mes.domain.quality.HardnessCapability;
import com.mes.domain.quality.HardnessMeas;
import com.mes.domain.quality.HardnessSpec;
import com.mes.domain.quality.HardnessValue;
import com.mes.service.HardnessService;

/**
 * 경도 — 기준정보 > 경도관리(규격), 품질관리 > 경도측정 · CPK 분석 · PPK 분석.
 *
 * <p>경도계 연동(C#): 측정 화면에서 '자동 수신'을 켠 측정에 {@code POST /api/quality/hardness/reading}
 * 으로 값을 보내면 다음 빈 칸에 들어간다. 예) {"value": 702.5, "unit": "HV", "deviceId": "VICKERS-01"}
 */
@RestController
@RequestMapping("/api/quality/hardness")
public class HardnessController {

    private final HardnessService hardnessService;

    public HardnessController(HardnessService hardnessService) {
        this.hardnessService = hardnessService;
    }

    // ===================== 규격 =====================

    @GetMapping("/spec")
    public ApiResponse<List<HardnessSpec>> getSpecList(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String useYn,
            @RequestParam(required = false) String equipCode) {
        return ApiResponse.success(hardnessService.getSpecList(keyword, useYn, equipCode));
    }

    @PostMapping("/spec")
    public ApiResponse<HardnessSpec> createSpec(@RequestBody HardnessSpec spec) {
        return ApiResponse.success(hardnessService.createSpec(spec));
    }

    @PutMapping("/spec/{specId}")
    public ApiResponse<HardnessSpec> updateSpec(@PathVariable Long specId, @RequestBody HardnessSpec spec) {
        return ApiResponse.success(hardnessService.updateSpec(specId, spec));
    }

    @PostMapping("/spec/delete")
    public ApiResponse<Void> deleteSpecs(@RequestBody List<Long> specIds) {
        hardnessService.deleteSpecs(specIds);
        return ApiResponse.success();
    }

    // ===================== 측정 =====================

    @GetMapping("/meas")
    public ApiResponse<List<HardnessMeas>> getMeasList(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(required = false) Long specId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(hardnessService.getMeasList(from, to, specId, status, keyword));
    }

    /** 상세 — 세트·값 포함. 자동 수신 중에는 화면이 이걸 2초마다 다시 읽는다 */
    @GetMapping("/meas/{measId}")
    public ApiResponse<HardnessMeas> getMeas(@PathVariable Long measId) {
        return ApiResponse.success(hardnessService.getMeas(measId));
    }

    @PostMapping("/meas")
    public ApiResponse<HardnessMeas> createMeas(@RequestBody MeasCreateRequest req) {
        return ApiResponse.success(hardnessService.createMeas(req, req.getSetTypes()));
    }

    @PutMapping("/meas/{measId}")
    public ApiResponse<HardnessMeas> updateMeasInfo(@PathVariable Long measId, @RequestBody HardnessMeas meas) {
        return ApiResponse.success(hardnessService.updateMeasInfo(measId, meas));
    }

    @PostMapping("/meas/delete")
    public ApiResponse<Void> deleteMeas(@RequestBody List<Long> measIds) {
        hardnessService.deleteMeas(measIds);
        return ApiResponse.success();
    }

    /** 세트 추가 — body: {"setType": "중물"} */
    @PostMapping("/meas/{measId}/set")
    public ApiResponse<HardnessMeas> addSet(@PathVariable Long measId, @RequestBody SetRequest req) {
        return ApiResponse.success(hardnessService.addSet(measId, req.getSetType()));
    }

    @PostMapping("/set/{setId}/delete")
    public ApiResponse<HardnessMeas> deleteSet(@PathVariable Long setId) {
        return ApiResponse.success(hardnessService.deleteSet(setId));
    }

    /** 수동 입력 — body: {"value": 702.5}, value가 null이면 칸을 비운다 */
    @PutMapping("/set/{setId}/value/{idx}")
    public ApiResponse<HardnessMeas> setValue(@PathVariable Long setId, @PathVariable int idx, @RequestBody ReadingRequest req) {
        return ApiResponse.success(hardnessService.setValue(setId, idx, req.getValue()));
    }

    @PostMapping("/meas/{measId}/complete")
    public ApiResponse<HardnessMeas> complete(@PathVariable Long measId) {
        return ApiResponse.success(hardnessService.complete(measId));
    }

    @PostMapping("/meas/{measId}/reopen")
    public ApiResponse<HardnessMeas> reopen(@PathVariable Long measId) {
        return ApiResponse.success(hardnessService.reopen(measId));
    }

    /** 경도계 자동 수신 켜기/끄기 — body: {"on": true} */
    @PostMapping("/meas/{measId}/receive")
    public ApiResponse<HardnessMeas> setReceiving(@PathVariable Long measId, @RequestBody ReceiveRequest req) {
        return ApiResponse.success(hardnessService.setReceiving(measId, req.isOn()));
    }

    /** 경도계(C#) → 측정값 1개. 수신 중인 측정의 다음 빈 칸에 들어간다 */
    @PostMapping("/reading")
    public ApiResponse<HardnessValue> receiveReading(@RequestBody ReadingRequest req) {
        return ApiResponse.success(hardnessService.receiveReading(req.getValue(), req.getUnit(), req.getDeviceId()));
    }

    // ===================== 공정능력 =====================

    /** CPK·PPK — 완료된 측정의 세트를 부분군으로 */
    @GetMapping("/capability")
    public ApiResponse<HardnessCapability> getCapability(
            @RequestParam Long specId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        return ApiResponse.success(hardnessService.getCapability(specId, from, to));
    }

    // ===================== 요청 본문 =====================

    public static class MeasCreateRequest extends HardnessMeas {
        private List<String> setTypes;

        public List<String> getSetTypes() {
            return setTypes;
        }

        public void setSetTypes(List<String> setTypes) {
            this.setTypes = setTypes;
        }
    }

    public static class SetRequest {
        private String setType;

        public String getSetType() {
            return setType;
        }

        public void setSetType(String setType) {
            this.setType = setType;
        }
    }

    public static class ReceiveRequest {
        private boolean on;

        public boolean isOn() {
            return on;
        }

        public void setOn(boolean on) {
            this.on = on;
        }
    }

    public static class ReadingRequest {
        private BigDecimal value;
        private String unit;
        private String deviceId;

        public BigDecimal getValue() {
            return value;
        }

        public void setValue(BigDecimal value) {
            this.value = value;
        }

        public String getUnit() {
            return unit;
        }

        public void setUnit(String unit) {
            this.unit = unit;
        }

        public String getDeviceId() {
            return deviceId;
        }

        public void setDeviceId(String deviceId) {
            this.deviceId = deviceId;
        }
    }
}
