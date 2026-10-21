package com.mes.dao.impl;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.stereotype.Repository;

import com.mes.dao.NonconformDao;
import com.mes.domain.quality.DefectType;
import com.mes.domain.quality.Nonconform;

@Repository
public class NonconformDaoImpl implements NonconformDao {

    private static final String NS = "NonconformMapper.";

    private final SqlSessionTemplate sqlSession;

    public NonconformDaoImpl(SqlSessionTemplate sqlSession) {
        this.sqlSession = sqlSession;
    }

    @Override
    public List<Nonconform> selectList(LocalDate from, LocalDate to, String equipCode, String status, String defectCode, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("from", from);
        p.put("to", to);
        p.put("equipCode", equipCode);
        p.put("status", status);
        p.put("defectCode", defectCode);
        p.put("keyword", keyword);
        return sqlSession.selectList(NS + "selectList", p);
    }

    @Override
    public Nonconform selectById(Long ncId) {
        return sqlSession.selectOne(NS + "selectById", ncId);
    }

    @Override
    public int selectMaxNo(String prefix) {
        Integer n = sqlSession.selectOne(NS + "selectMaxNo", prefix);
        return n == null ? 0 : n;
    }

    @Override
    public void insert(Nonconform nc) {
        sqlSession.insert(NS + "insert", nc);
    }

    @Override
    public void update(Nonconform nc) {
        sqlSession.update(NS + "update", nc);
    }

    @Override
    public void delete(Long ncId) {
        sqlSession.delete(NS + "delete", ncId);
    }

    @Override
    public List<DefectType> selectDefectTypes(String useYn) {
        Map<String, Object> p = new HashMap<>();
        p.put("useYn", useYn);
        return sqlSession.selectList(NS + "selectDefectTypes", p);
    }

    @Override
    public DefectType selectDefectType(Long defectId) {
        return sqlSession.selectOne(NS + "selectDefectType", defectId);
    }

    @Override
    public DefectType selectDefectTypeByCode(String defectCode) {
        return sqlSession.selectOne(NS + "selectDefectTypeByCode", defectCode);
    }

    @Override
    public void insertDefectType(DefectType t) {
        sqlSession.insert(NS + "insertDefectType", t);
    }

    @Override
    public void updateDefectType(DefectType t) {
        sqlSession.update(NS + "updateDefectType", t);
    }

    @Override
    public void deleteDefectType(Long defectId) {
        sqlSession.delete(NS + "deleteDefectType", defectId);
    }
}
