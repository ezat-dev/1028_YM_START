package com.mes.service.impl;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.mes.common.exception.BusinessException;
import com.mes.common.exception.ErrorCode;
import com.mes.dao.BaseDao;
import com.mes.dao.NonconformDao;
import com.mes.domain.base.User;
import com.mes.domain.quality.DefectType;
import com.mes.domain.quality.Nonconform;
import com.mes.service.NonconformService;

@Service
public class NonconformServiceImpl implements NonconformService {

    private static final Set<String> STATUSES = Set.of("대기", "처리중", "완료");
    private static final Set<String> DISPOSITIONS = Set.of("폐기", "재작업", "선별", "특채", "반품");
    private static final DateTimeFormatter YM = DateTimeFormatter.ofPattern("yyyyMM");

    private final NonconformDao dao;
    private final BaseDao baseDao;

    public NonconformServiceImpl(NonconformDao dao, BaseDao baseDao) {
        this.dao = dao;
        this.baseDao = baseDao;
    }

    @Override
    public List<Nonconform> getList(LocalDate from, LocalDate to, String equipCode, String status, String defectCode, String keyword) {
        return dao.selectList(from, to, blankToNull(equipCode), blankToNull(status), blankToNull(defectCode), blankToNull(keyword));
    }

    @Override
    public Nonconform get(Long ncId) {
        return require(ncId);
    }

    @Override
    @Transactional
    public Nonconform create(Nonconform nc) {
        String[] who = resolveUser(nc.getRegUserId(), nc.getRegUserName());
        normalize(nc);
        validateContent(nc);
        validateHandling(nc);
        nc.setNcNo(nextNo(nc.getOccurDate()));
        nc.setSource("MANUAL");
        nc.setCheckRowId(null);
        nc.setRegUserId(who[0]);
        nc.setRegUserName(who[1]);
        dao.insert(nc);
        return dao.selectById(nc.getNcId());
    }

    @Override
    @Transactional
    public Nonconform update(Long ncId, Nonconform nc) {
        Nonconform old = require(ncId);
        String[] who = resolveUser(nc.getUpdUserId(), nc.getUpdUserName());
        normalize(nc);
        if ("SHEET".equals(old.getSource())) {
            // 내용(일자·호기·품번·LOT·구분·수량)은 CHECK SHEET 행이 원본
            nc.setOccurDate(old.getOccurDate());
            nc.setEquipCode(old.getEquipCode());
            nc.setPartNo(old.getPartNo());
            nc.setProductName(old.getProductName());
            nc.setLotNo(old.getLotNo());
            nc.setDefectCode(old.getDefectCode());
            nc.setDefectName(old.getDefectName());
            nc.setQty(old.getQty());
            nc.setUnit(old.getUnit());
        } else {
            validateContent(nc);
        }
        validateHandling(nc);
        nc.setNcId(ncId);
        nc.setUpdUserId(who[0]);
        nc.setUpdUserName(who[1]);
        dao.update(nc);
        return dao.selectById(ncId);
    }

    @Override
    @Transactional
    public void delete(List<Long> ncIds) {
        if (ncIds == null || ncIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "삭제할 부적합을 선택해주세요.");
        }
        for (Long id : ncIds) {
            Nonconform n = dao.selectById(id);
            if (n == null) {
                continue;
            }
            if ("SHEET".equals(n.getSource())) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                        n.getNcNo() + "은 CHECK SHEET에서 생긴 부적합입니다. CHECK SHEET 행에서 불량을 지워주세요.");
            }
            dao.delete(id);
        }
    }

    @Override
    public String nextNo(LocalDate date) {
        String prefix = "NC-" + (date == null ? LocalDate.now() : date).format(YM) + "-";
        return prefix + String.format("%03d", dao.selectMaxNo(prefix) + 1);
    }

    // ===================== 불량 구분 =====================

    @Override
    public List<DefectType> getDefectTypes(String useYn) {
        return dao.selectDefectTypes(blankToNull(useYn));
    }

    @Override
    @Transactional
    public DefectType createDefectType(DefectType t) {
        t.setDefectCode(trim(t.getDefectCode()).toUpperCase());
        validateDefectType(t);
        if (dao.selectDefectTypeByCode(t.getDefectCode()) != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 있는 불량 코드입니다: " + t.getDefectCode());
        }
        dao.insertDefectType(t);
        return dao.selectDefectType(t.getDefectId());
    }

    @Override
    @Transactional
    public DefectType updateDefectType(Long defectId, DefectType t) {
        DefectType old = dao.selectDefectType(defectId);
        if (old == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "불량 구분을 찾을 수 없습니다.");
        }
        t.setDefectId(defectId);
        t.setDefectCode(old.getDefectCode()); // 코드는 바꾸지 않는다(기록이 코드로 연결됨)
        validateDefectType(t);
        dao.updateDefectType(t);
        return dao.selectDefectType(defectId);
    }

    @Override
    @Transactional
    public void deleteDefectTypes(List<Long> defectIds) {
        if (defectIds == null) {
            return;
        }
        for (Long id : defectIds) {
            DefectType t = dao.selectDefectType(id);
            if (t == null) {
                continue;
            }
            if (!dao.selectList(null, null, null, null, t.getDefectCode(), null).isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                        "부적합에 쓰인 불량 구분(" + t.getDefectCode() + " " + t.getDefectName() + ")은 지울 수 없습니다. 미사용으로 바꿔주세요.");
            }
            dao.deleteDefectType(id);
        }
    }

    private void validateDefectType(DefectType t) {
        if (t.getDefectCode().isEmpty() || t.getDefectCode().length() > 10) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "불량 코드를 입력해주세요(10자 이내).");
        }
        t.setDefectName(trim(t.getDefectName()));
        if (t.getDefectName().isEmpty() || t.getDefectName().length() > 50) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "불량 이름을 입력해주세요(50자 이내).");
        }
        if (t.getSortOrder() == null) {
            t.setSortOrder(0);
        }
        t.setUseYn("N".equals(t.getUseYn()) ? "N" : "Y");
    }

    // ===================== 검증 · 공통 =====================

    private void normalize(Nonconform n) {
        n.setEquipCode(limit(blankToNull(n.getEquipCode()), 20));
        n.setPartNo(limit(blankToNull(n.getPartNo()), 50));
        n.setProductName(limit(blankToNull(n.getProductName()), 100));
        n.setLotNo(limit(blankToNull(n.getLotNo()), 30));
        n.setDefectCode(blankToNull(n.getDefectCode()));
        n.setUnit(blankToNull(n.getUnit()) == null ? "EA" : limit(trim(n.getUnit()), 10));
        n.setStatus(blankToNull(n.getStatus()) == null ? "대기" : trim(n.getStatus()));
        n.setDisposition(blankToNull(n.getDisposition()));
        n.setActionNote(limit(blankToNull(n.getActionNote()), 500));
        n.setRemark(limit(blankToNull(n.getRemark()), 300));
    }

    private void validateContent(Nonconform n) {
        if (n.getOccurDate() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "발생일을 입력해주세요.");
        }
        if (n.getQty() == null || n.getQty().compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수량을 입력해주세요.");
        }
        if (n.getDefectCode() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "불량 구분을 골라주세요.");
        }
        DefectType t = dao.selectDefectTypeByCode(n.getDefectCode());
        if (t == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "없는 불량 구분입니다: " + n.getDefectCode());
        }
        n.setDefectName(t.getDefectName());
        if (n.getEquipCode() != null && baseDao.selectEquipmentByCode(n.getEquipCode()) == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "없는 설비입니다: " + n.getEquipCode());
        }
    }

    private void validateHandling(Nonconform n) {
        if (!STATUSES.contains(n.getStatus())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "처리 상태는 대기·처리중·완료입니다.");
        }
        if (n.getDisposition() != null && !DISPOSITIONS.contains(n.getDisposition())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "처리 방법은 폐기·재작업·선별·특채·반품입니다.");
        }
        if ("완료".equals(n.getStatus()) && n.getDisposition() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "완료하려면 처리 방법을 골라주세요.");
        }
    }

    private Nonconform require(Long ncId) {
        Nonconform n = ncId == null ? null : dao.selectById(ncId);
        if (n == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "부적합을 찾을 수 없습니다.");
        }
        return n;
    }

    private String[] resolveUser(String loginId, String fallbackName) {
        String id = trim(loginId);
        String name = trim(fallbackName);
        if (!id.isEmpty()) {
            User u = baseDao.selectUserByLoginId(id);
            if (u != null && u.getUserName() != null && !u.getUserName().isBlank()) {
                name = u.getUserName();
            }
        }
        return new String[] { limit(id, 50), limit(name, 50) };
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String limit(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
