package com.mes.dao;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import com.mes.domain.quality.HardnessMeas;
import com.mes.domain.quality.HardnessSet;
import com.mes.domain.quality.HardnessSpec;
import com.mes.domain.quality.HardnessValue;

/** 기준정보 > 경도관리 + 품질관리 > 경도측정·CPK·PPK */
public interface HardnessDao {

    List<HardnessSpec> selectSpecList(String keyword, String useYn, String equipCode);

    HardnessSpec selectSpecById(Long specId);

    HardnessSpec selectSpecByPartItem(String equipCode, String partNo, String itemName);

    void insertSpec(HardnessSpec spec);

    void updateSpec(HardnessSpec spec);

    void deleteSpec(Long specId);

    List<HardnessMeas> selectMeasList(LocalDateTime from, LocalDateTime to, Long specId, String status, String keyword);

    HardnessMeas selectMeasById(Long measId);

    HardnessMeas selectReceivingMeas();

    int selectMeasMaxNo(String prefix);

    void insertMeas(HardnessMeas meas);

    void updateMeasInfo(HardnessMeas meas);

    void updateMeasStatus(Long measId, String status, String judgement, LocalDateTime completedDt);

    void clearReceiving();

    void updateReceiving(Long measId, String receiving);

    void touchMeas(Long measId);

    void deleteMeas(Long measId);

    List<HardnessSet> selectSets(Long measId);

    HardnessSet selectSetById(Long setId);

    List<HardnessValue> selectValuesByMeas(Long measId);

    int selectMaxSeq(Long measId);

    void insertSet(HardnessSet set);

    void deleteSet(Long setId);

    void upsertValue(HardnessValue value);

    void deleteValue(Long setId, int idx);

    List<Map<String, Object>> selectCapabilityRows(Long specId, LocalDateTime from, LocalDateTime to);
}
