package com.mes.dao.impl;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.stereotype.Repository;

import com.mes.dao.HardnessDao;
import com.mes.domain.quality.HardnessMeas;
import com.mes.domain.quality.HardnessSet;
import com.mes.domain.quality.HardnessSpec;
import com.mes.domain.quality.HardnessValue;

@Repository
public class HardnessDaoImpl implements HardnessDao {

    private static final String NS = "HardnessMapper.";

    private final SqlSessionTemplate sqlSession;

    public HardnessDaoImpl(SqlSessionTemplate sqlSession) {
        this.sqlSession = sqlSession;
    }

    @Override
    public List<HardnessSpec> selectSpecList(String keyword, String useYn, String equipCode) {
        Map<String, Object> p = new HashMap<>();
        p.put("keyword", keyword);
        p.put("useYn", useYn);
        p.put("equipCode", equipCode);
        return sqlSession.selectList(NS + "selectSpecList", p);
    }

    @Override
    public HardnessSpec selectSpecById(Long specId) {
        return sqlSession.selectOne(NS + "selectSpecById", specId);
    }

    @Override
    public HardnessSpec selectSpecByPartItem(String equipCode, String partNo, String itemName) {
        Map<String, Object> p = new HashMap<>();
        p.put("equipCode", equipCode);
        p.put("partNo", partNo);
        p.put("itemName", itemName);
        return sqlSession.selectOne(NS + "selectSpecByPartItem", p);
    }

    @Override
    public void insertSpec(HardnessSpec spec) {
        sqlSession.insert(NS + "insertSpec", spec);
    }

    @Override
    public void updateSpec(HardnessSpec spec) {
        sqlSession.update(NS + "updateSpec", spec);
    }

    @Override
    public void deleteSpec(Long specId) {
        sqlSession.delete(NS + "deleteSpec", specId);
    }

    @Override
    public List<HardnessMeas> selectMeasList(LocalDateTime from, LocalDateTime to, Long specId, String status, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("from", from);
        p.put("to", to);
        p.put("specId", specId);
        p.put("status", status);
        p.put("keyword", keyword);
        return sqlSession.selectList(NS + "selectMeasList", p);
    }

    @Override
    public HardnessMeas selectMeasById(Long measId) {
        return sqlSession.selectOne(NS + "selectMeasById", measId);
    }

    @Override
    public HardnessMeas selectReceivingMeas() {
        return sqlSession.selectOne(NS + "selectReceivingMeas");
    }

    @Override
    public int selectMeasMaxNo(String prefix) {
        Integer n = sqlSession.selectOne(NS + "selectMeasMaxNo", prefix);
        return n == null ? 0 : n;
    }

    @Override
    public void insertMeas(HardnessMeas meas) {
        sqlSession.insert(NS + "insertMeas", meas);
    }

    @Override
    public void updateMeasInfo(HardnessMeas meas) {
        sqlSession.update(NS + "updateMeasInfo", meas);
    }

    @Override
    public void updateMeasStatus(Long measId, String status, String judgement, LocalDateTime completedDt) {
        Map<String, Object> p = new HashMap<>();
        p.put("measId", measId);
        p.put("status", status);
        p.put("judgement", judgement);
        p.put("completedDt", completedDt);
        sqlSession.update(NS + "updateMeasStatus", p);
    }

    @Override
    public void clearReceiving() {
        sqlSession.update(NS + "clearReceiving");
    }

    @Override
    public void updateReceiving(Long measId, String receiving) {
        Map<String, Object> p = new HashMap<>();
        p.put("measId", measId);
        p.put("receiving", receiving);
        sqlSession.update(NS + "updateReceiving", p);
    }

    @Override
    public void touchMeas(Long measId) {
        sqlSession.update(NS + "touchMeas", measId);
    }

    @Override
    public void deleteMeas(Long measId) {
        sqlSession.delete(NS + "deleteMeas", measId);
    }

    @Override
    public List<HardnessSet> selectSets(Long measId) {
        return sqlSession.selectList(NS + "selectSets", measId);
    }

    @Override
    public HardnessSet selectSetById(Long setId) {
        return sqlSession.selectOne(NS + "selectSetById", setId);
    }

    @Override
    public List<HardnessValue> selectValuesByMeas(Long measId) {
        return sqlSession.selectList(NS + "selectValuesByMeas", measId);
    }

    @Override
    public int selectMaxSeq(Long measId) {
        Integer n = sqlSession.selectOne(NS + "selectMaxSeq", measId);
        return n == null ? 0 : n;
    }

    @Override
    public void insertSet(HardnessSet set) {
        sqlSession.insert(NS + "insertSet", set);
    }

    @Override
    public void deleteSet(Long setId) {
        sqlSession.delete(NS + "deleteSet", setId);
    }

    @Override
    public void upsertValue(HardnessValue value) {
        sqlSession.insert(NS + "upsertValue", value);
    }

    @Override
    public void deleteValue(Long setId, int idx) {
        Map<String, Object> p = new HashMap<>();
        p.put("setId", setId);
        p.put("idx", idx);
        sqlSession.delete(NS + "deleteValue", p);
    }

    @Override
    public List<Map<String, Object>> selectCapabilityRows(Long specId, LocalDateTime from, LocalDateTime to) {
        Map<String, Object> p = new HashMap<>();
        p.put("specId", specId);
        p.put("from", from);
        p.put("to", to);
        return sqlSession.selectList(NS + "selectCapabilityRows", p);
    }
}
