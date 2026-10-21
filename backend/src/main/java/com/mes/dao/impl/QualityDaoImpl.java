package com.mes.dao.impl;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Repository;

import com.mes.dao.QualityDao;
import com.mes.domain.quality.TempUniform;

@Repository
public class QualityDaoImpl implements QualityDao {

    private final SqlSessionTemplate sqlSession;
    private final SqlSessionTemplate ezScadaSession;

    // F/PROOF 테이블(tb_fproof_alarm / tb_fproof_trigger)을 이 JVM에서 이미 확인했는지.
    // 서버 기동 시점엔 DB가 아직 안 떠 있을 수 있어서 기동할 때가 아니라 처음 쓸 때 확인한다.
    private final AtomicBoolean fproofTablesReady = new AtomicBoolean(false);

    public QualityDaoImpl(SqlSessionTemplate sqlSession,
            @Qualifier("ezScadaSession") SqlSessionTemplate ezScadaSession) {
        this.sqlSession = sqlSession;
        this.ezScadaSession = ezScadaSession;
    }

    // ── F/PROOF (ez_scada) ──

    /** F/PROOF 쿼리는 전부 이 세션을 거친다 — 처음 한 번 테이블이 없으면 만들어 둔다(있으면 아무 일도 안 한다). */
    private SqlSessionTemplate fproofSession() {
        if (!fproofTablesReady.get()) {
            ezScadaSession.update("FproofMapper.createFproofAlarmTable");
            ezScadaSession.update("FproofMapper.createFproofTriggerTable");
            fproofTablesReady.set(true);
        }
        return ezScadaSession;
    }

    @Override
    public List<Map<String, Object>> selectFproofEquips() {
        return fproofSession().selectList("FproofMapper.selectEquips");
    }

    @Override
    public List<Map<String, Object>> selectFproofEquipTags() {
        return fproofSession().selectList("FproofMapper.selectEquipTags");
    }

    @Override
    public List<Integer> selectFproofSelectedTagIds(int folderId) {
        return fproofSession().selectList("FproofMapper.selectSelectedTagIds", folderId);
    }

    @Override
    public Integer selectFproofTagFolderId(int tagId) {
        return fproofSession().selectOne("FproofMapper.selectTagFolderId", tagId);
    }

    @Override
    public void insertFproofSelected(int tagId, int folderId) {
        Map<String, Object> p = new HashMap<>();
        p.put("tagId", tagId);
        p.put("folderId", folderId);
        fproofSession().insert("FproofMapper.insertSelected", p);
    }

    @Override
    public void deleteFproofSelected(int tagId) {
        fproofSession().delete("FproofMapper.deleteSelected", tagId);
    }

    @Override
    public void upsertFproofTrigger(int folderId, int startTagId, int endTagId) {
        Map<String, Object> p = new HashMap<>();
        p.put("folderId", folderId);
        p.put("startTagId", startTagId);
        p.put("endTagId", endTagId);
        fproofSession().insert("FproofMapper.upsertTrigger", p);
    }

    @Override
    public void deleteFproofTrigger(int folderId) {
        fproofSession().delete("FproofMapper.deleteTrigger", folderId);
    }

    @Override
    public List<Map<String, Object>> selectFproofStartEvents(List<Integer> tagIds, String from, String to) {
        Map<String, Object> p = rangeParams(from, to);
        p.put("tagIds", tagIds);
        return fproofSession().selectList("FproofMapper.selectStartEvents", p);
    }

    @Override
    public List<Map<String, Object>> selectFproofEndEvents(List<Integer> tagIds, String from) {
        Map<String, Object> p = new HashMap<>();
        p.put("tagIds", tagIds);
        p.put("from", from);
        return fproofSession().selectList("FproofMapper.selectEndEvents", p);
    }

    @Override
    public List<Map<String, Object>> selectFproofDesignatedEvents(String from, String to) {
        return fproofSession().selectList("FproofMapper.selectDesignatedEvents", rangeParams(from, to));
    }

    @Override
    public List<Map<String, Object>> selectFproofDetail(int folderId, String start, String end) {
        Map<String, Object> p = new HashMap<>();
        p.put("folderId", folderId);
        p.put("start", start);
        p.put("end", end);
        return fproofSession().selectList("FproofMapper.selectDetail", p);
    }


    @Override
    public List<TempUniform> selectTempUniformList(String equipName, String judgment, String from, String to) {
        Map<String, Object> p = new HashMap<>();
        p.put("equipName", equipName);
        p.put("judgment", judgment);
        p.put("from", from);
        p.put("to", to);
        return sqlSession.selectList("TempUniformMapper.selectList", p);
    }

    @Override
    public List<String> selectTempUniformEquipNames() {
        return sqlSession.selectList("TempUniformMapper.selectEquipNames");
    }

    @Override
    public TempUniform selectTempUniformById(Long id) {
        return sqlSession.selectOne("TempUniformMapper.selectById", id);
    }

    @Override
    public void insertTempUniform(TempUniform tempUniform) {
        sqlSession.insert("TempUniformMapper.insert", tempUniform);
    }

    @Override
    public void updateTempUniform(TempUniform tempUniform) {
        sqlSession.update("TempUniformMapper.updateMeta", tempUniform);
    }

    @Override
    public void updateTempUniformFile(Long id, String fileName, String origFileName, long fileSize) {
        Map<String, Object> p = new HashMap<>();
        p.put("id", id);
        p.put("fileName", fileName);
        p.put("origFileName", origFileName);
        p.put("fileSize", fileSize);
        sqlSession.update("TempUniformMapper.updateFile", p);
    }

    @Override
    public void softDeleteTempUniform(Long id) {
        sqlSession.update("TempUniformMapper.softDelete", id);
    }

    private Map<String, Object> rangeParams(String from, String to) {
        Map<String, Object> p = new HashMap<>();
        p.put("from", from);
        p.put("to", to);
        return p;
    }

    private Map<String, Object> params(int offset, int size, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("offset", offset);
        p.put("size", size);
        p.put("keyword", keyword);
        return p;
    }
}
