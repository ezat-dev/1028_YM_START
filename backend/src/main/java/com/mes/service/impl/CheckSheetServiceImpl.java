package com.mes.service.impl;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mes.common.exception.BusinessException;
import com.mes.common.exception.ErrorCode;
import com.mes.dao.BaseDao;
import com.mes.dao.CheckSheetDao;
import com.mes.dao.HardnessDao;
import com.mes.dao.NonconformDao;
import com.mes.domain.base.Downtime;
import com.mes.domain.base.DowntimeReason;
import com.mes.domain.base.Equipment;
import com.mes.domain.base.User;
import com.mes.domain.production.CheckAudit;
import com.mes.domain.production.CheckBoard;
import com.mes.domain.production.CheckHardness;
import com.mes.domain.production.CheckRow;
import com.mes.domain.production.CheckSheet;
import com.mes.domain.production.CheckSign;
import com.mes.domain.quality.DefectType;
import com.mes.domain.quality.HardnessMeas;
import com.mes.domain.quality.HardnessSet;
import com.mes.domain.quality.HardnessSpec;
import com.mes.domain.quality.HardnessValue;
import com.mes.domain.quality.Nonconform;
import com.mes.service.CheckSheetService;
import com.mes.service.NonconformService;

@Service
public class CheckSheetServiceImpl implements CheckSheetService {

    /** 행마다 두 줄 — 종이 양식 그대로 */
    static final List<String> ITEMS = List.of("표면 경도", "심부 경도");
    static final Set<String> SLOTS = Set.of("담당", "검토", "승인", "확인", "설비관리", "품질관리", "품질보증", "생산관리");
    static final String LOCK_SLOT = "승인"; // 승인 서명이 있으면 행을 고칠 수 없다
    static final int MAX_VALUES = 5;
    private static final Pattern HHMM = Pattern.compile("^([01]?\\d|2[0-3]):[0-5]\\d$");
    private static final String SIGN_IMG_PREFIX = "data:image/png;base64,";
    private static final DateTimeFormatter YM = DateTimeFormatter.ofPattern("yyyyMM");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int AUDIT_MAX_DAYS = 62;

    private final CheckSheetDao dao;
    private final HardnessDao hardnessDao;
    private final BaseDao baseDao;
    private final NonconformDao ncDao;
    private final NonconformService ncService;

    public CheckSheetServiceImpl(CheckSheetDao dao, HardnessDao hardnessDao, BaseDao baseDao, NonconformDao ncDao,
            NonconformService ncService) {
        this.dao = dao;
        this.hardnessDao = hardnessDao;
        this.baseDao = baseDao;
        this.ncDao = ncDao;
        this.ncService = ncService;
    }

    // ===================== 조회 =====================

    @Override
    public List<Map<String, Object>> getEquips(LocalDate date) {
        return dao.selectEquipSummary(date == null ? LocalDate.now() : date);
    }

    @Override
    public List<CheckSheet> getSheets(String equipCode, LocalDate from, LocalDate to) {
        return dao.selectSheetList(trim(equipCode), from, to);
    }

    @Override
    public CheckBoard getBoard(String equipCode, LocalDate date) {
        Equipment eq = requireEquip(equipCode);
        LocalDate d = date == null ? LocalDate.now() : date;
        CheckBoard b = new CheckBoard();
        b.setEquipCode(eq.getEquipCode());
        b.setEquipName(eq.getEquipName());
        b.setProdDate(d);
        b.setToday(LocalDate.now().toString());
        CheckSheet sheet = dao.selectSheet(eq.getEquipCode(), d);
        b.setSheet(sheet);
        b.setRows(sheet == null ? new ArrayList<>() : withHardness(sheet.getSheetId(), dao.selectRows(sheet.getSheetId())));
        b.setSigns(sheet == null ? new ArrayList<>() : dao.selectSigns(sheet.getSheetId()));
        Map<String, String> st = getSettings();
        b.setSubtitle(st.get("subtitle"));
        b.setNote(st.get("note"));
        return b;
    }

    @Override
    public List<Map<String, Object>> getProducts(String equipCode) {
        return dao.selectProducts(trim(equipCode));
    }

    /** 기록 화면 — 기간(최대 62일)의 결재 현황 + 작성·수정 기록 */
    @Override
    public Map<String, Object> getAudit(LocalDate from, LocalDate to, String equipCode) {
        LocalDate t = to == null ? LocalDate.now() : to;
        LocalDate f = from == null ? t : from;
        if (f.isAfter(t)) {
            LocalDate x = f;
            f = t;
            t = x;
        }
        if (f.plusDays(AUDIT_MAX_DAYS).isBefore(t)) {
            f = t.minusDays(AUDIT_MAX_DAYS);
        }
        String eq = blankToNull(equipCode);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("from", f.toString());
        m.put("to", t.toString());
        m.put("sheets", dao.selectSheetsForAudit(f, t, eq));
        m.put("signs", dao.selectSignsForAudit(f, t, eq));
        m.put("logs", dao.selectAudits(f, t, eq));
        return m;
    }

    // ===================== 행(통) =====================

    @Override
    @Transactional
    public CheckRow addRow(CheckRow req) {
        String[] who = resolveUser(req.getUserId(), req.getUserName());
        CheckSheet sheet = ensureSheet(req.getEquipCode(), req.getProdDate(), who);
        requireUnlocked(sheet);
        List<CheckRow> rows = dao.selectRows(sheet.getSheetId());
        CheckRow src = null;
        if (req.getCopyFromRowId() != null) {
            src = dao.selectRow(req.getCopyFromRowId());
        } else if (!rows.isEmpty()) {
            src = rows.get(rows.size() - 1);
        }
        CheckRow r = new CheckRow();
        r.setSheetId(sheet.getSheetId());
        r.setRowNo(dao.selectMaxRowNo(sheet.getSheetId()) + 1);
        if (src != null) {
            // 종이에서 '〃'로 적던 칸은 위 행을 그대로 이어 쓴다. 작지 No는 앞부분만(예: 10-0412-)
            r.setVendor(src.getVendor());
            r.setPartNo(src.getPartNo());
            r.setProductName(src.getProductName());
            r.setSpecText(src.getSpecText());
            r.setMaterial(src.getMaterial());
            r.setHeatLotNo(src.getHeatLotNo());
            r.setWorker(src.getWorker());
            r.setLeader(src.getLeader());
            r.setQc(src.getQc());
            String lot = src.getLotNo();
            if (lot != null && lot.lastIndexOf('-') > 0) {
                r.setLotNo(lot.substring(0, lot.lastIndexOf('-') + 1));
            }
        }
        if (sheet.getProdDate().equals(LocalDate.now())) {
            r.setOutTime(LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm")));
        }
        dao.insertRow(r);
        List<Map<String, String>> ch = new ArrayList<>();
        diff(ch, "Part No", null, r.getPartNo());
        diff(ch, "작지 No", null, r.getLotNo());
        diff(ch, "출로시간", null, r.getOutTime());
        audit(sheet, r, "통", "추가", ch, who);
        return rowWithHardness(r.getRowId());
    }

    @Override
    @Transactional
    public CheckRow updateRow(Long rowId, CheckRow req) {
        CheckRow old = requireRow(rowId);
        CheckSheet sheet = dao.selectSheetById(old.getSheetId());
        requireUnlocked(sheet);
        String[] who = resolveUser(req.getUserId(), req.getUserName());

        CheckRow r = new CheckRow();
        r.setRowId(rowId);
        r.setSheetId(old.getSheetId());
        r.setRowNo(old.getRowNo());
        r.setOutTime(time(req.getOutTime(), "출로시간"));
        r.setVendor(limit(blankToNull(req.getVendor()), 50));
        r.setPartNo(limit(blankToNull(req.getPartNo()), 50));
        r.setProductName(limit(blankToNull(req.getProductName()), 100));
        r.setSpecText(limit(blankToNull(req.getSpecText()), 100));
        r.setLotNo(limit(blankToNull(req.getLotNo()), 30));
        r.setQtyKg(nonNegative(req.getQtyKg(), "생산량"));
        r.setDefectQty(nonNegative(req.getDefectQty(), "불량"));
        r.setDefectCode(blankToNull(req.getDefectCode()));
        r.setDownCode(blankToNull(req.getDownCode()) == null ? null : trim(req.getDownCode()).toUpperCase());
        r.setDownStart(time(req.getDownStart(), "비가동 시작"));
        r.setDownEnd(time(req.getDownEnd(), "비가동 끝"));
        r.setMaterial(limit(blankToNull(req.getMaterial()), 50));
        r.setHeatLotNo(limit(blankToNull(req.getHeatLotNo()), 20));
        r.setWorker(limit(blankToNull(req.getWorker()), 50));
        r.setLeader(limit(blankToNull(req.getLeader()), 50));
        r.setQc(limit(blankToNull(req.getQc()), 50));
        r.setDowntimeId(old.getDowntimeId());
        r.setNcId(old.getNcId());

        applyProductMaster(sheet.getEquipCode(), old, r);

        // 경도 값이 있는데 품번을 바꾸면 규격이 달라져 값이 엉뚱한 규격에 붙는다
        List<HardnessMeas> meas = dao.selectMeasByRow(rowId);
        if (!meas.isEmpty() && !eq(old.getPartNo(), r.getPartNo())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "경도 값이 있어 품번을 바꿀 수 없습니다. 경도 값을 먼저 지워주세요.");
        }

        syncDowntime(sheet, r, who);
        syncNonconform(sheet, r, who);
        dao.updateRow(r);

        // 기록 — 업체·품명·규격은 Part No를 따라가므로 Part No만 적는다
        List<Map<String, String>> ch = new ArrayList<>();
        diff(ch, "출로시간", old.getOutTime(), r.getOutTime());
        diff(ch, "Part No", old.getPartNo(), r.getPartNo());
        diff(ch, "작지 No", old.getLotNo(), r.getLotNo());
        diff(ch, "생산량(Kg)", old.getQtyKg(), r.getQtyKg());
        diff(ch, "불량 수량", old.getDefectQty(), r.getDefectQty());
        diff(ch, "불량 구분", old.getDefectCode(), r.getDefectCode());
        diff(ch, "비가동", downText(old), downText(r));
        diff(ch, "재질", old.getMaterial(), r.getMaterial());
        diff(ch, "열처리 LOT", old.getHeatLotNo(), r.getHeatLotNo());
        diff(ch, "작업자", old.getWorker(), r.getWorker());
        diff(ch, "조장", old.getLeader(), r.getLeader());
        diff(ch, "공정QC", old.getQc(), r.getQc());
        if (!ch.isEmpty()) {
            audit(sheet, r, "통", kind(ch), ch, who);
        }

        // 경도측정 기록도 행과 맞춘다(LOT·측정자·시각)
        LocalDateTime dt = rowDateTime(sheet, r);
        for (HardnessMeas m : meas) {
            dao.syncMeas(m.getMeasId(), r.getLotNo(), r.getWorker() == null ? who[1] : r.getWorker(), dt, m.getJudgement());
        }
        return rowWithHardness(rowId);
    }

    @Override
    @Transactional
    public void deleteRow(Long rowId, String userId, String userName) {
        CheckRow row = requireRow(rowId);
        CheckSheet sheet = dao.selectSheetById(row.getSheetId());
        requireUnlocked(sheet);
        String[] who = resolveUser(userId, userName);
        List<String> linked = new ArrayList<>();
        if (row.getNcId() != null) {
            Nonconform nc = ncDao.selectById(row.getNcId());
            if (nc != null && !"대기".equals(nc.getStatus())) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                        "부적합(" + nc.getNcNo() + ")이 '" + nc.getStatus() + "' 상태라 이 행을 지울 수 없습니다. 부적합품관리에서 확인해주세요.");
            }
            if (nc != null) {
                ncDao.delete(nc.getNcId());
                linked.add("부적합 " + nc.getNcNo());
            }
        }
        if (row.getDowntimeId() != null) {
            baseDao.deleteDowntime(row.getDowntimeId());
            linked.add("비가동 " + downText(row));
        }
        List<HardnessMeas> meas = dao.selectMeasByRow(rowId);
        for (HardnessMeas m : meas) {
            hardnessDao.deleteMeas(m.getMeasId()); // 세트·값은 FK CASCADE
        }
        if (!meas.isEmpty()) {
            linked.add("경도 " + meas.stream().map(HardnessMeas::getItemName).collect(Collectors.joining("·")));
        }
        dao.deleteRow(rowId);
        List<Map<String, String>> ch = new ArrayList<>();
        diff(ch, "Part No", row.getPartNo(), null);
        diff(ch, "작지 No", row.getLotNo(), null);
        diff(ch, "출로시간", row.getOutTime(), null);
        diff(ch, "같이 삭제", String.join(", ", linked), null);
        audit(sheet, row, "통", "삭제", ch, who);
        // 번호를 1부터 다시 매긴다(통 번호가 끊기지 않게)
        int no = 1;
        for (CheckRow r : dao.selectRows(sheet.getSheetId())) {
            if (r.getRowNo() != no) {
                dao.updateRowNo(r.getRowId(), no);
            }
            no++;
        }
    }

    // ===================== 경도 (표면/심부 X1~X5) =====================

    @Override
    @Transactional
    public CheckRow saveHardness(Long rowId, String itemName, List<BigDecimal> values, String userId, String userName) {
        CheckRow row = requireRow(rowId);
        CheckSheet sheet = dao.selectSheetById(row.getSheetId());
        requireUnlocked(sheet);
        String item = trim(itemName);
        if (!ITEMS.contains(item)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "경도 구분은 표면 경도 / 심부 경도입니다.");
        }
        BigDecimal[] vals = new BigDecimal[MAX_VALUES];
        if (values != null) {
            for (int i = 0; i < Math.min(values.size(), MAX_VALUES); i++) {
                BigDecimal v = values.get(i);
                if (v != null && (v.compareTo(BigDecimal.ZERO) <= 0 || v.compareTo(new BigDecimal("2000")) > 0)) {
                    throw new BusinessException(ErrorCode.INVALID_PARAMETER, "경도 값이 올바르지 않습니다: " + v.stripTrailingZeros().toPlainString());
                }
                vals[i] = v;
            }
        }
        boolean any = Arrays.stream(vals).anyMatch(v -> v != null);
        HardnessMeas meas = dao.selectMeasByRowItem(rowId, item);
        String[] who = resolveUser(userId, userName);
        String before = valuesText(rowWithHardness(rowId).getHardness().stream()
                .filter(h -> item.equals(h.getItemName())).findFirst().map(h -> h.getValues()).orElse(null));
        String label = item.replace(" 경도", "") + " X1~X5";
        if (!any) {
            if (meas != null) {
                hardnessDao.deleteMeas(meas.getMeasId());
                List<Map<String, String>> ch = new ArrayList<>();
                diff(ch, label, before, null);
                audit(sheet, row, "경도", "삭제", ch, who);
            }
            return rowWithHardness(rowId);
        }
        if (row.getPartNo() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "품번(Part No)을 먼저 입력해주세요.");
        }
        HardnessSpec spec = hardnessDao.selectSpecByPartItem(sheet.getEquipCode(), row.getPartNo(), item);
        if (spec == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    sheet.getEquipCode() + " · " + row.getPartNo() + "의 " + item + " 규격이 없습니다. 기준정보 > 경도관리에서 등록해주세요.");
        }
        LocalDateTime dt = rowDateTime(sheet, row);
        Long setId;
        if (meas == null) {
            meas = new HardnessMeas();
            meas.setSpecId(spec.getSpecId());
            meas.setPartNo(spec.getPartNo());
            meas.setProductName(row.getProductName() != null ? row.getProductName() : spec.getProductName());
            meas.setItemName(spec.getItemName());
            meas.setUnit(spec.getUnit());
            meas.setLsl(spec.getLsl());
            meas.setUsl(spec.getUsl());
            meas.setSampleSize(MAX_VALUES);
            meas.setLotNo(row.getLotNo());
            meas.setEquipCode(sheet.getEquipCode());
            meas.setMeasDt(dt);
            meas.setWorkerName(limit(row.getWorker() != null ? row.getWorker() : who[1], 50));
            meas.setRemark("CHECK SHEET " + sheet.getProdDate() + " No." + row.getRowNo());
            meas.setRegUserId(who[0]);
            meas.setRegUserName(who[1]);
            String prefix = "HDM-" + LocalDate.now().format(YM) + "-";
            meas.setMeasNo(prefix + String.format("%03d", hardnessDao.selectMeasMaxNo(prefix) + 1));
            hardnessDao.insertMeas(meas);
            dao.linkMeas(meas.getMeasId(), rowId);
            HardnessSet s = new HardnessSet();
            s.setMeasId(meas.getMeasId());
            s.setSetType("검사");
            s.setSeq(1);
            hardnessDao.insertSet(s);
            setId = s.getSetId();
        } else {
            List<HardnessSet> sets = hardnessDao.selectSets(meas.getMeasId());
            if (sets.isEmpty()) {
                HardnessSet s = new HardnessSet();
                s.setMeasId(meas.getMeasId());
                s.setSetType("검사");
                s.setSeq(1);
                hardnessDao.insertSet(s);
                setId = s.getSetId();
            } else {
                setId = sets.get(0).getSetId();
            }
        }
        boolean ng = false;
        for (int i = 0; i < MAX_VALUES; i++) {
            if (vals[i] == null) {
                hardnessDao.deleteValue(setId, i + 1);
                continue;
            }
            HardnessValue v = new HardnessValue();
            v.setSetId(setId);
            v.setIdx(i + 1);
            v.setValue(vals[i]);
            v.setSource("MANUAL");
            v.setDeviceId("");
            hardnessDao.upsertValue(v);
            if ((meas.getLsl() != null && vals[i].compareTo(meas.getLsl()) < 0)
                    || (meas.getUsl() != null && vals[i].compareTo(meas.getUsl()) > 0)) {
                ng = true;
            }
        }
        // CHECK SHEET 값은 바로 '완료' — CPK·PPK에 곧장 들어간다
        hardnessDao.updateMeasStatus(meas.getMeasId(), "완료", ng ? "불합격" : "합격", dt);
        List<Map<String, String>> ch = new ArrayList<>();
        diff(ch, label, before, valuesText(Arrays.asList(vals)));
        if (!ch.isEmpty()) {
            audit(sheet, row, "경도", kind(ch), ch, who);
        }
        return rowWithHardness(rowId);
    }

    // ===================== 머리 · 서명 · 설정 =====================

    @Override
    @Transactional
    public CheckSheet saveHead(String equipCode, LocalDate date, CheckSheet head) {
        String[] who = resolveUser(head.getRegUserId(), head.getRegUserName());
        CheckSheet sheet = ensureSheet(equipCode, date, who);
        List<Map<String, String>> ch = new ArrayList<>();
        String day = limit(blankToNull(head.getWorkerDay()), 50);
        String night = limit(blankToNull(head.getWorkerNight()), 50);
        String qc = limit(blankToNull(head.getQcName()), 50);
        diff(ch, "주간 작업자", sheet.getWorkerDay(), day);
        diff(ch, "야간 작업자", sheet.getWorkerNight(), night);
        diff(ch, "공정QC 담당자", sheet.getQcName(), qc);
        sheet.setWorkerDay(day);
        sheet.setWorkerNight(night);
        sheet.setQcName(qc);
        dao.updateSheetHead(sheet);
        if (!ch.isEmpty()) {
            audit(sheet, null, "머리", kind(ch), ch, who);
        }
        return dao.selectSheetById(sheet.getSheetId());
    }

    @Override
    @Transactional
    public List<CheckSign> sign(String equipCode, LocalDate date, String slot, boolean on, String userId, String userName,
            String signName, String signImg) {
        String s = trim(slot);
        if (!SLOTS.contains(s)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "서명 칸이 올바르지 않습니다.");
        }
        String[] who = resolveUser(userId, userName);
        CheckSheet sheet = ensureSheet(equipCode, date, who);
        CheckSign cur = dao.selectSign(sheet.getSheetId(), s);
        if (on) {
            if (cur != null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 " + cur.getSignName() + "님이 서명했습니다.");
            }
            String name = trim(signName).isEmpty() ? who[1] : trim(signName);
            if (name.isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "서명하거나 이름을 입력해주세요.");
            }
            String img = trim(signImg);
            if (!img.isEmpty() && (!img.startsWith(SIGN_IMG_PREFIX) || img.length() > 400_000)) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "서명 이미지가 올바르지 않습니다. 다시 서명해주세요.");
            }
            CheckSign g = new CheckSign();
            g.setSheetId(sheet.getSheetId());
            g.setSlot(s);
            g.setUserId(who[0]);
            g.setSignName(limit(name, 50));
            g.setSignImg(img.isEmpty() ? null : img);
            dao.insertSign(g);
            List<Map<String, String>> ch = new ArrayList<>();
            diff(ch, s, null, g.getSignName() + (img.isEmpty() ? " (이름)" : " (손 서명)"));
            audit(sheet, null, "서명", "서명", ch, who);
        } else if (cur != null) {
            if (cur.getUserId() != null && !cur.getUserId().isEmpty() && !cur.getUserId().equals(who[0])) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "서명한 본인(" + cur.getSignName() + ")만 취소할 수 있습니다.");
            }
            dao.deleteSign(sheet.getSheetId(), s);
            List<Map<String, String>> ch = new ArrayList<>();
            diff(ch, s, cur.getSignName(), null);
            audit(sheet, null, "서명", "서명취소", ch, who);
        }
        return dao.selectSigns(sheet.getSheetId());
    }

    @Override
    public Map<String, String> getSettings() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("subtitle", "BOLT / SCREW");
        m.put("note", "");
        for (Map<String, Object> r : dao.selectSettings()) {
            m.put(String.valueOf(r.get("k")), r.get("v") == null ? "" : String.valueOf(r.get("v")));
        }
        return m;
    }

    @Override
    @Transactional
    public Map<String, String> saveSettings(String subtitle, String note) {
        if (subtitle != null) {
            dao.upsertSetting("subtitle", limit(trim(subtitle), 100));
        }
        if (note != null) {
            dao.upsertSetting("note", limit(note.strip(), 2000));
        }
        return getSettings();
    }

    // ===================== 연동: 비가동 · 부적합 =====================

    /** 표기(코드) + 시작~끝이 다 있으면 설비비가동현황에 한 건, 빠지면 지운다 */
    private void syncDowntime(CheckSheet sheet, CheckRow r, String[] who) {
        boolean timed = r.getDownCode() != null && r.getDownStart() != null && r.getDownEnd() != null;
        if (!timed) {
            if (r.getDowntimeId() != null) {
                baseDao.deleteDowntime(r.getDowntimeId());
                r.setDowntimeId(null);
            }
            if (r.getDownCode() != null && baseDao.selectDowntimeReasonByCode(r.getDownCode()) == null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "없는 비가동 코드입니다: " + r.getDownCode());
            }
            return;
        }
        DowntimeReason reason = baseDao.selectDowntimeReasonByCode(r.getDownCode());
        if (reason == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "없는 비가동 코드입니다: " + r.getDownCode());
        }
        Equipment eq = requireEquip(sheet.getEquipCode());
        LocalDateTime start = sheet.getProdDate().atTime(LocalTime.parse(pad(r.getDownStart())));
        LocalDateTime end = sheet.getProdDate().atTime(LocalTime.parse(pad(r.getDownEnd())));
        if (!end.isAfter(start)) {
            end = end.plusDays(1); // 자정을 넘긴 비가동
        }
        if (start.isAfter(LocalDateTime.now().plusMinutes(1))) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "앞으로 올 시각의 비가동은 입력할 수 없습니다.");
        }
        if (baseDao.countDowntimeOverlap(eq.getEquipId(), start, end, r.getDowntimeId()) > 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    eq.getEquipCode() + "에 같은 시간대 비가동이 이미 있습니다. 설비비가동현황을 확인해주세요.");
        }
        Downtime cur = r.getDowntimeId() == null ? null : baseDao.selectDowntimeById(r.getDowntimeId());
        String memo = "CHECK SHEET " + sheet.getProdDate() + " No." + r.getRowNo();
        if (cur != null) {
            cur.setEquipId(eq.getEquipId());
            cur.setReasonId(reason.getReasonId());
            cur.setStartDt(start);
            cur.setEndDt(end);
            cur.setMemo(memo);
            cur.setUpdUserId(who[0]);
            cur.setUpdUserName(who[1]);
            baseDao.updateDowntime(cur);
        } else {
            Downtime d = new Downtime();
            d.setEquipId(eq.getEquipId());
            d.setReasonId(reason.getReasonId());
            d.setStartDt(start);
            d.setEndDt(end);
            d.setSource("SHEET");
            d.setCheckRowId(r.getRowId());
            d.setMemo(memo);
            d.setRegUserId(who[0]);
            d.setRegUserName(who[1]);
            baseDao.insertDowntime(d);
            r.setDowntimeId(d.getDowntimeId());
        }
    }

    /** 불량 수량 + 구분이 있으면 부적합품관리에 한 건(대기), 지우면 같이 지운다(처리 시작 전까지만) */
    private void syncNonconform(CheckSheet sheet, CheckRow r, String[] who) {
        boolean has = r.getDefectQty() != null && r.getDefectQty().compareTo(BigDecimal.ZERO) > 0;
        Nonconform cur = r.getNcId() == null ? null : ncDao.selectById(r.getNcId());
        if (!has) {
            if (cur != null) {
                if (!"대기".equals(cur.getStatus())) {
                    throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                            "부적합(" + cur.getNcNo() + ")이 '" + cur.getStatus() + "' 상태라 불량을 지울 수 없습니다. 부적합품관리에서 확인해주세요.");
                }
                ncDao.delete(cur.getNcId());
            }
            r.setNcId(null);
            return;
        }
        if (r.getDefectCode() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "불량 구분을 골라주세요.");
        }
        DefectType t = ncDao.selectDefectTypeByCode(r.getDefectCode());
        if (t == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "없는 불량 구분입니다: " + r.getDefectCode());
        }
        Nonconform n = cur != null ? cur : new Nonconform();
        n.setOccurDate(sheet.getProdDate());
        n.setEquipCode(sheet.getEquipCode());
        n.setPartNo(r.getPartNo());
        n.setProductName(r.getProductName());
        n.setLotNo(r.getLotNo());
        n.setDefectCode(t.getDefectCode());
        n.setDefectName(t.getDefectName());
        n.setQty(r.getDefectQty());
        if (cur != null) {
            n.setUpdUserId(who[0]);
            n.setUpdUserName(who[1]);
            ncDao.update(n);
        } else {
            n.setNcNo(ncService.nextNo(sheet.getProdDate()));
            n.setUnit("EA");
            n.setStatus("대기");
            n.setSource("SHEET");
            n.setCheckRowId(r.getRowId());
            n.setRemark("CHECK SHEET " + sheet.getProdDate() + " No." + r.getRowNo());
            n.setRegUserId(who[0]);
            n.setRegUserName(who[1]);
            ncDao.insert(n);
            r.setNcId(n.getNcId());
        }
    }

    // ===================== 작성·수정 기록 =====================

    /** 기록 한 건 — 누가(계정·이름·IP) 어느 시트·통의 무엇을 */
    private void audit(CheckSheet sheet, CheckRow row, String target, String action, List<Map<String, String>> changes,
            String[] who) {
        CheckAudit a = new CheckAudit();
        a.setSheetId(sheet.getSheetId());
        a.setEquipCode(sheet.getEquipCode());
        a.setProdDate(sheet.getProdDate());
        if (row != null) {
            a.setRowId(row.getRowId());
            a.setRowNo(row.getRowNo());
            a.setPartNo(row.getPartNo());
        }
        a.setTarget(target);
        a.setAction(action);
        try {
            a.setChanges(changes == null || changes.isEmpty() ? null : JSON.writeValueAsString(changes));
        } catch (JsonProcessingException e) {
            a.setChanges(null);
        }
        a.setUserId(limit(blankToNull(who[0]), 50));
        a.setUserName(limit(blankToNull(who[1]), 50));
        a.setClientIp(clientIp());
        dao.insertAudit(a);
    }

    /** 바뀐 항목만 담는다 — f: 항목, b: 전, a: 후 */
    private static void diff(List<Map<String, String>> out, String field, Object before, Object after) {
        String b = auditText(before);
        String a = auditText(after);
        if (!b.equals(a)) {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("f", field);
            m.put("b", b);
            m.put("a", a);
            out.add(m);
        }
    }

    /** 전이 모두 빈 칸이면 입력, 후가 모두 빈 칸이면 삭제, 그 밖은 수정 */
    private static String kind(List<Map<String, String>> ch) {
        if (ch.stream().allMatch(m -> m.get("b").isEmpty())) {
            return "입력";
        }
        if (ch.stream().allMatch(m -> m.get("a").isEmpty())) {
            return "삭제";
        }
        return "수정";
    }

    private static String auditText(Object o) {
        if (o == null) {
            return "";
        }
        if (o instanceof BigDecimal d) {
            return d.stripTrailingZeros().toPlainString();
        }
        return o.toString().trim();
    }

    private static String downText(CheckRow r) {
        if (r.getDownCode() == null) {
            return "";
        }
        String t = r.getDownStart() == null ? "" : " " + r.getDownStart() + "~" + (r.getDownEnd() == null ? "" : r.getDownEnd());
        return r.getDownCode() + t;
    }

    /** X1~X5 — 빈 칸은 '-', 끝의 빈 칸은 뺀다 */
    private static String valuesText(List<BigDecimal> values) {
        if (values == null) {
            return "";
        }
        List<String> out = new ArrayList<>();
        for (BigDecimal v : values) {
            out.add(v == null ? "-" : v.stripTrailingZeros().toPlainString());
        }
        while (!out.isEmpty() && "-".equals(out.get(out.size() - 1))) {
            out.remove(out.size() - 1);
        }
        return String.join(", ", out);
    }

    /** 요청한 PC의 IP — 같은 PC의 프록시를 거쳤을 때만 X-Forwarded-For를 믿는다 */
    private static String clientIp() {
        RequestAttributes ra = RequestContextHolder.getRequestAttributes();
        if (!(ra instanceof ServletRequestAttributes sra)) {
            return null;
        }
        HttpServletRequest req = sra.getRequest();
        String ip = req.getRemoteAddr();
        String xf = req.getHeader("X-Forwarded-For");
        if (isLoopback(ip) && xf != null && !xf.isBlank()) {
            ip = xf.split(",")[0].trim();
        }
        if (isLoopback(ip)) {
            ip = "127.0.0.1";
        }
        return limit(ip, 45);
    }

    private static boolean isLoopback(String ip) {
        return ip == null || "127.0.0.1".equals(ip) || "0:0:0:0:0:0:0:1".equals(ip) || "::1".equals(ip);
    }

    // ===================== 공통 =====================

    private CheckSheet ensureSheet(String equipCode, LocalDate date, String[] who) {
        Equipment eq = requireEquip(equipCode);
        if (date == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "생산일자를 골라주세요.");
        }
        if (date.isAfter(LocalDate.now())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "앞으로 올 날짜의 CHECK SHEET는 미리 만들 수 없습니다.");
        }
        CheckSheet s = dao.selectSheet(eq.getEquipCode(), date);
        if (s == null) {
            s = new CheckSheet();
            s.setEquipCode(eq.getEquipCode());
            s.setProdDate(date);
            s.setRegUserId(who[0]);
            s.setRegUserName(who[1]);
            dao.insertSheet(s);
            s = dao.selectSheetById(s.getSheetId());
        }
        return s;
    }

    private void requireUnlocked(CheckSheet sheet) {
        if (sheet != null && dao.selectSign(sheet.getSheetId(), LOCK_SLOT) != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "승인된 CHECK SHEET라 고칠 수 없습니다. 승인을 취소한 뒤 고쳐주세요.");
        }
    }

    private Equipment requireEquip(String equipCode) {
        Equipment eq = trim(equipCode).isEmpty() ? null : baseDao.selectEquipmentByCode(trim(equipCode));
        if (eq == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "호기를 골라주세요.");
        }
        return eq;
    }

    private CheckRow requireRow(Long rowId) {
        CheckRow r = rowId == null ? null : dao.selectRow(rowId);
        if (r == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "CHECK SHEET 행을 찾을 수 없습니다.");
        }
        return r;
    }

    private CheckRow rowWithHardness(Long rowId) {
        CheckRow r = dao.selectRow(rowId);
        return withHardness(r.getSheetId(), List.of(r)).get(0);
    }

    /** 행마다 표면/심부 경도 값(X1~X5)을 붙인다 */
    private List<CheckRow> withHardness(Long sheetId, List<CheckRow> rows) {
        Map<Long, Map<String, CheckHardness>> byRow = new HashMap<>();
        for (Map<String, Object> m : dao.selectRowHardness(sheetId)) {
            Long rowId = ((Number) m.get("rowId")).longValue();
            String item = (String) m.get("itemName");
            CheckHardness h = byRow.computeIfAbsent(rowId, k -> new LinkedHashMap<>()).computeIfAbsent(item, k -> {
                CheckHardness x = new CheckHardness();
                x.setItemName(item);
                x.setMeasId(((Number) m.get("measId")).longValue());
                x.setSpecId(m.get("specId") == null ? null : ((Number) m.get("specId")).longValue());
                x.setJudgement((String) m.get("judgement"));
                x.setValues(new ArrayList<>(Arrays.asList(new BigDecimal[MAX_VALUES])));
                return x;
            });
            if (m.get("idx") != null && m.get("value") != null) {
                int idx = ((Number) m.get("idx")).intValue();
                if (idx >= 1 && idx <= MAX_VALUES) {
                    h.getValues().set(idx - 1, new BigDecimal(String.valueOf(m.get("value"))));
                }
            }
        }
        for (CheckRow r : rows) {
            Map<String, CheckHardness> hs = byRow.get(r.getRowId());
            r.setHardness(hs == null ? new ArrayList<>() : new ArrayList<>(hs.values()));
        }
        return rows;
    }

    /** 경도측정 시각 = 생산일자 + 출로시간(없으면 지금/정오) */
    private static LocalDateTime rowDateTime(CheckSheet sheet, CheckRow r) {
        if (r.getOutTime() != null) {
            return sheet.getProdDate().atTime(LocalTime.parse(pad(r.getOutTime())));
        }
        return sheet.getProdDate().equals(LocalDate.now()) ? LocalDateTime.now().withNano(0) : sheet.getProdDate().atTime(12, 0);
    }

    private static String time(String s, String label) {
        String t = trim(s);
        if (t.isEmpty()) {
            return null;
        }
        if (t.matches("^\\d{3,4}$")) { // 1245 → 12:45 (종이에 적던 대로)
            t = t.substring(0, t.length() - 2) + ":" + t.substring(t.length() - 2);
        }
        if (!HHMM.matcher(t).matches()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, label + " 시각은 HH:MM으로 입력해주세요.");
        }
        return pad(t);
    }

    private static String pad(String t) {
        return t.length() == 4 ? "0" + t : t;
    }

    private static BigDecimal nonNegative(BigDecimal v, String label) {
        if (v != null && v.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, label + "은 0 이상이어야 합니다.");
        }
        return v;
    }

    /**
     * 업체 · Part No · 품명 · 규격은 기준정보(제품관리) 값 — 시트에서 직접 고치지 않는다.
     * Part No는 기준정보 목록에서만 고르고, 나머지는 그 품번의 기준정보로 채운다(재질은 비었을 때만).
     */
    private void applyProductMaster(String equipCode, CheckRow old, CheckRow r) {
        if (r.getPartNo() == null) {
            r.setVendor(null);
            r.setProductName(null);
            r.setSpecText(null);
            return;
        }
        Map<String, Object> p = null;
        for (Map<String, Object> m : dao.selectProducts(equipCode)) {
            if (r.getPartNo().equals(m.get("partNo"))) {
                p = m;
                break;
            }
        }
        if (p == null) {
            if (!eq(old.getPartNo(), r.getPartNo())) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                        "기준정보(제품관리·경도관리)에 없는 Part No입니다: " + r.getPartNo());
            }
            // 기준정보에서 빠진 예전 품번 — 적혀 있던 값을 그대로 둔다
            r.setVendor(old.getVendor());
            r.setProductName(old.getProductName());
            r.setSpecText(old.getSpecText());
            return;
        }
        r.setVendor(limit(blankToNull(str(p.get("vendor"))), 50));
        r.setProductName(limit(blankToNull(str(p.get("productName"))), 100));
        r.setSpecText(limit(blankToNull(str(p.get("specText"))), 100));
        if (r.getMaterial() == null) {
            r.setMaterial(limit(blankToNull(str(p.get("material"))), 50));
        }
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static boolean eq(String a, String b) {
        return a == null ? b == null : a.equals(b);
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
