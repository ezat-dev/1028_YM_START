package com.mes.service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import com.mes.domain.quality.HardnessCapability;
import com.mes.domain.quality.HardnessMeas;
import com.mes.domain.quality.HardnessSpec;
import com.mes.domain.quality.HardnessValue;

/** 기준정보 > 경도관리(규격) + 품질관리 > 경도측정 · CPK 분석 · PPK 분석 */
public interface HardnessService {

    // 규격
    List<HardnessSpec> getSpecList(String keyword, String useYn, String equipCode);

    HardnessSpec createSpec(HardnessSpec spec);

    HardnessSpec updateSpec(Long specId, HardnessSpec spec);

    void deleteSpecs(List<Long> specIds);

    // 측정
    List<HardnessMeas> getMeasList(LocalDateTime from, LocalDateTime to, Long specId, String status, String keyword);

    HardnessMeas getMeas(Long measId);

    /** 새 측정 — 기본 세트(초물·중물·종물)를 같이 만든다 */
    HardnessMeas createMeas(HardnessMeas meas, List<String> setTypes);

    HardnessMeas updateMeasInfo(Long measId, HardnessMeas meas);

    void deleteMeas(List<Long> measIds);

    HardnessMeas addSet(Long measId, String setType);

    HardnessMeas deleteSet(Long setId);

    /** 수동 입력 — value가 null이면 그 칸을 비운다 */
    HardnessMeas setValue(Long setId, int idx, BigDecimal value);

    HardnessMeas complete(Long measId);

    HardnessMeas reopen(Long measId);

    /** 경도계 자동 수신 대상 지정(on=true면 다른 측정은 모두 해제) */
    HardnessMeas setReceiving(Long measId, boolean on);

    /** 경도계(C# 연동)에서 들어온 값 — 수신 중인 측정의 다음 빈 칸에 넣는다 */
    HardnessValue receiveReading(BigDecimal value, String unit, String deviceId);

    // 공정능력
    HardnessCapability getCapability(Long specId, LocalDateTime from, LocalDateTime to);
}
