package com.mes.service;

import java.time.LocalDate;
import java.util.List;

import com.mes.domain.quality.DefectType;
import com.mes.domain.quality.Nonconform;

/** 품질관리 > 부적합품관리 · 불량 구분 */
public interface NonconformService {

    List<Nonconform> getList(LocalDate from, LocalDate to, String equipCode, String status, String defectCode, String keyword);

    Nonconform get(Long ncId);

    Nonconform create(Nonconform nc);

    /** CHECK SHEET에서 온 건은 처리 내용(상태·처리방법·조치·비고)만 바뀐다 */
    Nonconform update(Long ncId, Nonconform nc);

    void delete(List<Long> ncIds);

    /** 다음 부적합 번호 NC-YYYYMM-NNN */
    String nextNo(LocalDate date);

    List<DefectType> getDefectTypes(String useYn);

    DefectType createDefectType(DefectType t);

    DefectType updateDefectType(Long defectId, DefectType t);

    void deleteDefectTypes(List<Long> defectIds);
}
