package com.mes.service.impl;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.mes.common.exception.BusinessException;
import com.mes.common.exception.ErrorCode;
import com.mes.dao.BaseDao;
import com.mes.dao.HardnessDao;
import com.mes.domain.base.Product;
import com.mes.domain.base.User;
import com.mes.domain.quality.HardnessCapability;
import com.mes.domain.quality.HardnessMeas;
import com.mes.domain.quality.HardnessSet;
import com.mes.domain.quality.HardnessSpec;
import com.mes.domain.quality.HardnessSubgroup;
import com.mes.domain.quality.HardnessValue;
import com.mes.service.HardnessService;

/**
 * 경도 규격·측정·공정능력.
 *
 * <p>측정 1건 = 한 LOT·한 검사항목. 세트(초물/중물/종물, 추가 가능) 하나에 경도1~n(규격의 sample_size)을 잰다.
 * 값 하나는 시료 1개 — 한 시료에서 여러 점을 쟀으면 그 평균 1개 값을 넣는다.
 *
 * <p>경도계 자동 수신: 측정 화면에서 '자동 수신'을 켠 측정 1건(receiving='Y')에, C#이 POST /reading으로 보내는 값을
 * 세트 순서·경도 순서대로 다음 빈 칸에 채운다.
 *
 * <p>공정능력: 완료된 측정의 세트 = 부분군(크기 n). CPK는 부분군 내 σ(R̄/d₂), PPK는 전체 값의 표준편차(n-1)로 계산한다.
 */
@Service
@Transactional(readOnly = true)
public class HardnessServiceImpl implements HardnessService {

    private static final Set<String> SET_TYPES = Set.of("초물", "중물", "종물");
    private static final List<String> DEFAULT_SETS = List.of("초물", "중물", "종물");
    private static final String MEASURING = "측정중";
    private static final String DONE = "완료";
    private static final int MIN_SUBGROUPS = 25;
    private static final DateTimeFormatter YM = DateTimeFormatter.ofPattern("yyyyMM");

    // 부분군 크기 n(2~10)별 관리도 상수 — 인덱스 = n
    private static final double[] D2 = { 0, 0, 1.128, 1.693, 2.059, 2.326, 2.534, 2.704, 2.847, 2.970, 3.078 };
    private static final double[] A2 = { 0, 0, 1.880, 1.023, 0.729, 0.577, 0.483, 0.419, 0.373, 0.337, 0.308 };
    private static final double[] D3 = { 0, 0, 0, 0, 0, 0, 0, 0.076, 0.136, 0.184, 0.223 };
    private static final double[] D4 = { 0, 0, 3.267, 2.574, 2.282, 2.114, 2.004, 1.924, 1.864, 1.816, 1.777 };

    private final HardnessDao hardnessDao;
    private final BaseDao baseDao;

    public HardnessServiceImpl(HardnessDao hardnessDao, BaseDao baseDao) {
        this.hardnessDao = hardnessDao;
        this.baseDao = baseDao;
    }

    // ===================== 규격 =====================

    @Override
    public List<HardnessSpec> getSpecList(String keyword, String useYn, String equipCode) {
        return hardnessDao.selectSpecList(blankToNull(keyword), blankToNull(useYn), blankToNull(equipCode));
    }

    @Override
    @Transactional
    public HardnessSpec createSpec(HardnessSpec spec) {
        String[] who = resolveUser(spec.getRegUserId(), spec.getRegUserName());
        spec.setRegUserId(who[0]);
        spec.setRegUserName(who[1]);
        validateSpec(spec);
        if (hardnessDao.selectSpecByPartItem(spec.getEquipCode(), spec.getPartNo(), spec.getItemName()) != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "같은 호기·품번·검사 항목의 규격이 이미 있습니다.");
        }
        hardnessDao.insertSpec(spec);
        return hardnessDao.selectSpecById(spec.getSpecId());
    }

    @Override
    @Transactional
    public HardnessSpec updateSpec(Long specId, HardnessSpec spec) {
        HardnessSpec old = hardnessDao.selectSpecById(specId);
        if (old == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "경도 규격을 찾을 수 없습니다.");
        }
        // 측정이 쌓인 뒤 단위나 세트당 개수가 바뀌면 지난 값과 섞여 CPK·PPK가 틀어진다
        if (!hardnessDao.selectMeasList(null, null, specId, null, null).isEmpty()) {
            if (!trim(spec.getUnit()).equals(old.getUnit())) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "측정 기록이 있는 규격은 단위를 바꿀 수 없습니다. 새 규격으로 등록해주세요.");
            }
            if (!trim(spec.getEquipCode()).equals(old.getEquipCode())) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "측정 기록이 있는 규격은 호기를 바꿀 수 없습니다. 새 규격으로 등록해주세요.");
            }
            if (spec.getSampleSize() != null && !spec.getSampleSize().equals(old.getSampleSize())) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "측정 기록이 있는 규격은 세트당 측정 개수를 바꿀 수 없습니다. 새 규격으로 등록해주세요.");
            }
        }
        String[] who = resolveUser(spec.getUpdUserId(), spec.getUpdUserName());
        spec.setUpdUserId(who[0]);
        spec.setUpdUserName(who[1]);
        spec.setSpecId(specId);
        validateSpec(spec);
        HardnessSpec dup = hardnessDao.selectSpecByPartItem(spec.getEquipCode(), spec.getPartNo(), spec.getItemName());
        if (dup != null && !dup.getSpecId().equals(specId)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "같은 호기·품번·검사 항목의 규격이 이미 있습니다.");
        }
        hardnessDao.updateSpec(spec);
        return hardnessDao.selectSpecById(specId);
    }

    @Override
    @Transactional
    public void deleteSpecs(List<Long> specIds) {
        if (specIds == null) {
            return;
        }
        for (Long id : specIds) {
            HardnessSpec s = hardnessDao.selectSpecById(id);
            if (s == null) {
                continue;
            }
            if (!hardnessDao.selectMeasList(null, null, id, null, null).isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                        "측정 기록이 있는 규격(" + s.getEquipCode() + " · " + s.getPartNo() + " · " + s.getItemName() + ")은 삭제할 수 없습니다. 미사용으로 바꿔주세요.");
            }
            hardnessDao.deleteSpec(id);
        }
    }

    private void validateSpec(HardnessSpec s) {
        s.setEquipCode(trim(s.getEquipCode()));
        if (s.getEquipCode().isEmpty() || baseDao.selectEquipmentByCode(s.getEquipCode()) == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "호기(설비)를 선택해주세요.");
        }
        // 품번은 기준정보 > 제품관리에 있는 제품만 — 품명은 제품관리 값을 쓴다
        Product p = s.getProductId() == null ? null : baseDao.selectProductById(s.getProductId());
        if (p == null) {
            String part = trim(s.getPartNo());
            List<Product> same = baseDao.selectProductList(null, null, part).stream()
                    .filter(x -> part.equals(x.getPartNo())).toList();
            if (same.size() > 1) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "같은 품번(" + part + ")이 업체별로 여러 개입니다. 제품을 골라주세요.");
            }
            p = same.isEmpty() ? null : same.get(0);
        }
        if (p == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "기준정보 > 제품관리에 등록된 품번을 골라주세요.");
        }
        s.setProductId(p.getProductId());
        s.setPartNo(p.getPartNo());
        s.setProductName(limit(p.getProductName(), 100));
        s.setItemName(trim(s.getItemName()));
        if (s.getItemName().isEmpty() || s.getItemName().length() > 30) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "검사 항목을 입력해주세요(30자 이내).");
        }
        s.setUnit(trim(s.getUnit()));
        if (s.getUnit().isEmpty() || s.getUnit().length() > 10) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "단위를 선택해주세요.");
        }
        if (s.getLsl() == null && s.getUsl() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "하한이나 상한 중 하나는 입력해주세요.");
        }
        if (s.getLsl() != null && s.getUsl() != null && s.getLsl().compareTo(s.getUsl()) >= 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "하한은 상한보다 작아야 합니다.");
        }
        if (s.getTarget() != null && ((s.getLsl() != null && s.getTarget().compareTo(s.getLsl()) < 0)
                || (s.getUsl() != null && s.getTarget().compareTo(s.getUsl()) > 0))) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "목표값은 하한~상한 사이여야 합니다.");
        }
        int dec = s.getDecimals() == null ? 1 : s.getDecimals();
        if (dec < 0 || dec > 3) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "소수 자리는 0~3입니다.");
        }
        s.setDecimals(dec);
        int n = s.getSampleSize() == null ? 5 : s.getSampleSize();
        if (n < 2 || n > 10) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "세트당 측정 개수는 2~10개입니다.");
        }
        s.setSampleSize(n);
        s.setUseYn("N".equals(s.getUseYn()) ? "N" : "Y");
        s.setRemark(limit(trim(s.getRemark()), 300));
    }

    // ===================== 측정 =====================

    @Override
    public List<HardnessMeas> getMeasList(LocalDateTime from, LocalDateTime to, Long specId, String status, String keyword) {
        return hardnessDao.selectMeasList(from, to, specId, blankToNull(status), blankToNull(keyword));
    }

    @Override
    public HardnessMeas getMeas(Long measId) {
        HardnessMeas m = requireMeas(measId);
        List<HardnessSet> sets = hardnessDao.selectSets(measId);
        Map<Long, HardnessSet> byId = new LinkedHashMap<>();
        for (HardnessSet s : sets) {
            s.setValues(new ArrayList<>());
            byId.put(s.getSetId(), s);
        }
        for (HardnessValue v : hardnessDao.selectValuesByMeas(measId)) {
            HardnessSet s = byId.get(v.getSetId());
            if (s != null) {
                s.getValues().add(v);
            }
        }
        m.setSets(sets);
        return m;
    }

    @Override
    @Transactional
    public HardnessMeas createMeas(HardnessMeas meas, List<String> setTypes) {
        HardnessSpec spec = meas.getSpecId() == null ? null : hardnessDao.selectSpecById(meas.getSpecId());
        if (spec == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "경도 규격(품번·검사 항목)을 선택해주세요.");
        }
        if (!"Y".equals(spec.getUseYn())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "미사용 규격으로는 측정할 수 없습니다.");
        }
        String[] who = resolveUser(meas.getRegUserId(), meas.getRegUserName());
        meas.setRegUserId(who[0]);
        meas.setRegUserName(who[1]);
        // 측정 당시 규격을 그대로 복사 — 나중에 규격이 바뀌어도 이 측정의 판정은 유지된다
        meas.setPartNo(spec.getPartNo());
        meas.setProductName(spec.getProductName());
        meas.setItemName(spec.getItemName());
        meas.setUnit(spec.getUnit());
        meas.setLsl(spec.getLsl());
        meas.setUsl(spec.getUsl());
        meas.setSampleSize(spec.getSampleSize());
        meas.setLotNo(limit(trim(meas.getLotNo()), 30));
        meas.setEquipCode(spec.getEquipCode()); // 규격이 호기별이라 호기는 규격을 따른다
        meas.setWorkerName(limit(trim(meas.getWorkerName()).isEmpty() ? who[1] : trim(meas.getWorkerName()), 50));
        meas.setRemark(limit(trim(meas.getRemark()), 300));
        if (meas.getMeasDt() == null) {
            meas.setMeasDt(LocalDateTime.now().withNano(0));
        }
        String prefix = "HDM-" + LocalDate.now().format(YM) + "-";
        meas.setMeasNo(prefix + String.format("%03d", hardnessDao.selectMeasMaxNo(prefix) + 1));
        hardnessDao.insertMeas(meas);

        List<String> types = setTypes == null || setTypes.isEmpty() ? DEFAULT_SETS : setTypes;
        int seq = 1;
        for (String t : types) {
            if (!SET_TYPES.contains(t)) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "세트 구분은 초물·중물·종물입니다.");
            }
            HardnessSet s = new HardnessSet();
            s.setMeasId(meas.getMeasId());
            s.setSetType(t);
            s.setSeq(seq++);
            hardnessDao.insertSet(s);
        }
        return getMeas(meas.getMeasId());
    }

    @Override
    @Transactional
    public HardnessMeas updateMeasInfo(Long measId, HardnessMeas meas) {
        HardnessMeas old = requireEditable(measId);
        String[] who = resolveUser(meas.getUpdUserId(), meas.getUpdUserName());
        meas.setMeasId(measId);
        meas.setUpdUserId(who[0]);
        meas.setUpdUserName(who[1]);
        meas.setLotNo(limit(trim(meas.getLotNo()), 30));
        meas.setEquipCode(old.getEquipCode()); // 호기는 규격을 따른다
        meas.setWorkerName(limit(trim(meas.getWorkerName()), 50));
        meas.setRemark(limit(trim(meas.getRemark()), 300));
        hardnessDao.updateMeasInfo(meas);
        return getMeas(measId);
    }

    @Override
    @Transactional
    public void deleteMeas(List<Long> measIds) {
        if (measIds == null) {
            return;
        }
        for (Long id : measIds) {
            requireEditable(id);
            hardnessDao.deleteMeas(id); // 세트·값은 FK CASCADE
        }
    }

    @Override
    @Transactional
    public HardnessMeas addSet(Long measId, String setType) {
        HardnessMeas m = requireMeasuring(measId);
        if (!SET_TYPES.contains(trim(setType))) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "세트 구분은 초물·중물·종물입니다.");
        }
        HardnessSet s = new HardnessSet();
        s.setMeasId(m.getMeasId());
        s.setSetType(trim(setType));
        s.setSeq(hardnessDao.selectMaxSeq(measId) + 1);
        hardnessDao.insertSet(s);
        hardnessDao.touchMeas(measId);
        return getMeas(measId);
    }

    @Override
    @Transactional
    public HardnessMeas deleteSet(Long setId) {
        HardnessSet s = requireSet(setId);
        requireMeasuring(s.getMeasId());
        if (hardnessDao.selectSets(s.getMeasId()).size() <= 1) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "세트는 하나 이상 있어야 합니다.");
        }
        hardnessDao.deleteSet(setId);
        hardnessDao.touchMeas(s.getMeasId());
        return getMeas(s.getMeasId());
    }

    @Override
    @Transactional
    public HardnessMeas setValue(Long setId, int idx, BigDecimal value) {
        HardnessSet s = requireSet(setId);
        HardnessMeas m = requireMeasuring(s.getMeasId());
        if (idx < 1 || idx > m.getSampleSize()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "경도 칸 번호가 올바르지 않습니다.");
        }
        if (value == null) {
            hardnessDao.deleteValue(setId, idx);
        } else {
            checkValue(value, m.getUnit());
            HardnessValue v = new HardnessValue();
            v.setSetId(setId);
            v.setIdx(idx);
            v.setValue(value);
            v.setSource("MANUAL");
            v.setDeviceId("");
            hardnessDao.upsertValue(v);
        }
        hardnessDao.touchMeas(m.getMeasId());
        return getMeas(m.getMeasId());
    }

    @Override
    @Transactional
    public HardnessMeas complete(Long measId) {
        HardnessMeas m = requireMeasuring(measId);
        HardnessMeas full = getMeas(measId);
        int empty = 0;
        boolean ng = false;
        for (HardnessSet s : full.getSets()) {
            empty += m.getSampleSize() - s.getValues().size();
            for (HardnessValue v : s.getValues()) {
                if (outOfSpec(v.getValue(), m.getLsl(), m.getUsl())) {
                    ng = true;
                }
            }
        }
        if (empty > 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "아직 비어 있는 칸이 " + empty + "개 있습니다. 모두 입력한 뒤 완료해주세요.");
        }
        hardnessDao.updateMeasStatus(measId, DONE, ng ? "불합격" : "합격", LocalDateTime.now().withNano(0));
        return getMeas(measId);
    }

    @Override
    @Transactional
    public HardnessMeas reopen(Long measId) {
        requireEditable(measId);
        hardnessDao.updateMeasStatus(measId, MEASURING, "", null);
        return getMeas(measId);
    }

    @Override
    @Transactional
    public HardnessMeas setReceiving(Long measId, boolean on) {
        requireMeasuring(measId);
        if (on) {
            hardnessDao.clearReceiving(); // 자동 수신 대상은 항상 1건
        }
        hardnessDao.updateReceiving(measId, on ? "Y" : "N");
        return getMeas(measId);
    }

    @Override
    @Transactional
    public HardnessValue receiveReading(BigDecimal value, String unit, String deviceId) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "측정값이 없습니다.");
        }
        HardnessMeas m = hardnessDao.selectReceivingMeas();
        if (m == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "자동 수신 중인 측정이 없습니다. 경도측정 화면에서 '자동 수신'을 켜주세요.");
        }
        if (!trim(unit).isEmpty() && !trim(unit).equalsIgnoreCase(m.getUnit())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    "단위가 다릅니다. 측정 " + m.getUnit() + " / 경도계 " + trim(unit));
        }
        checkValue(value, m.getUnit());
        // 세트 순서 → 경도 순서대로 첫 빈 칸
        HardnessMeas full = getMeas(m.getMeasId());
        for (HardnessSet s : full.getSets()) {
            boolean[] filled = new boolean[m.getSampleSize() + 1];
            for (HardnessValue v : s.getValues()) {
                if (v.getIdx() != null && v.getIdx() <= m.getSampleSize()) {
                    filled[v.getIdx()] = true;
                }
            }
            for (int i = 1; i <= m.getSampleSize(); i++) {
                if (!filled[i]) {
                    HardnessValue v = new HardnessValue();
                    v.setSetId(s.getSetId());
                    v.setIdx(i);
                    v.setValue(value);
                    v.setSource("AUTO");
                    v.setDeviceId(limit(trim(deviceId), 50));
                    hardnessDao.upsertValue(v);
                    hardnessDao.touchMeas(m.getMeasId());
                    return v;
                }
            }
        }
        throw new BusinessException(ErrorCode.INVALID_PARAMETER, "빈 칸이 없습니다. 세트를 추가하거나 측정을 완료해주세요.");
    }

    /** 단위별로 측정 가능한 범위 — 벗어나면 자릿수 실수나 경도계 오류로 보고 받지 않는다 */
    private static final Map<String, double[]> PLAUSIBLE = Map.of(
            "HV", new double[] { 50, 2000 },
            "HRC", new double[] { 10, 80 },
            "HRA", new double[] { 20, 95 },
            "HRB", new double[] { 20, 110 },
            "HB", new double[] { 50, 700 },
            "MM", new double[] { 0.001, 20 });

    private void checkValue(BigDecimal v, String unit) {
        if (v.signum() <= 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "측정값을 확인해주세요.");
        }
        double[] r = PLAUSIBLE.get(trim(unit).toUpperCase());
        double d = v.doubleValue();
        if (r != null && (d < r[0] || d > r[1])) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    "측정값 " + v.stripTrailingZeros().toPlainString() + " " + unit + "은(는) 범위(" + trimNum(r[0]) + "~" + trimNum(r[1]) + ")를 벗어납니다. 값을 확인해주세요.");
        }
    }

    private static String trimNum(double d) {
        return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d);
    }

    // ===================== 공정능력 =====================

    @Override
    public HardnessCapability getCapability(Long specId, LocalDateTime from, LocalDateTime to) {
        HardnessSpec spec = specId == null ? null : hardnessDao.selectSpecById(specId);
        if (spec == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "경도 규격을 찾을 수 없습니다.");
        }
        // 세트(부분군)별로 묶기. CHECK SHEET는 행마다 값이 1~5개라 부분군 크기가 다를 수 있다.
        //  - 값 2개 이상인 세트만 부분군(CPK) — σ부분군내 = 평균(Rᵢ ÷ d₂(nᵢ))
        //  - 값은 1개짜리까지 모두 전체 값(PPK)에 들어간다
        Map<Long, HardnessSubgroup> groups = new LinkedHashMap<>();
        for (Map<String, Object> r : hardnessDao.selectCapabilityRows(specId, from, to)) {
            Long setId = toLong(r.get("setId"));
            HardnessSubgroup g = groups.get(setId);
            if (g == null) {
                g = new HardnessSubgroup();
                g.setMeasId(toLong(r.get("measId")));
                g.setMeasNo((String) r.get("measNo"));
                g.setLotNo((String) r.get("lotNo"));
                g.setEquipCode((String) r.get("equipCode"));
                g.setSetType((String) r.get("setType"));
                g.setSeq(r.get("seq") == null ? 0 : ((Number) r.get("seq")).intValue());
                g.setMeasDt(toDateTime(r.get("measDt")));
                g.setValues(new ArrayList<>());
                groups.put(setId, g);
            }
            g.getValues().add(((Number) r.get("value")).doubleValue());
        }

        List<HardnessSubgroup> subs = new ArrayList<>();
        List<Double> all = new ArrayList<>();
        double rangeSum = 0;
        double sigmaSum = 0;
        Map<Integer, Integer> sizeCount = new HashMap<>();
        for (HardnessSubgroup g : groups.values()) {
            int ni = g.getValues().size();
            all.addAll(g.getValues());
            if (ni < 2 || ni >= D2.length) {
                continue;
            }
            double mn = Double.MAX_VALUE;
            double mx = -Double.MAX_VALUE;
            double sum = 0;
            for (double v : g.getValues()) {
                mn = Math.min(mn, v);
                mx = Math.max(mx, v);
                sum += v;
            }
            g.setMean(sum / ni);
            g.setRange(mx - mn);
            rangeSum += mx - mn;
            sigmaSum += (mx - mn) / D2[ni];
            sizeCount.merge(ni, 1, Integer::sum);
            subs.add(g);
        }
        // 관리 한계는 가장 많은 부분군 크기 기준(모두 같으면 고전 X̄-R과 같다)
        int n = sizeCount.isEmpty() ? spec.getSampleSize()
                : sizeCount.entrySet().stream()
                        .max((x, y) -> x.getValue().equals(y.getValue()) ? x.getKey() - y.getKey() : x.getValue() - y.getValue())
                        .get().getKey();

        HardnessCapability c = new HardnessCapability();
        c.setSpec(spec);
        c.setSubgroupSize(n);
        c.setSubgroupSizeMin(sizeCount.isEmpty() ? n : sizeCount.keySet().stream().min(Integer::compare).get());
        c.setSubgroupSizeMax(sizeCount.isEmpty() ? n : sizeCount.keySet().stream().max(Integer::compare).get());
        c.setSubgroupCount(subs.size());
        c.setTotalCount(all.size());
        c.setMinSubgroups(MIN_SUBGROUPS);
        c.setSubgroups(subs);
        Double lsl = spec.getLsl() == null ? null : spec.getLsl().doubleValue();
        Double usl = spec.getUsl() == null ? null : spec.getUsl().doubleValue();
        int out = 0;
        for (double v : all) {
            if ((lsl != null && v < lsl) || (usl != null && v > usl)) {
                out++;
            }
        }
        c.setOutOfSpec(out);
        if (all.isEmpty()) {
            return c;
        }

        double mean = all.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        c.setMean(mean);
        c.setMin(all.stream().mapToDouble(Double::doubleValue).min().orElse(0));
        c.setMax(all.stream().mapToDouble(Double::doubleValue).max().orElse(0));

        double so = 0;
        if (all.size() > 1) {
            double ss = 0;
            for (double v : all) {
                ss += (v - mean) * (v - mean);
            }
            so = Math.sqrt(ss / (all.size() - 1));
        }
        c.setSigmaOverall(so);
        if (all.size() >= 2 && so > 0) {
            Double[] r = indices(mean, so, lsl, usl);
            c.setPp(r[0]);
            c.setPpu(r[1]);
            c.setPpl(r[2]);
            c.setPpk(r[3]);
        }
        if (subs.isEmpty()) {
            return c;
        }

        double rBar = rangeSum / subs.size();
        double sw = sigmaSum / subs.size();
        c.setRangeBar(rBar);
        c.setSigmaWithin(sw);
        double rCenter = D2[n] * sw;
        c.setUclX(mean + 3 * sw / Math.sqrt(n));
        c.setLclX(mean - 3 * sw / Math.sqrt(n));
        c.setUclR(D4[n] * rCenter);
        c.setLclR(D3[n] * rCenter);

        // σ가 0이거나 부분군이 하나뿐이면 지수를 내지 않는다
        if (subs.size() >= 2 && sw > 0) {
            Double[] r = indices(mean, sw, lsl, usl);
            c.setCp(r[0]);
            c.setCpu(r[1]);
            c.setCpl(r[2]);
            c.setCpk(r[3]);
        }
        return c;
    }

    /** [Cp, Cpu, Cpl, Cpk] — 한쪽 규격만 있으면 그쪽만 */
    private static Double[] indices(double mean, double sigma, Double lsl, Double usl) {
        Double p = lsl != null && usl != null ? (usl - lsl) / (6 * sigma) : null;
        Double u = usl != null ? (usl - mean) / (3 * sigma) : null;
        Double l = lsl != null ? (mean - lsl) / (3 * sigma) : null;
        Double k = u == null ? l : l == null ? u : Math.min(u, l);
        return new Double[] { p, u, l, k };
    }

    // ===================== 공통 =====================

    private HardnessMeas requireMeas(Long measId) {
        HardnessMeas m = measId == null ? null : hardnessDao.selectMeasById(measId);
        if (m == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "경도 측정을 찾을 수 없습니다.");
        }
        return m;
    }

    /** CHECK SHEET에서 입력된 측정은 CHECK SHEET에서만 고친다(값이 한 곳에만 있게) */
    private HardnessMeas requireEditable(Long measId) {
        HardnessMeas m = requireMeas(measId);
        if (m.getCheckRowId() != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "CHECK SHEET에서 입력한 측정입니다. CHECK SHEET에서 고쳐주세요.");
        }
        return m;
    }

    private HardnessMeas requireMeasuring(Long measId) {
        HardnessMeas m = requireMeas(measId);
        if (!MEASURING.equals(m.getStatus())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "완료된 측정입니다. 고치려면 '다시 측정'으로 열어주세요.");
        }
        return m;
    }

    private HardnessSet requireSet(Long setId) {
        HardnessSet s = setId == null ? null : hardnessDao.selectSetById(setId);
        if (s == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "측정 세트를 찾을 수 없습니다.");
        }
        return s;
    }

    private static boolean outOfSpec(BigDecimal v, BigDecimal lsl, BigDecimal usl) {
        return v != null && ((lsl != null && v.compareTo(lsl) < 0) || (usl != null && v.compareTo(usl) > 0));
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

    private static Long toLong(Object o) {
        return o == null ? null : ((Number) o).longValue();
    }

    private static LocalDateTime toDateTime(Object o) {
        if (o instanceof LocalDateTime ldt) {
            return ldt;
        }
        if (o instanceof Timestamp ts) {
            return ts.toLocalDateTime();
        }
        return null;
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String limit(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
