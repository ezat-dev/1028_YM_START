package com.mes.dao;

import java.time.LocalDate;
import java.util.List;

import com.mes.domain.quality.DefectType;
import com.mes.domain.quality.Nonconform;

/** 품질관리 > 부적합품관리 · 불량 구분 */
public interface NonconformDao {

    List<Nonconform> selectList(LocalDate from, LocalDate to, String equipCode, String status, String defectCode, String keyword);

    Nonconform selectById(Long ncId);

    int selectMaxNo(String prefix);

    void insert(Nonconform nc);

    void update(Nonconform nc);

    void delete(Long ncId);

    List<DefectType> selectDefectTypes(String useYn);

    DefectType selectDefectType(Long defectId);

    DefectType selectDefectTypeByCode(String defectCode);

    void insertDefectType(DefectType t);

    void updateDefectType(DefectType t);

    void deleteDefectType(Long defectId);
}
