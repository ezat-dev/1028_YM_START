package com.mes.service.impl;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.mes.common.response.PageResponse;
import com.mes.common.util.Paging;
import com.mes.dao.MonitoringDao;
import com.mes.domain.monitoring.ProdStatus;
import com.mes.domain.monitoring.Integrated;
import com.mes.domain.monitoring.Alarm;
import com.mes.domain.monitoring.AlarmRank;
import com.mes.domain.monitoring.AlarmFolder;
import com.mes.domain.monitoring.AlarmTag;
import com.mes.domain.monitoring.PlcDevice;
import com.mes.domain.monitoring.Trend;
import com.mes.domain.monitoring.TempTag;
import com.mes.domain.monitoring.TempMemo;
import com.mes.domain.monitoring.LotStatus;
import com.mes.domain.monitoring.LotTracking;
import com.mes.service.MonitoringService;

@Service
@Transactional(readOnly = true)
public class MonitoringServiceImpl implements MonitoringService {

    private final MonitoringDao monitoringDao;

    public MonitoringServiceImpl(MonitoringDao monitoringDao) {
        this.monitoringDao = monitoringDao;
    }

    @Override
    public PageResponse<ProdStatus> getProdStatusList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<ProdStatus> content = monitoringDao.selectProdStatusList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = monitoringDao.selectProdStatusCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    public PageResponse<Integrated> getIntegratedList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<Integrated> content = monitoringDao.selectIntegratedList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = monitoringDao.selectIntegratedCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    public PageResponse<Alarm> getAlarmList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<Alarm> content = monitoringDao.selectAlarmList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = monitoringDao.selectAlarmCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    public PageResponse<Trend> getTrendList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<Trend> content = monitoringDao.selectTrendList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = monitoringDao.selectTrendCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    public PageResponse<LotStatus> getLotStatusList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<LotStatus> content = monitoringDao.selectLotStatusList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = monitoringDao.selectLotStatusCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    public PageResponse<LotTracking> getLotTrackingList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<LotTracking> content = monitoringDao.selectLotTrackingList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = monitoringDao.selectLotTrackingCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    // ── 경보모니터링 (ez_scada 실데이터) ──

    @Override
    public List<AlarmFolder> getAlarmFolderList() {
        return monitoringDao.selectAlarmFolderList();
    }

    @Override
    @Transactional
    public void createAlarmFolder(AlarmFolder folder) {
        if (folder.getParentId() == null) folder.setParentId(0);
        if (folder.getSortOrder() == null) folder.setSortOrder(0);
        monitoringDao.insertAlarmFolder(folder);
    }

    @Override
    @Transactional
    public void deleteAlarmFolder(int folderId) {
        monitoringDao.deleteAlarmFolder(folderId);
    }

    @Override
    public List<AlarmTag> getAlarmTagList(int folderId) {
        return monitoringDao.selectAlarmTagList(folderId);
    }

    @Override
    @Transactional
    public void createAlarmTag(AlarmTag tag) {
        if (tag.getEnabled() == null) tag.setEnabled(1);
        monitoringDao.insertAlarmTag(tag);
    }

    @Override
    @Transactional
    public void updateAlarmTag(AlarmTag tag) {
        monitoringDao.updateAlarmTag(tag);
    }

    @Override
    @Transactional
    public void deleteAlarmTag(int tagId) {
        monitoringDao.deleteAlarmTag(tagId);
    }

    @Override
    public List<PlcDevice> getAlarmPlcList() {
        return monitoringDao.selectAlarmPlcList();
    }

    @Override
    @Transactional
    public void saveAlarmPlc(PlcDevice plc) {
        if (plc.getPort() == null) plc.setPort(2004);
        if (plc.getPlcType() == null || plc.getPlcType().isBlank()) plc.setPlcType("LS");
        if (plc.getLabel() == null || plc.getLabel().isBlank()) plc.setLabel(plc.getPlcId());
        if (plc.getEnabled() == null) plc.setEnabled(1);
        monitoringDao.insertOrUpdateAlarmPlc(plc);
    }

    @Override
    @Transactional
    public void deleteAlarmPlc(String plcId) {
        monitoringDao.deleteAlarmPlc(plcId);
    }

    @Override
    public List<Alarm> getActiveAlarms(int limit) {
        return monitoringDao.selectActiveAlarms(limit);
    }

    @Override
    public List<Alarm> getAlarmHistory(int limit) {
        return monitoringDao.selectAlarmHistory(limit);
    }

    @Override
    public List<Alarm> getAlarmHistoryRange(String from, String to) {
        LocalDateTime now = LocalDateTime.now();
        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        String f = (from != null && !from.isBlank()) ? from : now.minusHours(24).format(dtf);
        String t = (to != null && !to.isBlank()) ? to : now.format(dtf);
        Map<String, Object> p = new HashMap<>();
        p.put("from", f);
        p.put("to", t);
        return monitoringDao.selectAlarmHistoryRange(p);
    }

    @Override
    public List<AlarmRank> getAlarmRank(String from, String to, String groupBy) {
        String f = (from != null && !from.isBlank()) ? from : LocalDate.now().toString() + " 00:00:00";
        String t = (to != null && !to.isBlank()) ? to : LocalDate.now().toString();
        Map<String, Object> p = new HashMap<>();
        p.put("from", f);
        p.put("to", t);
        if ("folder".equalsIgnoreCase(groupBy)) {
            return monitoringDao.selectAlarmRankByFolder(p);
        }
        return "plc".equalsIgnoreCase(groupBy)
                ? monitoringDao.selectAlarmRankByPlc(p)
                : monitoringDao.selectAlarmRankByTag(p);
    }

    @Override
    public List<Map<String, Object>> getAlarmMessageCountsByFolder(String from, String to) {
        String f = (from != null && !from.isBlank()) ? from : LocalDate.now().toString() + " 00:00:00";
        String t = (to != null && !to.isBlank()) ? to : LocalDate.now().toString();
        Map<String, Object> p = new HashMap<>();
        p.put("from", f);
        p.put("to", t);
        return monitoringDao.selectAlarmMessageCountsByFolder(p);
    }

    // 최근 N시간을 정시(HH:00) 단위 버킷으로 끊어 매 시간 빠짐없이 반환한다(알람이 0건인 시간대도 0으로 채움) —
    // 대시보드 24시간 추이 차트가 프론트에서 직접 시간 버킷을 계산하던 것을 서버 집계로 대체.
    @Override
    public List<Map<String, Object>> getAlarmTrendOverall(int hours) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime nowHour = now.withMinute(0).withSecond(0).withNano(0);
        LocalDateTime fromHour = nowHour.minusHours(hours - 1);
        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        DateTimeFormatter bucketFmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:00:00");

        Map<String, Object> p = new HashMap<>();
        p.put("from", fromHour.format(dtf));
        p.put("to", now.format(dtf));
        List<Map<String, Object>> rows = monitoringDao.selectAlarmTrendOverall(p);

        Map<String, Long> countByBucket = new HashMap<>();
        for (Map<String, Object> row : rows) {
            Object bucket = row.get("bucket");
            Object cnt = row.get("cnt");
            if (bucket != null && cnt != null) {
                countByBucket.put(bucket.toString(), ((Number) cnt).longValue());
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (LocalDateTime cursor = fromHour; !cursor.isAfter(nowHour); cursor = cursor.plusHours(1)) {
            String bucketKey = cursor.format(bucketFmt);
            Map<String, Object> item = new HashMap<>();
            item.put("bucket", bucketKey);
            item.put("hour", String.format("%02d시", cursor.getHour()));
            item.put("count", countByBucket.getOrDefault(bucketKey, 0L));
            result.add(item);
        }
        return result;
    }

    @Override
    public List<Map<String, Object>> getAlarmTrendByFolder(String from, String to, String bucketUnit) {
        String f = (from != null && !from.isBlank()) ? from : LocalDate.now().toString() + " 00:00:00";
        String t = (to != null && !to.isBlank()) ? to : LocalDate.now().toString();
        Map<String, Object> p = new HashMap<>();
        p.put("from", f);
        p.put("to", t);
        p.put("bucketUnit", "HOUR".equalsIgnoreCase(bucketUnit) ? "HOUR" : "DAY");
        return monitoringDao.selectAlarmTrendByFolder(p);
    }

    // 최근 N시간, 정시 단위로 빠짐없이 채우되 레벨(1/2/3)별로 나눠 쌓는다 — 대시보드 메인 누적 영역 차트.
    @Override
    public List<Map<String, Object>> getAlarmTrendBySeverity(int hours) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime nowHour = now.withMinute(0).withSecond(0).withNano(0);
        LocalDateTime fromHour = nowHour.minusHours(hours - 1);
        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        DateTimeFormatter bucketFmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:00:00");

        Map<String, Object> p = new HashMap<>();
        p.put("from", fromHour.format(dtf));
        p.put("to", now.format(dtf));
        List<Map<String, Object>> rows = monitoringDao.selectAlarmTrendBySeverity(p);

        Map<String, Map<Integer, Long>> countByBucketLevel = new HashMap<>();
        for (Map<String, Object> row : rows) {
            Object bucket = row.get("bucket");
            Object level = row.get("level");
            Object cnt = row.get("cnt");
            if (bucket == null || level == null || cnt == null) continue;
            countByBucketLevel
                    .computeIfAbsent(bucket.toString(), k -> new HashMap<>())
                    .put(((Number) level).intValue(), ((Number) cnt).longValue());
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (LocalDateTime cursor = fromHour; !cursor.isAfter(nowHour); cursor = cursor.plusHours(1)) {
            String bucketKey = cursor.format(bucketFmt);
            Map<Integer, Long> byLevel = countByBucketLevel.getOrDefault(bucketKey, Map.of());
            long l1 = byLevel.getOrDefault(1, 0L);
            long l2 = byLevel.getOrDefault(2, 0L);
            long l3 = byLevel.getOrDefault(3, 0L);
            Map<String, Object> item = new HashMap<>();
            item.put("bucket", bucketKey);
            item.put("hour", String.format("%02d:00", cursor.getHour()));
            item.put("level1", l1);
            item.put("level2", l2);
            item.put("level3", l3);
            item.put("total", l1 + l2 + l3);
            result.add(item);
        }
        return result;
    }

    // 최근 N시간 내 발생한 알람을 설비×레벨로 집계 — 대시보드 수평 누적 막대 차트. 시간축이 없어
    // (설비는 이미 유한 집합이라) 빈 칸 채우기는 프론트에서 피벗할 때 처리한다.
    @Override
    public List<Map<String, Object>> getAlarmCountByFolderSeverity(int hours) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime from = now.minusHours(hours);
        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        Map<String, Object> p = new HashMap<>();
        p.put("from", from.format(dtf));
        p.put("to", now.format(dtf));
        return monitoringDao.selectAlarmCountByFolderSeverity(p);
    }

    // 해제된 알람만 대상으로 발생~해제 소요 시간(분) 평균을 시간대별로 — 데이터 없는 시간대는
    // avgMinutes를 null로 둔다(0분과 "데이터 없음"은 다른 의미라 0으로 채우면 오해를 부른다).
    @Override
    public List<Map<String, Object>> getAlarmResponseTimeTrend(int hours) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime nowHour = now.withMinute(0).withSecond(0).withNano(0);
        LocalDateTime fromHour = nowHour.minusHours(hours - 1);
        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        DateTimeFormatter bucketFmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:00:00");

        Map<String, Object> p = new HashMap<>();
        p.put("from", fromHour.format(dtf));
        p.put("to", now.format(dtf));
        List<Map<String, Object>> rows = monitoringDao.selectAlarmResponseTimeTrend(p);

        Map<String, Double> avgByBucket = new HashMap<>();
        Map<String, Long> cntByBucket = new HashMap<>();
        for (Map<String, Object> row : rows) {
            Object bucket = row.get("bucket");
            Object avg = row.get("avgMinutes");
            Object cnt = row.get("cnt");
            if (bucket == null) continue;
            if (avg != null) avgByBucket.put(bucket.toString(), ((Number) avg).doubleValue());
            if (cnt != null) cntByBucket.put(bucket.toString(), ((Number) cnt).longValue());
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (LocalDateTime cursor = fromHour; !cursor.isAfter(nowHour); cursor = cursor.plusHours(1)) {
            String bucketKey = cursor.format(bucketFmt);
            Double avg = avgByBucket.get(bucketKey);
            Map<String, Object> item = new HashMap<>();
            item.put("bucket", bucketKey);
            item.put("hour", String.format("%02d:00", cursor.getHour()));
            item.put("avgMinutes", avg != null ? Math.round(avg * 10) / 10.0 : null);
            item.put("count", cntByBucket.getOrDefault(bucketKey, 0L));
            result.add(item);
        }
        return result;
    }

    // ── 트렌드 설정 (ez_scada.tb_temp_tag / tb_temp_snapshot) ──
    // sample_pro TempServiceImpl과 동일한 스키마 자동관리 + 컬럼명 생성 규칙을 그대로 이식했다.

    private void ensureTempTables() {
        monitoringDao.ensureTempTagTable();
        if (monitoringDao.countTempTagColumn("col_name") == 0) {
            monitoringDao.addTempTagColNameColumn();
        }
        if (monitoringDao.countTempTagColumn("equip_id") == 0) {
            monitoringDao.addTempTagEquipIdColumn();
        }
        if (monitoringDao.countTempTagColumn("scale") == 0) {
            monitoringDao.addTempTagScaleColumn();
        }
        monitoringDao.ensureTempSnapshotTable();
        fillMissingColNames();
    }

    @Override
    public List<TempTag> getTempTagFullList() {
        ensureTempTables();
        return monitoringDao.selectTempTagFullList();
    }

    @Override
    @Transactional
    public void insertTempTag(TempTag tag) {
        ensureTempTables();
        if (tag.getEnabled() == null || tag.getEnabled() == 0) tag.setEnabled(1);
        String colName = resolveColName(tag.getColName(), tag.getTagName(), null);
        tag.setColName(colName);
        monitoringDao.insertTempTag(tag);
        try {
            monitoringDao.addTempSnapshotColumn(colName);
        } catch (Exception e) {
            // 컬럼이 이미 존재할 수 있음 - 무시
        }
    }

    @Override
    @Transactional
    public void updateTempTag(TempTag tag) {
        ensureTempTables();
        TempTag current = monitoringDao.selectTempTagById(tag.getTempId());
        if (current == null) return;

        String desiredCol = (tag.getColName() != null && !tag.getColName().trim().isEmpty())
                ? tag.getColName().trim() : null;
        boolean tagNameChanged = tag.getTagName() != null && !tag.getTagName().equals(current.getTagName());
        boolean colNameChanged = desiredCol != null && !desiredCol.equals(current.getColName());

        String newCol = current.getColName();
        if (colNameChanged) {
            newCol = resolveColName(desiredCol, tag.getTagName(), current.getColName());
            renameSnapshotColumnIfExists(current.getColName(), newCol);
        } else if (tagNameChanged) {
            newCol = resolveColName(null, tag.getTagName(), current.getColName());
            renameSnapshotColumnIfExists(current.getColName(), newCol);
        }
        if (newCol == null || newCol.trim().isEmpty()) {
            newCol = resolveColName(null, tag.getTagName(), current.getColName());
        }

        tag.setColName(newCol);
        monitoringDao.updateTempTag(tag);
    }

    @Override
    @Transactional
    public void deleteTempTag(int tempId) {
        ensureTempTables();
        monitoringDao.deleteTempTag(tempId);
    }

    @Override
    public List<Map<String, Object>> getTempSnapshotList(int limit) {
        ensureTempTables();
        Map<String, Object> p = new HashMap<>();
        p.put("limit", limit);
        return monitoringDao.selectTempSnapshotList(p);
    }

    @Override
    public List<Map<String, Object>> getTempSnapshotRange(String from, String to) {
        ensureTempTables();
        Map<String, Object> p = new HashMap<>();
        p.put("from", from);
        p.put("to", to);
        List<Map<String, Object>> rows = monitoringDao.selectTempSnapshotRange(p);

        // CP 태그 컬럼은 원시값이 1000배로 찍히므로 ÷1000 보정(sample_pro TempController.snapshotRange와 동일).
        // 단, scale이 설정된 태그(예: MBF1 계열)는 C# TempMonitorService가 적재 시점에 이미
        // scale로 보정해서 저장하므로 여기서 또 ÷1000을 걸면 이중보정이 된다 — scale이 없는
        // 레거시 태그(MBF6~12 일부)에만 적용한다.
        List<TempTag> tags = monitoringDao.selectTempTagFullList();
        Set<String> cpCols = new HashSet<>();
        for (TempTag t : tags) {
            if (t.getScale() != null && !t.getScale().trim().isEmpty()) continue;
            String name = t.getTrendName() != null && !t.getTrendName().isEmpty() ? t.getTrendName()
                        : t.getTagName()   != null && !t.getTagName().isEmpty()   ? t.getTagName()
                        : t.getColName()   != null                                ? t.getColName()
                        : "";
            for (String seg : name.toLowerCase().split("[_\\s]+")) {
                if (seg.equals("cp")) { cpCols.add(t.getColName()); break; }
            }
        }
        if (!cpCols.isEmpty()) {
            for (Map<String, Object> row : rows) {
                for (String col : cpCols) {
                    Object val = row.containsKey(col) ? row.get(col)
                               : row.containsKey(col.toLowerCase()) ? row.get(col.toLowerCase())
                               : null;
                    if (val == null) continue;
                    try {
                        double scaled = Double.parseDouble(val.toString()) * 0.001;
                        if (row.containsKey(col))               row.put(col, scaled);
                        if (row.containsKey(col.toLowerCase())) row.put(col.toLowerCase(), scaled);
                    } catch (NumberFormatException ignored) {}
                }
            }
        }
        return rows;
    }

    @Override
    public List<TempMemo> getMemoList(String from, String to) {
        Map<String, Object> p = new HashMap<>();
        p.put("from", from);
        p.put("to", to);
        return monitoringDao.selectMemoList(p);
    }

    @Override
    @Transactional
    public void insertMemo(TempMemo memo) {
        monitoringDao.insertMemo(memo);
    }

    @Override
    @Transactional
    public void deleteMemo(int tcCnt) {
        monitoringDao.deleteMemo(tcCnt);
    }

    private void renameSnapshotColumnIfExists(String oldCol, String newCol) {
        if (oldCol == null || oldCol.trim().isEmpty()) return;
        if (newCol == null || newCol.trim().isEmpty()) return;
        if (oldCol.equals(newCol)) return;

        int exists = monitoringDao.countTempSnapshotColumn(oldCol);
        if (exists <= 0) return;
        Map<String, Object> p = new HashMap<>();
        p.put("oldCol", oldCol);
        p.put("newCol", newCol);
        monitoringDao.renameTempSnapshotColumn(p);
    }

    private void fillMissingColNames() {
        List<TempTag> missing = monitoringDao.selectTempTagsMissingColName();
        if (missing == null || missing.isEmpty()) return;

        Set<String> used = new HashSet<>(monitoringDao.selectTempColNames());
        used.remove("");

        for (TempTag t : missing) {
            String col = buildUniqueColName(t.getTagName(), null, used);
            t.setColName(col);
            monitoringDao.updateTempTag(t);
            used.add(col);
        }
    }

    private String buildUniqueColName(String tagName, String currentCol, Set<String> usedOverride) {
        String base = toSafeColumnBase(tagName);
        Set<String> used = (usedOverride != null) ? usedOverride : new HashSet<>(monitoringDao.selectTempColNames());
        if (currentCol != null) used.remove(currentCol);
        return uniquify(base, used);
    }

    // desiredColName이 있으면 그것을(가벼운 정제만) 기준으로, 없으면 tagName에서 자동 파생해서
    // tb_temp_tag.col_name/tb_temp_snapshot 컬럼명으로 쓸 유일한 이름을 만든다.
    private String resolveColName(String desiredColName, String tagNameForFallback, String currentColToExclude) {
        String base = (desiredColName != null && !desiredColName.trim().isEmpty())
                ? sanitizeManualColName(desiredColName.trim())
                : toSafeColumnBase(tagNameForFallback);

        Set<String> used = new HashSet<>(monitoringDao.selectTempColNames());
        if (currentColToExclude != null) used.remove(currentColToExclude);

        return uniquify(base, used);
    }

    private String uniquify(String base, Set<String> used) {
        String name = base;
        int idx = 2;
        while (used.contains(name)) {
            name = base + "_" + idx;
            idx++;
        }
        return name;
    }

    // 사용자가 직접 입력한 컬럼명은 태그명 자동 파생(toSafeColumnBase)과 달리 대소문자/형태를 그대로
    // 존중한다 — SQL 컬럼 식별자로 쓸 수 없는 문자만 제거하고 나머지는 입력한 그대로 둔다.
    private String sanitizeManualColName(String input) {
        String s = input.replaceAll("[가-힣]+", "");
        s = s.replaceAll("[^A-Za-z0-9_]+", "_");
        s = s.replaceAll("^_+|_+$", "");
        if (s.isEmpty()) s = "col";
        if (!Character.isLetter(s.charAt(0)) && s.charAt(0) != '_') s = "c_" + s;
        return s;
    }

    private String toSafeColumnBase(String tagName) {
        String s = tagName == null ? "" : tagName.trim().toLowerCase();
        s = s.replaceAll("[가-힣]+", "");
        s = s.replaceAll("[^a-z0-9]+", "_");
        s = s.replaceAll("^_+|_+$", "");
        if (s.isEmpty()) s = "tag";
        if (!Character.isLetter(s.charAt(0))) s = "t_" + s;
        return "tag_" + s;
    }
}
