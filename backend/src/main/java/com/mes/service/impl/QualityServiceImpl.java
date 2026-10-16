package com.mes.service.impl;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.mes.common.exception.BusinessException;
import com.mes.common.exception.ErrorCode;
import com.mes.common.response.PageResponse;
import com.mes.common.util.Paging;
import com.mes.dao.QualityDao;
import com.mes.domain.quality.Cpk;
import com.mes.domain.quality.Ppk;
import com.mes.domain.quality.TempUniform;
import com.mes.domain.quality.Hardness;
import com.mes.domain.quality.Nonconform;
import com.mes.service.QualityService;

@Service
@Transactional(readOnly = true)
public class QualityServiceImpl implements QualityService {

    private final QualityDao qualityDao;

    @Value("${app.tempUniform-upload-dir}")
    private String tempUniformUploadDir;

    public QualityServiceImpl(QualityDao qualityDao) {
        this.qualityDao = qualityDao;
    }

    @Override
    public PageResponse<Cpk> getCpkList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<Cpk> content = qualityDao.selectCpkList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = qualityDao.selectCpkCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    public PageResponse<Ppk> getPpkList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<Ppk> content = qualityDao.selectPpkList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = qualityDao.selectPpkCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    // ── F/PROOF SAVE / LIST ──

    private static final DateTimeFormatter FPROOF_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    // 아직 종료되지 않은 세션의 상세 조회 상한 — 서버/DB 시계 차이에 기대지 않으려고 고정값을 쓴다.
    private static final String FPROOF_OPEN_END = "9999-12-31 23:59:59";

    @Override
    public List<Map<String, Object>> getFproofEquips() {
        List<Map<String, Object>> equips = qualityDao.selectFproofEquips();
        resolveFproofTriggers(equips);

        Map<Integer, List<Map<String, Object>>> tagsByFolder = new HashMap<>();
        for (Map<String, Object> tag : qualityDao.selectFproofEquipTags()) {
            tagsByFolder.computeIfAbsent(((Number) tag.get("folderId")).intValue(), k -> new ArrayList<>()).add(tag);
        }

        for (Map<String, Object> e : equips) {
            e.put("tags", tagsByFolder.getOrDefault(((Number) e.get("folderId")).intValue(), List.of()));
        }
        return equips;
    }

    /** selectEquips의 지정값/기본값 컬럼을 최종 startTagId·endTagId·custom으로 정리한다(설비 행을 그 자리에서 고친다). */
    private void resolveFproofTriggers(List<Map<String, Object>> equips) {
        for (Map<String, Object> e : equips) {
            Object customStart = e.remove("customStartTagId");
            Object customEnd = e.remove("customEndTagId");
            Object defaultStart = e.remove("defaultStartTagId");
            Object defaultEnd = e.remove("defaultEndTagId");
            boolean custom = customStart != null && customEnd != null;
            e.put("custom", custom);
            e.put("startTagId", custom ? customStart : defaultStart);
            e.put("endTagId", custom ? customEnd : defaultEnd);
        }
    }

    @Override
    public List<Integer> getFproofSelected(Integer folderId) {
        if (folderId == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비를 선택해주세요.");
        }
        return qualityDao.selectFproofSelectedTagIds(folderId);
    }

    @Override
    @Transactional
    public void selectFproofTag(Integer tagId, Integer folderId) {
        requireTagInFolder(tagId, folderId, "알람");
        qualityDao.insertFproofSelected(tagId, folderId);
    }

    @Override
    @Transactional
    public void deselectFproofTag(Integer tagId, Integer folderId) {
        requireTagInFolder(tagId, folderId, "알람");
        qualityDao.deleteFproofSelected(tagId);
    }

    @Override
    @Transactional
    public void saveFproofTrigger(Integer folderId, Integer startTagId, Integer endTagId) {
        if (folderId == null || startTagId == null || endTagId == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비와 시작·종료 트리거를 모두 지정해주세요.");
        }
        if (startTagId.equals(endTagId)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "시작 트리거와 종료 트리거는 서로 다른 알람 태그여야 합니다.");
        }
        requireTagInFolder(startTagId, folderId, "시작 트리거");
        requireTagInFolder(endTagId, folderId, "종료 트리거");
        qualityDao.upsertFproofTrigger(folderId, startTagId, endTagId);
    }

    @Override
    @Transactional
    public void resetFproofTrigger(Integer folderId) {
        if (folderId == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비를 선택해주세요.");
        }
        qualityDao.deleteFproofTrigger(folderId);
    }

    @Override
    public List<Map<String, Object>> getFproofSessions(String from, String to) {
        LocalDate[] range = parseFproofRange(from, to);
        List<Map<String, Object>> result = new ArrayList<>();
        for (FproofSession s : computeFproofSessions(range[0].toString(), range[1].toString())) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("folderId", s.folderId);
            row.put("folderName", s.folderName);
            row.put("startId", s.startId);
            row.put("startTime", s.startTime);
            row.put("endTime", s.endTime);
            row.put("alarmCount", s.alarms.size());
            result.add(row);
        }
        // 최근 세션이 위, 같은 시각이면 설비 순
        result.sort((a, b) -> {
            int byTime = ((String) b.get("startTime")).compareTo((String) a.get("startTime"));
            return byTime != 0 ? byTime : Integer.compare((Integer) a.get("folderId"), (Integer) b.get("folderId"));
        });
        return result;
    }

    @Override
    public List<Map<String, Object>> getFproofDetail(Integer folderId, String start, String end) {
        if (folderId == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비를 선택해주세요.");
        }
        String startText = parseFproofDateTime(start, "세션 시작 시각").format(FPROOF_DATETIME);
        String endText = (end == null || end.isBlank())
                ? FPROOF_OPEN_END
                : parseFproofDateTime(end, "세션 종료 시각").format(FPROOF_DATETIME);
        return qualityDao.selectFproofDetail(folderId, startText, endText);
    }

    @Override
    public List<Map<String, Object>> getFproofExport(String from, String to) {
        LocalDate[] range = parseFproofRange(from, to);
        List<FproofSession> sessions = computeFproofSessions(range[0].toString(), range[1].toString());
        // 설비 순 → 최근 세션 순
        sessions.sort((a, b) -> {
            int byFolder = Integer.compare(a.folderId, b.folderId);
            return byFolder != 0 ? byFolder : b.startTime.compareTo(a.startTime);
        });

        List<Map<String, Object>> rows = new ArrayList<>();
        for (FproofSession s : sessions) {
            if (s.alarms.isEmpty()) {
                rows.add(exportRow(s, null));   // 알람이 없는 세션도 한 줄은 남긴다
            } else {
                for (Map<String, Object> alarm : s.alarms) {
                    rows.add(exportRow(s, alarm));
                }
            }
        }
        return rows;
    }

    private Map<String, Object> exportRow(FproofSession s, Map<String, Object> alarm) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("folderId", s.folderId);
        row.put("folderName", s.folderName);
        row.put("startTime", s.startTime);
        row.put("endTime", s.endTime);
        if (alarm != null) {
            row.put("tagName", alarm.get("tagName"));
            row.put("alarmMsg", alarm.get("alarmMsg"));
            row.put("occurTime", alarm.get("occurTime"));
            row.put("clearTime", alarm.get("clearTime"));
        }
        return row;
    }

    /** 태그가 존재하고 그 설비(폴더)의 태그인지 확인한다 — 다른 설비의 태그를 섞어 지정하는 걸 막는다. */
    private void requireTagInFolder(Integer tagId, Integer folderId, String label) {
        if (tagId == null || folderId == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, label + " 태그와 설비를 지정해주세요.");
        }
        Integer actualFolderId = qualityDao.selectFproofTagFolderId(tagId);
        if (actualFolderId == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, label + " 태그를 찾을 수 없습니다.");
        }
        if (!actualFolderId.equals(folderId)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, label + " 태그는 해당 설비의 알람 태그여야 합니다.");
        }
    }

    private LocalDate[] parseFproofRange(String from, String to) {
        try {
            LocalDate f = LocalDate.parse(from);
            LocalDate t = LocalDate.parse(to);
            if (t.isBefore(f)) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "종료일이 시작일보다 빠릅니다.");
            }
            return new LocalDate[] { f, t };
        } catch (DateTimeParseException | NullPointerException e) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "조회 기간은 yyyy-MM-dd 형식이어야 합니다.");
        }
    }

    private LocalDateTime parseFproofDateTime(String value, String label) {
        try {
            return LocalDateTime.parse(value, FPROOF_DATETIME);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, label + "는 yyyy-MM-dd HH:mm:ss 형식이어야 합니다.");
        }
    }

    /** Fool Proof 세션 1개: 설비, 시작/종료 시각(endTime=null이면 미종료), 그 구간의 지정 알람 이력. */
    private static final class FproofSession {
        final int folderId;
        final String folderName;
        final Object startId;
        final String startTime;
        final String endTime;
        final List<Map<String, Object>> alarms = new ArrayList<>();

        FproofSession(int folderId, String folderName, Object startId, String startTime, String endTime) {
            this.folderId = folderId;
            this.folderName = folderName;
            this.startId = startId;
            this.startTime = startTime;
            this.endTime = endTime;
        }
    }

    /**
     * 기간(from~to, to 당일 포함) 안에 시작한 Fool Proof 세션을 계산한다.
     * 세션 = 설비의 시작 트리거 알람 발생 시각 ~ 그 시각 이후 처음 발생한 종료 트리거 알람 시각(없으면 미종료).
     * 시각은 'yyyy-MM-dd HH:mm:ss' 문자열이라 문자열 비교가 곧 시간 비교다.
     * SQL 한 방에 겹쳐 쓰지 않고 단순 조회 3개 + 자바 계산으로 한다(DB 부담과 응답 지연을 피하려고).
     */
    private List<FproofSession> computeFproofSessions(String from, String to) {
        List<Map<String, Object>> equips = qualityDao.selectFproofEquips();
        resolveFproofTriggers(equips);

        // 시작·종료 트리거가 둘 다 정해진 설비만 세션을 만들 수 있다.
        Map<Integer, Map<String, Object>> equipByStartTag = new HashMap<>();
        Map<Integer, Integer> folderByEndTag = new HashMap<>();
        for (Map<String, Object> e : equips) {
            if (e.get("startTagId") == null || e.get("endTagId") == null) {
                continue;
            }
            int folderId = ((Number) e.get("folderId")).intValue();
            equipByStartTag.put(((Number) e.get("startTagId")).intValue(), e);
            folderByEndTag.put(((Number) e.get("endTagId")).intValue(), folderId);
        }
        List<FproofSession> sessions = new ArrayList<>();
        if (equipByStartTag.isEmpty()) {
            return sessions;
        }

        List<Map<String, Object>> startEvents =
                qualityDao.selectFproofStartEvents(new ArrayList<>(equipByStartTag.keySet()), from, to);
        if (startEvents.isEmpty()) {
            return sessions;
        }

        // 설비별 종료 시각(오름차순 — 쿼리가 정렬해서 준다)
        Map<Integer, List<String>> endTimesByFolder = new HashMap<>();
        for (Map<String, Object> ev : qualityDao.selectFproofEndEvents(new ArrayList<>(folderByEndTag.keySet()), from)) {
            Integer folderId = folderByEndTag.get(((Number) ev.get("tagId")).intValue());
            endTimesByFolder.computeIfAbsent(folderId, k -> new ArrayList<>()).add((String) ev.get("occurTime"));
        }

        boolean anyOpen = false;
        String maxEnd = "";
        for (Map<String, Object> ev : startEvents) {
            Map<String, Object> equip = equipByStartTag.get(((Number) ev.get("tagId")).intValue());
            int folderId = ((Number) equip.get("folderId")).intValue();
            String start = (String) ev.get("occurTime");

            String end = null;
            for (String t : endTimesByFolder.getOrDefault(folderId, List.of())) {
                if (t.compareTo(start) >= 0) {
                    end = t;
                    break;
                }
            }
            if (end == null) {
                anyOpen = true;
            } else if (end.compareTo(maxEnd) > 0) {
                maxEnd = end;
            }
            sessions.add(new FproofSession(folderId, (String) equip.get("folderName"), ev.get("historyId"), start, end));
        }

        // 지정 알람 이력을 한 번에 가져와 세션 구간에 나눠 담는다. startEvents가 시각순이라 첫 항목이 가장 이르다.
        String earliest = sessions.get(0).startTime;
        String upper = anyOpen ? FPROOF_OPEN_END : maxEnd;
        Map<Integer, List<Map<String, Object>>> alarmsByFolder = new HashMap<>();
        for (Map<String, Object> alarm : qualityDao.selectFproofDesignatedEvents(earliest, upper)) {
            alarmsByFolder.computeIfAbsent(((Number) alarm.get("folderId")).intValue(), k -> new ArrayList<>()).add(alarm);
        }
        for (FproofSession s : sessions) {
            String sessionEnd = s.endTime != null ? s.endTime : FPROOF_OPEN_END;
            for (Map<String, Object> alarm : alarmsByFolder.getOrDefault(s.folderId, List.of())) {
                String occur = (String) alarm.get("occurTime");
                if (occur.compareTo(s.startTime) >= 0 && occur.compareTo(sessionEnd) <= 0) {
                    s.alarms.add(alarm);
                }
            }
        }
        return sessions;
    }

    @Override
    public List<TempUniform> getTempUniformList(String equipName, String judgment, String from, String to) {
        return qualityDao.selectTempUniformList(equipName, judgment, from, to);
    }

    @Override
    public List<String> getTempUniformEquipNames() {
        return qualityDao.selectTempUniformEquipNames();
    }

    @Override
    public TempUniform getTempUniformById(Long id) {
        TempUniform found = qualityDao.selectTempUniformById(id);
        if (found == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "온도균일성보고서 정보를 찾을 수 없습니다.");
        }
        return found;
    }

    @Override
    @Transactional
    public TempUniform createTempUniform(TempUniform tempUniform, MultipartFile file) {
        validateTempUniformMeta(tempUniform);
        applyJudgment(tempUniform);
        qualityDao.insertTempUniform(tempUniform);
        storeTempUniformFile(tempUniform.getId(), file);
        return getTempUniformById(tempUniform.getId());
    }

    @Override
    @Transactional
    public TempUniform updateTempUniform(Long id, TempUniform tempUniform, MultipartFile file) {
        validateTempUniformMeta(tempUniform);
        applyJudgment(tempUniform);
        tempUniform.setId(id);
        qualityDao.updateTempUniform(tempUniform);
        if (file != null && !file.isEmpty()) {
            TempUniform existing = getTempUniformById(id);
            storeTempUniformFile(id, file);
            if (existing.getFileName() != null && !existing.getFileName().isBlank()) {
                try {
                    Files.deleteIfExists(Paths.get(tempUniformUploadDir).resolve(existing.getFileName()));
                } catch (IOException ignored) {
                    // 이전 파일 삭제 실패는 수정 자체를 막을 이유가 아니므로 무시한다.
                }
            }
        }
        return getTempUniformById(id);
    }

    @Override
    @Transactional
    public void deleteTempUniform(Long id) {
        qualityDao.softDeleteTempUniform(id);
    }

    @Override
    public Resource loadTempUniformFile(String fileName) {
        try {
            Path target = Paths.get(tempUniformUploadDir).resolve(fileName);
            if (!Files.exists(target)) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "파일을 찾을 수 없습니다.");
            }
            return new UrlResource(target.toUri());
        } catch (MalformedURLException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "파일 경로가 올바르지 않습니다.");
        }
    }

    private void validateTempUniformMeta(TempUniform t) {
        if (t.getEquipName() == null || t.getEquipName().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비명을 입력해주세요.");
        }
        if (t.getSurveyDate() == null || t.getSurveyDate().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "조사일자를 입력해주세요.");
        }
    }

    /** 편차/판정은 클라이언트 입력을 신뢰하지 않고 항상 서버에서 다시 계산한다. */
    private void applyJudgment(TempUniform t) {
        BigDecimal set = t.getSetTemp() == null ? BigDecimal.ZERO : t.getSetTemp();
        BigDecimal max = t.getMaxTemp() == null ? BigDecimal.ZERO : t.getMaxTemp();
        BigDecimal min = t.getMinTemp() == null ? BigDecimal.ZERO : t.getMinTemp();
        BigDecimal tol = t.getTolerance() == null ? BigDecimal.ZERO : t.getTolerance();
        BigDecimal devHigh = max.subtract(set).abs();
        BigDecimal devLow = min.subtract(set).abs();
        BigDecimal deviation = devHigh.max(devLow);
        t.setDeviation(deviation);
        t.setJudgment(deviation.compareTo(tol) <= 0 ? "합격" : "불합격");
    }

    private void storeTempUniformFile(Long id, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return;
        }
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        if (!original.toLowerCase().endsWith(".pdf")) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "업로드 파일은 PDF 형식만 가능합니다: " + original);
        }
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : "";
        String newFileName = id + "_" + System.currentTimeMillis() + ext;
        try {
            Path dir = Paths.get(tempUniformUploadDir);
            Files.createDirectories(dir);
            file.transferTo(dir.resolve(newFileName));
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "파일 저장에 실패했습니다.");
        }
        qualityDao.updateTempUniformFile(id, newFileName, original, file.getSize());
    }

    @Override
    public PageResponse<Hardness> getHardnessList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<Hardness> content = qualityDao.selectHardnessList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = qualityDao.selectHardnessCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    public PageResponse<Nonconform> getNonconformList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<Nonconform> content = qualityDao.selectNonconformList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = qualityDao.selectNonconformCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

}
