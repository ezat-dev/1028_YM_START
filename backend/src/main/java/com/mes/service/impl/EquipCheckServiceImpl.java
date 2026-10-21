package com.mes.service.impl;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mes.common.exception.BusinessException;
import com.mes.common.exception.ErrorCode;
import com.mes.dao.BaseDao;
import com.mes.dao.EquipCheckDao;
import com.mes.domain.base.User;
import com.mes.domain.condition.EquipCheckBoard;
import com.mes.domain.condition.EquipCheckConfirm;
import com.mes.domain.condition.EquipCheckItem;
import com.mes.domain.condition.EquipCheckMonth;
import com.mes.domain.condition.EquipCheckResult;
import com.mes.domain.condition.EquipCheckSheet;
import com.mes.service.EquipCheckService;

@Service
public class EquipCheckServiceImpl implements EquipCheckService {

    // 새 점검표 기본값 — 현장 종이 양식 그대로
    private static final String DEFAULT_LEGEND =
            "[{\"mark\":\"○\",\"label\":\"양호\"},{\"mark\":\"△\",\"label\":\"수리\"},"
            + "{\"mark\":\"□\",\"label\":\"조정\"},{\"mark\":\"X\",\"label\":\"교환\"}]";
    private static final String DEFAULT_CYCLE =
            "[{\"code\":\"D\",\"label\":\"매일\"},{\"code\":\"W\",\"label\":\"주간\"},{\"code\":\"M\",\"label\":\"월간\"}]";
    private static final String DEFAULT_SIGN = "[\"담당\",\"검토\",\"확인\"]";
    private static final String DEFAULT_FOOTER = "점검결과 이상이 발견되면 즉시 관리 책임자에게 보고한다.";

    private static final String SIGN_IMG_PREFIX = "data:image/png;base64,";
    private static final int SIGN_IMG_MAX = 400_000; // 서명 PNG(base64) 최대 길이

    private static final Set<String> PHOTO_EXT = Set.of("jpg", "jpeg", "png", "gif", "webp", "bmp");
    private static final long PHOTO_MAX = 15L * 1024 * 1024;

    /** 수치 기록 — 숫자 최대 3자리(소수점 포함 가능): 180, 12.5, 0.85 */
    private static final java.util.regex.Pattern NUM_MARK = java.util.regex.Pattern.compile("^(\\d{1,3}|\\d{1,2}\\.\\d|\\d\\.\\d{1,2})$");

    private final EquipCheckDao dao;
    private final BaseDao baseDao;
    private final ObjectMapper objectMapper;

    @Value("${app.equip-check-dir}")
    private String photoDir;

    public EquipCheckServiceImpl(EquipCheckDao dao, BaseDao baseDao, ObjectMapper objectMapper) {
        this.dao = dao;
        this.baseDao = baseDao;
        this.objectMapper = objectMapper;
    }

    // ===================== 점검표(양식) =====================

    @Override
    public List<EquipCheckSheet> getSheets(String useYn) {
        LocalDate today = LocalDate.now();
        String ym = YearMonth.from(today).toString();
        List<EquipCheckSheet> list = dao.selectSheetList(useYn, ym, today.getDayOfMonth());

        // 이번 달 '양호(범례 첫 기호)'가 아닌 기록 수
        Map<Long, Map<String, Long>> counts = new HashMap<>();
        for (Map<String, Object> row : dao.selectMarkCounts(ym)) {
            Long sheetId = ((Number) row.get("sheetId")).longValue();
            counts.computeIfAbsent(sheetId, k -> new HashMap<>())
                    .put(String.valueOf(row.get("mark")), ((Number) row.get("cnt")).longValue());
        }
        for (EquipCheckSheet s : list) {
            String good = goodMark(s);
            long issues = counts.getOrDefault(s.getSheetId(), Map.of()).entrySet().stream()
                    .filter(e -> !e.getKey().equals(good) && !"#OK".equals(e.getKey()))
                    .mapToLong(Map.Entry::getValue).sum();
            s.setMonthIssueCount((int) issues);
        }
        return list;
    }

    @Override
    @Transactional
    public EquipCheckSheet createSheet(EquipCheckSheet body) {
        String[] who = resolveUser(body.getRegUserId(), body.getRegUserName());
        EquipCheckSheet s = new EquipCheckSheet();
        EquipCheckSheet from = body.getCopyFromId() == null ? null : requireSheet(body.getCopyFromId());
        s.setTitle(defaultIfBlank(body.getTitle(), from != null ? from.getTitle() : "설비점검표"));
        s.setEquipName(trim(body.getEquipName()));
        s.setModelNo(blankToNull(body.getModelNo()));
        s.setLegendJson(from != null ? from.getLegendJson() : DEFAULT_LEGEND);
        s.setCycleJson(from != null ? from.getCycleJson() : DEFAULT_CYCLE);
        s.setSignJson(from != null ? from.getSignJson() : DEFAULT_SIGN);
        s.setFooterNote(from != null ? from.getFooterNote() : DEFAULT_FOOTER);
        s.setUseYn("Y");
        s.setSortOrder(dao.selectMaxSortOrder() + 1);
        s.setRegUserId(who[0]);
        s.setRegUserName(who[1]);
        validateSheet(s);
        dao.insertSheet(s);

        if (from != null) {
            // 항목만 복사(사진은 설비마다 달라서 가져오지 않는다)
            int seq = 0;
            for (EquipCheckItem src : dao.selectActiveItems(from.getSheetId())) {
                EquipCheckItem it = new EquipCheckItem();
                it.setSheetId(s.getSheetId());
                it.setLocation(src.getLocation());
                it.setItemName(src.getItemName());
                it.setCycle(src.getCycle());
                it.setRangeMin(src.getRangeMin());
                it.setRangeMax(src.getRangeMax());
                it.setSeq(++seq);
                dao.insertItem(it);
            }
        }
        return dao.selectSheetById(s.getSheetId());
    }

    @Override
    @Transactional
    public EquipCheckSheet updateSheet(Long sheetId, EquipCheckSheet body) {
        EquipCheckSheet old = requireSheet(sheetId);
        String[] who = resolveUser(body.getUpdUserId(), body.getUpdUserName());
        old.setTitle(defaultIfBlank(body.getTitle(), "설비점검표"));
        old.setEquipName(trim(body.getEquipName()));
        old.setModelNo(blankToNull(body.getModelNo()));
        if (body.getLegendJson() != null) {
            old.setLegendJson(body.getLegendJson());
        }
        if (body.getCycleJson() != null) {
            old.setCycleJson(body.getCycleJson());
        }
        if (body.getSignJson() != null) {
            old.setSignJson(body.getSignJson());
        }
        old.setFooterNote(blankToNull(body.getFooterNote()));
        if (body.getUseYn() != null) {
            old.setUseYn("N".equals(body.getUseYn()) ? "N" : "Y");
        }
        old.setUpdUserId(who[0]);
        old.setUpdUserName(who[1]);
        validateSheet(old);

        // 지운 주기 코드를 아직 쓰는 항목이 있으면 막는다
        Set<String> codes = new HashSet<>();
        for (Map<String, String> c : parseList(old.getCycleJson())) {
            codes.add(c.get("code"));
        }
        for (EquipCheckItem it : dao.selectActiveItems(sheetId)) {
            if (!codes.contains(it.getCycle())) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                        "주기 '" + it.getCycle() + "'를 쓰는 항목(" + it.getItemName() + ")이 있어 지울 수 없습니다. 항목의 주기를 먼저 바꿔주세요.");
            }
        }
        dao.updateSheet(old);
        return dao.selectSheetById(sheetId);
    }

    @Override
    @Transactional
    public void deleteSheets(List<Long> sheetIds) {
        if (sheetIds == null || sheetIds.isEmpty()) {
            return;
        }
        List<Path> files = new ArrayList<>();
        for (Long id : sheetIds) {
            requireSheet(id);
            for (String p : dao.selectItemPhotoPaths(id)) {
                Path f = resolveStored(p);
                if (f != null) {
                    files.add(f);
                }
            }
            dao.deleteSheet(id); // 항목·기록·결재는 FK CASCADE
        }
        files.forEach(EquipCheckServiceImpl::deleteQuietly);
    }

    // ===================== 한 달 화면 =====================

    @Override
    public EquipCheckBoard getBoard(Long sheetId, String ym) {
        EquipCheckSheet sheet = requireSheet(sheetId);
        String y = requireYm(ym);
        EquipCheckBoard b = new EquipCheckBoard();
        b.setSheet(sheet);
        b.setItems(dao.selectBoardItems(sheetId, y));
        EquipCheckMonth month = dao.selectMonth(sheetId, y);
        if (month == null) {
            month = new EquipCheckMonth();
            month.setSheetId(sheetId);
            month.setYm(y);
        }
        b.setMonth(month);
        b.setResults(dao.selectResults(sheetId, y));
        b.setNotes(dao.selectNotes(sheetId, y));
        b.setConfirms(dao.selectConfirms(sheetId, y));
        b.setToday(LocalDate.now().toString());
        b.setLocked(isLocked(month));
        return b;
    }

    // ===================== 항목 =====================

    @Override
    @Transactional
    public EquipCheckItem addItem(Long sheetId, EquipCheckItem body) {
        EquipCheckSheet sheet = requireSheet(sheetId);
        EquipCheckItem it = new EquipCheckItem();
        it.setSheetId(sheetId);
        it.setLocation(blankToNull(body.getLocation()));
        it.setItemName(trim(body.getItemName()));
        it.setCycle(defaultIfBlank(body.getCycle(), firstCycle(sheet)));
        validateItem(sheet, it);
        it.setSeq(dao.selectMaxItemSeq(sheetId) + 1);
        dao.insertItem(it);
        return dao.selectItemById(it.getItemId());
    }

    @Override
    @Transactional
    public EquipCheckItem updateItem(Long itemId, EquipCheckItem body) {
        EquipCheckItem it = requireItem(itemId);
        EquipCheckSheet sheet = requireSheet(it.getSheetId());
        it.setLocation(blankToNull(body.getLocation()));
        it.setItemName(trim(body.getItemName()));
        it.setCycle(defaultIfBlank(body.getCycle(), it.getCycle()));
        it.setRangeMin(rangeBound(body.getRangeMin(), "하한"));
        it.setRangeMax(rangeBound(body.getRangeMax(), "상한"));
        if (it.getRangeMin() != null && it.getRangeMax() != null && it.getRangeMin().compareTo(it.getRangeMax()) >= 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "범위 하한은 상한보다 작아야 합니다.");
        }
        validateItem(sheet, it);
        dao.updateItem(it);
        return dao.selectItemById(itemId);
    }

    @Override
    @Transactional
    public void deleteItem(Long itemId) {
        EquipCheckItem it = requireItem(itemId);
        if (dao.countItemUsage(itemId) > 0) {
            // 기록이 있으면 숨기기만 — 지난 달 점검표에는 그대로 남는다
            dao.hideItem(itemId);
            return;
        }
        dao.deleteItem(itemId);
        deleteQuietly(resolveStored(it.getPhotoPath()));
    }

    @Override
    @Transactional
    public void moveItem(Long itemId, String dir) {
        EquipCheckItem it = requireItem(itemId);
        List<EquipCheckItem> items = dao.selectActiveItems(it.getSheetId());
        int idx = -1;
        for (int i = 0; i < items.size(); i++) {
            if (items.get(i).getItemId().equals(itemId)) {
                idx = i;
            }
        }
        int to = "up".equals(dir) ? idx - 1 : idx + 1;
        if (idx < 0 || to < 0 || to >= items.size()) {
            return;
        }
        EquipCheckItem other = items.remove(to);
        items.add(idx, other);
        for (int i = 0; i < items.size(); i++) {
            dao.updateItemSeq(items.get(i).getItemId(), i + 1);
        }
    }

    @Override
    @Transactional
    public EquipCheckItem uploadPhoto(Long itemId, MultipartFile file) {
        EquipCheckItem it = requireItem(itemId);
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "사진을 선택해주세요.");
        }
        String original = originalName(file);
        String ext = extOf(original);
        if (!PHOTO_EXT.contains(ext)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "사진 파일(jpg, png, gif, webp, bmp)만 올릴 수 있습니다.");
        }
        if (file.getSize() > PHOTO_MAX) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "사진은 15MB까지 올릴 수 있습니다.");
        }
        Path base = Paths.get(photoDir).toAbsolutePath().normalize();
        String sub = it.getSheetId() + "/" + UUID.randomUUID().toString().replace("-", "") + "." + ext;
        Path target = base.resolve(sub);
        try {
            Files.createDirectories(target.getParent());
            file.transferTo(target);
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "사진 저장에 실패했습니다.");
        }
        String oldPath = it.getPhotoPath();
        it.setPhotoPath(sub);
        it.setPhotoName(limit(original, 255));
        it.setPhotoType(limit(file.getContentType() == null ? "" : file.getContentType(), 100));
        try {
            dao.updateItemPhoto(it);
        } catch (RuntimeException e) {
            deleteQuietly(target);
            throw e;
        }
        deleteQuietly(resolveStored(oldPath));
        return dao.selectItemById(itemId);
    }

    @Override
    @Transactional
    public EquipCheckItem deletePhoto(Long itemId) {
        EquipCheckItem it = requireItem(itemId);
        String oldPath = it.getPhotoPath();
        it.setPhotoPath(null);
        it.setPhotoName(null);
        it.setPhotoType(null);
        dao.updateItemPhoto(it);
        deleteQuietly(resolveStored(oldPath));
        return dao.selectItemById(itemId);
    }

    @Override
    public EquipCheckItem getItem(Long itemId) {
        return requireItem(itemId);
    }

    @Override
    public Resource loadPhoto(EquipCheckItem item) {
        Path p = resolveStored(item.getPhotoPath());
        if (p == null || !Files.exists(p)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "사진이 없습니다.");
        }
        try {
            return new UrlResource(p.toUri());
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "사진을 열 수 없습니다.");
        }
    }

    // ===================== 기록 =====================

    @Override
    @Transactional
    public EquipCheckResult setResult(Long itemId, String ym, int day, String mark, String userId, String userName) {
        EquipCheckItem it = requireItem(itemId);
        EquipCheckSheet sheet = requireSheet(it.getSheetId());
        String y = requireYm(ym);
        requireDay(y, day);
        requireUnlocked(sheet.getSheetId(), y);
        String m = trim(mark);
        if (m.isEmpty()) {
            dao.deleteResult(itemId, y, day);
            return null;
        }
        if (!marks(sheet).contains(m)) {
            // 범례 기호가 아니면 수치(최대 3자리, 예: 180 · 12.5 · 0.85)
            if (!NUM_MARK.matcher(m).matches()) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "범례 기호나 숫자(최대 3자리)만 기록할 수 있습니다: " + m);
            }
            m = new java.math.BigDecimal(m).stripTrailingZeros().toPlainString();
        }
        String[] who = resolveUser(userId, userName);
        EquipCheckResult r = new EquipCheckResult();
        r.setItemId(itemId);
        r.setYm(y);
        r.setDay(day);
        r.setMark(m);
        r.setUserId(who[0]);
        r.setUserName(who[1]);
        r.setCheckedDt(LocalDateTime.now().withNano(0));
        dao.upsertResult(r);
        fillInspector(sheet.getSheetId(), y, who[1]);
        return r;
    }

    @Override
    @Transactional
    public EquipCheckBoard fillDay(Long sheetId, String ym, int day, String mark, String userId, String userName) {
        EquipCheckSheet sheet = requireSheet(sheetId);
        String y = requireYm(ym);
        requireDay(y, day);
        requireUnlocked(sheetId, y);
        String m = mark == null || mark.isBlank() ? goodMark(sheet) : mark.trim();
        if (!marks(sheet).contains(m)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "범례에 없는 기호입니다: " + m);
        }
        String[] who = resolveUser(userId, userName);
        LocalDateTime now = LocalDateTime.now().withNano(0);
        for (EquipCheckItem it : dao.selectActiveItems(sheetId)) {
            EquipCheckResult r = new EquipCheckResult();
            r.setItemId(it.getItemId());
            r.setYm(y);
            r.setDay(day);
            r.setMark(m);
            r.setUserId(who[0]);
            r.setUserName(who[1]);
            r.setCheckedDt(now);
            dao.insertResultIfEmpty(r);
        }
        fillInspector(sheetId, y, who[1]);
        return getBoard(sheetId, y);
    }

    @Override
    @Transactional
    public EquipCheckMonth saveMonth(Long sheetId, String ym, String inspectorName, String remark) {
        requireSheet(sheetId);
        String y = requireYm(ym);
        dao.ensureMonth(sheetId, y);
        dao.updateMonthInfo(sheetId, y, limit(blankToNull(inspectorName), 50), blankToNull(remark));
        return dao.selectMonth(sheetId, y);
    }

    @Override
    @Transactional
    public void saveNote(Long itemId, String ym, String note) {
        EquipCheckItem it = requireItem(itemId);
        String y = requireYm(ym);
        requireUnlocked(it.getSheetId(), y);
        String n = blankToNull(note);
        if (n == null) {
            dao.deleteNote(itemId, y);
        } else {
            dao.upsertNote(itemId, y, limit(n, 200));
        }
    }

    /** 머리의 점검자가 비어 있으면 처음 기록한 사람(로그인 사용자) 이름으로 */
    private void fillInspector(Long sheetId, String ym, String name) {
        if (name == null || name.isEmpty()) {
            return;
        }
        dao.ensureMonth(sheetId, ym);
        dao.fillInspectorIfEmpty(sheetId, ym, name);
    }

    // ===================== 결재 · 관리책임자 확인 =====================

    /** 서명 이름(입력값 → 없으면 로그인 사용자 이름) */
    private static String signNameOf(String signName, String[] who) {
        String n = trim(signName);
        n = n.isEmpty() ? who[1] : n;
        if (n.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "서명하거나 이름을 입력해주세요.");
        }
        return limit(n, 50);
    }

    /** 서명 이미지는 PNG data URL만, 크기 제한 */
    private static String signImgOf(String signImg) {
        String s = trim(signImg);
        if (s.isEmpty()) {
            return null;
        }
        if (!s.startsWith(SIGN_IMG_PREFIX) || s.length() > SIGN_IMG_MAX) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "서명 이미지가 올바르지 않습니다. 다시 서명해주세요.");
        }
        return s;
    }

    @Override
    @Transactional
    public EquipCheckMonth sign(Long sheetId, String ym, int slot, boolean on, String userId, String userName,
            String signName, String signImg) {
        requireSheet(sheetId);
        String y = requireYm(ym);
        if (slot < 1 || slot > 3) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "결재 칸이 올바르지 않습니다.");
        }
        String[] who = resolveUser(userId, userName);
        dao.ensureMonth(sheetId, y);
        EquipCheckMonth m = dao.selectMonth(sheetId, y);
        String curId = slot == 1 ? m.getSign1UserId() : slot == 2 ? m.getSign2UserId() : m.getSign3UserId();
        String curName = slot == 1 ? m.getSign1Name() : slot == 2 ? m.getSign2Name() : m.getSign3Name();
        if (on) {
            if (curName != null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 " + curName + "님이 결재했습니다.");
            }
            dao.updateSign(sheetId, y, slot, who[0], signNameOf(signName, who), LocalDateTime.now(), signImgOf(signImg));
        } else {
            if (curName == null) {
                return m;
            }
            if (curId != null && !curId.isEmpty() && !curId.equals(who[0])) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "결재한 본인(" + curName + ")만 취소할 수 있습니다.");
            }
            dao.updateSign(sheetId, y, slot, null, null, null, null);
        }
        return dao.selectMonth(sheetId, y);
    }

    @Override
    @Transactional
    public List<EquipCheckConfirm> confirm(Long sheetId, String ym, int weekNo, boolean on, String userId, String userName,
            String signName, String signImg) {
        requireSheet(sheetId);
        String y = requireYm(ym);
        int lastDay = YearMonth.parse(y).lengthOfMonth();
        if (weekNo < 1 || (weekNo - 1) * 7 + 1 > lastDay) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "확인 주차가 올바르지 않습니다.");
        }
        String[] who = resolveUser(userId, userName);
        EquipCheckConfirm cur = dao.selectConfirm(sheetId, y, weekNo);
        if (on) {
            if (cur != null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 " + cur.getUserName() + "님이 확인했습니다.");
            }
            dao.insertConfirm(sheetId, y, weekNo, who[0], signNameOf(signName, who), signImgOf(signImg));
        } else if (cur != null) {
            if (cur.getUserId() != null && !cur.getUserId().isEmpty() && !cur.getUserId().equals(who[0])) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "확인한 본인(" + cur.getUserName() + ")만 취소할 수 있습니다.");
            }
            dao.deleteConfirm(sheetId, y, weekNo);
        }
        return dao.selectConfirms(sheetId, y);
    }

    // ===================== 검증 =====================

    private void validateSheet(EquipCheckSheet s) {
        if (s.getEquipName().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비명을 입력해주세요.");
        }
        if (s.getEquipName().length() > 100 || (s.getModelNo() != null && s.getModelNo().length() > 100)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비명·모델 NO는 100자까지 입력할 수 있습니다.");
        }
        s.setTitle(limit(s.getTitle(), 50));
        s.setFooterNote(limit(s.getFooterNote(), 300));

        List<Map<String, String>> legend = parseList(s.getLegendJson());
        if (legend.isEmpty() || legend.size() > 8) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "범례는 1~8개로 정해주세요.");
        }
        Set<String> seen = new HashSet<>();
        for (Map<String, String> l : legend) {
            String mark = trim(l.get("mark"));
            if (mark.isEmpty() || mark.length() > 3 || !seen.add(mark)) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "범례 기호는 비우거나 겹칠 수 없습니다(3자 이내).");
            }
        }
        List<Map<String, String>> cycles = parseList(s.getCycleJson());
        if (cycles.isEmpty() || cycles.size() > 8) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "주기 범례는 1~8개로 정해주세요.");
        }
        seen.clear();
        for (Map<String, String> c : cycles) {
            String code = trim(c.get("code"));
            if (code.isEmpty() || code.length() > 3 || !seen.add(code)) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "주기 기호는 비우거나 겹칠 수 없습니다(3자 이내).");
            }
        }
        try {
            List<String> signs = objectMapper.readValue(s.getSignJson(), new TypeReference<List<String>>() { });
            if (signs.size() != 3) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "결재란은 3칸입니다.");
            }
        } catch (JsonProcessingException | IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "결재란 형식이 올바르지 않습니다.");
        }
    }

    private void validateItem(EquipCheckSheet sheet, EquipCheckItem it) {
        if (it.getItemName().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "점검항목을 입력해주세요.");
        }
        if (it.getItemName().length() > 200 || (it.getLocation() != null && it.getLocation().length() > 100)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "점검개소는 100자, 점검항목은 200자까지 입력할 수 있습니다.");
        }
        boolean ok = parseList(sheet.getCycleJson()).stream().anyMatch(c -> it.getCycle().equals(c.get("code")));
        if (!ok) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "주기 범례에 없는 주기입니다: " + it.getCycle());
        }
    }

    private void requireUnlocked(Long sheetId, String ym) {
        if (isLocked(dao.selectMonth(sheetId, ym))) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "결재(확인)가 끝난 달이라 고칠 수 없습니다. 결재를 취소한 뒤 고쳐주세요.");
        }
    }

    private static boolean isLocked(EquipCheckMonth m) {
        return m != null && m.getSign3Name() != null;
    }

    private static String requireYm(String ym) {
        try {
            return YearMonth.parse(trim(ym)).toString();
        } catch (DateTimeParseException e) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "점검 년월(YYYY-MM)이 올바르지 않습니다.");
        }
    }

    /** 그달에 있는 날이고, 오늘 이후가 아니어야 한다 */
    private static void requireDay(String ym, int day) {
        YearMonth y = YearMonth.parse(ym);
        if (day < 1 || day > y.lengthOfMonth()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "날짜가 올바르지 않습니다.");
        }
        if (y.atDay(day).isAfter(LocalDate.now())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "앞으로 올 날짜는 미리 기록할 수 없습니다.");
        }
    }

    private EquipCheckSheet requireSheet(Long sheetId) {
        EquipCheckSheet s = sheetId == null ? null : dao.selectSheetById(sheetId);
        if (s == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "점검표를 찾을 수 없습니다.");
        }
        return s;
    }

    private EquipCheckItem requireItem(Long itemId) {
        EquipCheckItem it = itemId == null ? null : dao.selectItemById(itemId);
        if (it == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "점검 항목을 찾을 수 없습니다.");
        }
        return it;
    }

    // ===================== 범례 =====================

    private List<Map<String, String>> parseList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<Map<String, String>>>() { });
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "범례 형식이 올바르지 않습니다.");
        }
    }

    /** 범위 값 — 기록과 같은 크기(0 ~ 999) */
    private static java.math.BigDecimal rangeBound(java.math.BigDecimal v, String label) {
        if (v == null) {
            return null;
        }
        if (v.signum() < 0 || v.compareTo(new java.math.BigDecimal("999")) > 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "범위 " + label + "은 0 ~ 999 사이로 입력해주세요.");
        }
        return v.setScale(Math.min(Math.max(v.scale(), 0), 3), java.math.RoundingMode.HALF_UP);
    }

    private Set<String> marks(EquipCheckSheet s) {
        Set<String> set = new HashSet<>();
        for (Map<String, String> l : parseList(s.getLegendJson())) {
            set.add(trim(l.get("mark")));
        }
        return set;
    }

    private String goodMark(EquipCheckSheet s) {
        List<Map<String, String>> legend = parseList(s.getLegendJson());
        return legend.isEmpty() ? "○" : trim(legend.get(0).get("mark"));
    }

    private String firstCycle(EquipCheckSheet s) {
        List<Map<String, String>> cycles = parseList(s.getCycleJson());
        return cycles.isEmpty() ? "D" : trim(cycles.get(0).get("code"));
    }

    // ===================== 파일 · 공통 =====================

    /** 기준 폴더 밖을 가리키는 경로는 거부한다. */
    private Path resolveStored(String storedPath) {
        if (storedPath == null || storedPath.isBlank()) {
            return null;
        }
        Path base = Paths.get(photoDir).toAbsolutePath().normalize();
        Path target = base.resolve(storedPath).normalize();
        return target.startsWith(base) ? target : null;
    }

    private static void deleteQuietly(Path p) {
        if (p == null) {
            return;
        }
        try {
            Files.deleteIfExists(p);
        } catch (IOException ignore) {
            // 파일이 잠겨 있어도 DB는 이미 정리됨 — 고아 파일만 남는다
        }
    }

    private static String originalName(MultipartFile f) {
        String n = f.getOriginalFilename();
        if (n == null || n.isBlank()) {
            return "photo";
        }
        n = n.replace('\\', '/');
        return n.substring(n.lastIndexOf('/') + 1);
    }

    private static String extOf(String name) {
        int i = name.lastIndexOf('.');
        return i < 0 ? "" : name.substring(i + 1).toLowerCase();
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

    private static String defaultIfBlank(String s, String def) {
        return s == null || s.isBlank() ? def : s.trim();
    }

    private static String limit(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
