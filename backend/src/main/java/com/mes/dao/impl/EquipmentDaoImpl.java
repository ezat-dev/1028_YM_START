package com.mes.dao.impl;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.stereotype.Repository;

import com.mes.dao.EquipmentDao;
import com.mes.domain.equipment.DownStatus;
import com.mes.domain.equipment.UtilRate;
import com.mes.domain.equipment.PowerUsage;
import com.mes.domain.equipment.History;
import com.mes.domain.equipment.EquipAttach;
import com.mes.domain.equipment.RepairPart;
import com.mes.domain.equipment.RepairHist;
import com.mes.domain.equipment.SparePart;
import com.mes.domain.equipment.SparePartHistory;

@Repository
public class EquipmentDaoImpl implements EquipmentDao {

    private final SqlSessionTemplate sqlSession;

    public EquipmentDaoImpl(SqlSessionTemplate sqlSession) {
        this.sqlSession = sqlSession;
    }

    @Override
    public List<DownStatus> selectDownStatusList(int offset, int size, String keyword) {
        return sqlSession.selectList("DownStatusMapper.selectList", params(offset, size, keyword));
    }

    @Override
    public long selectDownStatusCount(String keyword) {
        Long count = sqlSession.selectOne("DownStatusMapper.selectCount", params(0, 0, keyword));
        return count == null ? 0L : count;
    }

    @Override
    public List<UtilRate> selectUtilRateList(int offset, int size, String keyword) {
        return sqlSession.selectList("UtilRateMapper.selectList", params(offset, size, keyword));
    }

    @Override
    public long selectUtilRateCount(String keyword) {
        Long count = sqlSession.selectOne("UtilRateMapper.selectCount", params(0, 0, keyword));
        return count == null ? 0L : count;
    }

    @Override
    public List<PowerUsage> selectPowerUsageList(int offset, int size, String keyword) {
        return sqlSession.selectList("PowerUsageMapper.selectList", params(offset, size, keyword));
    }

    @Override
    public long selectPowerUsageCount(String keyword) {
        Long count = sqlSession.selectOne("PowerUsageMapper.selectCount", params(0, 0, keyword));
        return count == null ? 0L : count;
    }

    @Override
    public List<SparePart> selectSparePartList(String equipName, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("equipName", equipName);
        p.put("keyword", keyword);
        return sqlSession.selectList("SparePartMapper.selectList", p);
    }

    @Override
    public List<String> selectSparePartEquipNames() {
        return sqlSession.selectList("SparePartMapper.selectEquipNames");
    }

    @Override
    public SparePart selectSparePartById(Long id) {
        return sqlSession.selectOne("SparePartMapper.selectById", id);
    }

    @Override
    public void insertSparePart(SparePart sparePart) {
        sqlSession.insert("SparePartMapper.insert", sparePart);
    }

    @Override
    public void updateSparePart(SparePart sparePart) {
        sqlSession.update("SparePartMapper.update", sparePart);
    }

    @Override
    public void softDeleteSparePart(Long id) {
        sqlSession.update("SparePartMapper.softDelete", id);
    }

    @Override
    public List<SparePartHistory> selectSparePartHistoryList(Long partId, String type, String from, String to) {
        Map<String, Object> p = new HashMap<>();
        p.put("partId", partId);
        p.put("type", type);
        p.put("from", from);
        p.put("to", to);
        return sqlSession.selectList("SparePartMapper.selectHistoryList", p);
    }

    @Override
    public void insertSparePartHistory(SparePartHistory history) {
        sqlSession.insert("SparePartMapper.insertHistory", history);
    }

    @Override
    public void deleteSparePartHistory(Long id) {
        sqlSession.delete("SparePartMapper.deleteHistory", id);
    }

    private Map<String, Object> params(int offset, int size, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("offset", offset);
        p.put("size", size);
        p.put("keyword", keyword);
        return p;
    }

    // ===================== 설비이력관리 (equipment_history) =====================

    @Override
    public List<History> selectHistoryList(LocalDateTime from, LocalDateTime to, Long equipId, String histType, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("from", from);
        p.put("to", to);
        p.put("equipId", equipId);
        p.put("histType", histType);
        p.put("keyword", keyword);
        return sqlSession.selectList("HistoryMapper.selectList", p);
    }

    @Override
    public History selectHistoryById(Long histId) {
        return sqlSession.selectOne("HistoryMapper.selectById", histId);
    }

    @Override
    public History selectHistoryByRepairId(Long repairId) {
        return sqlSession.selectOne("HistoryMapper.selectByRepairId", repairId);
    }

    @Override
    public int selectHistoryMaxNo(String prefix) {
        Integer n = sqlSession.selectOne("HistoryMapper.selectMaxNo", prefix);
        return n == null ? 0 : n;
    }

    @Override
    public void insertHistory(History history) {
        sqlSession.insert("HistoryMapper.insert", history);
    }

    @Override
    public void updateHistory(History history) {
        sqlSession.update("HistoryMapper.update", history);
    }

    @Override
    public void deleteHistory(Long histId) {
        sqlSession.delete("HistoryMapper.delete", histId);
    }

    // ===================== 수리이력관리 (equipment_repair_hist) =====================

    @Override
    public List<RepairHist> selectRepairHistList(LocalDateTime from, LocalDateTime to, Long equipId, String status, String repairKind, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("from", from);
        p.put("to", to);
        p.put("equipId", equipId);
        p.put("status", status);
        p.put("repairKind", repairKind);
        p.put("keyword", keyword);
        return sqlSession.selectList("RepairHistMapper.selectList", p);
    }

    @Override
    public RepairHist selectRepairHistById(Long repairId) {
        return sqlSession.selectOne("RepairHistMapper.selectById", repairId);
    }

    @Override
    public int selectRepairHistMaxNo(String prefix) {
        Integer n = sqlSession.selectOne("RepairHistMapper.selectMaxNo", prefix);
        return n == null ? 0 : n;
    }

    @Override
    public void insertRepairHist(RepairHist repair) {
        sqlSession.insert("RepairHistMapper.insert", repair);
    }

    @Override
    public void updateRepairHist(RepairHist repair) {
        sqlSession.update("RepairHistMapper.update", repair);
    }

    @Override
    public void deleteRepairHist(Long repairId) {
        sqlSession.delete("RepairHistMapper.delete", repairId);
    }

    @Override
    public List<RepairPart> selectRepairParts(Long repairId) {
        return sqlSession.selectList("RepairHistMapper.selectParts", repairId);
    }

    @Override
    public void insertRepairPart(RepairPart part) {
        sqlSession.insert("RepairHistMapper.insertPart", part);
    }

    @Override
    public void deleteRepairParts(Long repairId) {
        sqlSession.delete("RepairHistMapper.deleteParts", repairId);
    }

    // ===================== 첨부파일 (equipment_attach) =====================

    @Override
    public List<EquipAttach> selectAttachList(String refType, Long refId) {
        Map<String, Object> p = new HashMap<>();
        p.put("refType", refType);
        p.put("refId", refId);
        return sqlSession.selectList("HistoryMapper.selectAttachList", p);
    }

    @Override
    public EquipAttach selectAttachById(Long attachId) {
        return sqlSession.selectOne("HistoryMapper.selectAttachById", attachId);
    }

    @Override
    public void insertAttach(EquipAttach attach) {
        sqlSession.insert("HistoryMapper.insertAttach", attach);
    }

    @Override
    public void deleteAttach(Long attachId) {
        sqlSession.delete("HistoryMapper.deleteAttach", attachId);
    }
}
