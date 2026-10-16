// ============================================================================
// LiveTagMonitorService.cs
// ============================================================================
// [파일 역할]
//   웹 요청으로 실행되는 API가 아니라, ASP.NET Core의 BackgroundService(호스트 서비스)다.
//   서버가 기동될 때 Program.cs가 등록해두면, 앱 생명주기 동안 별도의 백그라운드 태스크로
//   계속 돌면서 알아서 폴링을 반복한다.
//
//   원래 알람(tb_alarm_tag)과 폴더태그(folders_tags)는 각자 독립된 폴러로 만들 수도 있었지만,
//   그러면 같은 PLC를 보는 두 시스템이 "PLC → 각자 따로 요청"하게 되어 비효율이 생긴다
//   (예: 알람이 D1, 폴더태그가 D2를 같은 PLC에서 읽으면, 따로 돌면 왕복이 2번, 합치면 1번).
//   그래서 이 서비스는 알람 태그 + 폴더 태그를 "같은 폴링 주기 안에서 하나로 합쳐" 읽는다:
//     - PLC+디바이스 단위로 두 출처의 주소를 합쳐서 청크를 만들고, 한 번에 읽은 뒤
//     - 알람 태그는 기존처럼 "전환(ON/OFF)이 있을 때만 tb_alarm_history에 기록"
//     - 폴더 태그는 "DB에 쓰지 않고 메모리(FolderTagValues)에만 최신값 보관 → API가 즉시 응답"
//   으로 각자 다르게 처리한다. (온도/트랜드는 30초 주기로 "매번 스냅샷 행을 통째로 적재"하는
//   전혀 다른 목적이라 이 서비스에 합치지 않고 TempMonitorService로 계속 분리되어 있다.)
//
// [처리 흐름]
//   1) appsettings.json의 "PlcMonitor" 설정(Enabled/IntervalMs/ChunkSize/TreatNonZeroAsOn)을 읽는다.
//   2) 매 IntervalMs(기본 2000ms)마다 PollOnceAsync 반복:
//        a) tb_alarm_tag ⨝ tb_plc, folders_tags ⨝ tb_plc 두 테이블을 각각 조회해서 하나의
//           목록(CombinedTagRow, 출처 표시 포함)으로 합친다 (TagCacheMs 동안 메모리 캐시).
//        b) PLC(plc_id)+디바이스(D/M/L/X/Y/B/W/R)별로 묶어서, 두 출처의 주소를 합친 뒤
//           ReadWordsBatchAsync로 "연결 1개"로 순서대로 읽는다.
//        c) 알람 출처 결과는 "그 PLC 그룹의 읽기가 끝나는 즉시"(다른 PLC를 기다리지 않고)
//           AlarmTagValues(직전 상태)와 비교해 전환된 것만 tb_alarm_history에 기록(ProcessAlarmTransitionsAsync).
//           폴더태그 출처 결과는 FolderTagValues[tagId]에 그대로 저장(DB 미기록).
//   3) Program.cs의 /api/foldertag/values 엔드포인트가 이 인스턴스를 DI로 주입받아
//      FolderTagValues를 즉시 JSON으로 반환한다 (PLC 통신 없이 응답).
//   ※ AlarmMonitorService 시절과 달리 이 서비스는 Program.cs에서 AddSingleton으로도
//      등록해야 한다 (API 핸들러가 FolderTagValues를 직접 읽어야 하므로).
//
// [PLC 한 대가 죽었을 때 다른 PLC까지 지연되는 문제 — 두 가지 안전장치]
//   과거 구조는 모든 PLC 그룹을 Task.WhenAll로 다 읽은 "뒤에" 알람 전환 감지+DB 기록을
//   한꺼번에 처리했다. 그래서 PLC1(정상)의 알람이 0.5초만에 읽혀도, 같은 사이클에 낀
//   PLC3(응답없음)의 읽기가 15초 걸리면 PLC1의 알람 기록도 덩달아 15초 늦게 나갔다
//   (알람은 "감지" 용도라 이건 단순 성능저하가 아니라 안전 이슈로 봐야 한다).
//     1) PollOnceAsync: 각 PLC 그룹이 "자기 읽기가 끝나는 즉시" ProcessAlarmTransitionsAsync를
//        호출해서 전환 감지+DB 기록까지 마친다 — 더 이상 Task.WhenAll 전체 완료를 기다리지 않는다.
//        (폴더태그는 원래부터 그룹별 즉시반영이었고, 알람도 동일한 방식으로 맞춘 것.)
//     2) PlcService.EnsureConnectedAsync: 죽은 PLC는 "방금 연결 실패했다"를 기억해서(3초 쿨다운)
//        같은 사이클 안의 나머지 청크들이 매번 3초씩 새로 connect 타임아웃을 겪지 않도록 한다
//        (청크 5개짜리 죽은 PLC가 15초 대신 최초 1회 ~3초로 끝남).
//   두 장치를 합치면 PLC1(정상)의 알람 감지 지연은 PLC3(응답없음) 상태와 완전히 무관해지고,
//   PLC3 자신이 그 사이클에서 잡아먹는 시간도 훨씬 짧아진다.
// ============================================================================

using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using MySqlConnector;
using PlcApiServer.Repositories;
using PlcApiServer.Models;

namespace PlcApiServer.Services;

// 폴링 실패 1건 — "실패시에만 로그"용으로 관리 화면(폴링 상태 패널)에 최근 것만 보여준다.
public sealed record PollFailureEntry(DateTime At, string PlcId, string? Device, string Message);

// PLC 하나가 이번 사이클에 몇 개의 폴더/알람 태그를 "한 번에 묶어서" 읽고 있는지 —
// 관리 화면에서 "어떻게 묶여서 폴링되는지"를 시각적으로 보여주기 위한 요약.
// ChunkTotal/ChunkFail: 태그 개수가 아니라 "실제 PLC 왕복 요청 개수" 기준 — 주소가 얼마나
// 흩어져 있는지에 따라 태그 수천 개가 청크 몇십 개로 묶일 수도, 수백 개로 쪼개질 수도 있어서
// 태그 개수만으로는 "이번 사이클에 실제로 몇 번 통신했고 몇 번 성공했는지"를 알 수 없다.
public sealed record PollGroupInfo(string PlcId, string PlcLabel, int FolderTagCount, int AlarmTagCount, int ChunkTotal, int ChunkFail);

// 한 바퀴(사이클) 소요시간 1건 — 관리 화면의 "폴링 주기" 차트가 시간에 따른 추이를 그릴 때 쓴다.
public sealed record CycleDurationEntry(DateTime At, long DurationMs);

public class LiveTagMonitorService : BackgroundService
{
    private readonly ILogger<LiveTagMonitorService> _logger;
    private readonly IConfiguration _config;
    private readonly PlcRepository _repo;
    private readonly PlcServiceCache _cache;

    // ── 폴더태그 최신값 캐시 (tagId → raw 값) — DB에 쓰지 않고 메모리에만 유지, API가 직접 참조 ──
    public ConcurrentDictionary<int, int?> FolderTagValues { get; } = new();
    public DateTime? LastPollAt { get; private set; }
    // 이번 사이클(모든 PLC 그룹의 Task.WhenAll)이 실제로 몇 ms 걸렸는지 — 관리 화면에 그대로 노출.
    public long LastCycleDurationMs { get; private set; }
    public int IntervalMs { get; private set; } = 2000;
    // PlcMonitor:ChunkSize — 관리 화면이 "N개를 X개씩 묶어서 읽음" 문구를 실제 설정값으로 보여주기 위해 노출.
    public int ChunkSize { get; private set; } = 100;

    // ── 최근 폴링 실패 (성공은 기록하지 않음 — "실패시에만 로그" 요구사항) ──────────────
    private readonly ConcurrentQueue<PollFailureEntry> _failures = new();
    private const int MaxFailures = 30;
    // 매 정각 D:\ER_LOG에 "지난 1시간 몇 건 실패했는지" 하트비트 한 줄을 남기는 HourlyCommLogService
    // 전용 카운터 — 상세 내용은 아래 RecordFailure가 발생 즉시 ErFileLogger로 바로 쓰므로, 여기는
    // 개수만 세면 된다(Interlocked로 스레드 안전하게 증가/리셋).
    private int _hourlyFailureCount;
    private void RecordFailure(string plcId, string? device, string message)
    {
        var entry = new PollFailureEntry(DateTime.Now, plcId, device, message);
        _failures.Enqueue(entry);
        while (_failures.Count > MaxFailures) _failures.TryDequeue(out _);
        Interlocked.Increment(ref _hourlyFailureCount);
        // 실패는 발생한 그 순간 바로 상세히 남긴다 — 정각까지 기다리지 않는다.
        Logging.ErFileLogger.Write("FAIL", $"[알람/폴더] {plcId}{(device != null ? "/" + device : "")} — {message}");
    }

    // HourlyCommLogService가 매 정각 호출 — 지난 1시간 동안 쌓인 실패 "개수"를 꺼내면서 0으로 리셋한다.
    public int DrainHourlyFailureCount() => Interlocked.Exchange(ref _hourlyFailureCount, 0);

    // ── 한 바퀴 소요시간 이력 (차트용) — 2초 주기라 150건이면 최근 5분치 ───────────────
    private readonly ConcurrentQueue<CycleDurationEntry> _durationHistory = new();
    private const int MaxDurationHistory = 150;
    public IReadOnlyList<CycleDurationEntry> DurationHistory => _durationHistory.ToArray();
    private void RecordCycleDuration(long ms)
    {
        _durationHistory.Enqueue(new CycleDurationEntry(DateTime.Now, ms));
        while (_durationHistory.Count > MaxDurationHistory) _durationHistory.TryDequeue(out _);
    }
    public IReadOnlyList<PollFailureEntry> RecentFailures => _failures.ToArray().Reverse().ToList();

    // 현재 캐시된 태그를 PLC별로 묶어서 "이 PLC가 폴더+알람 태그를 몇 개씩 한 사이클에 같이
    // 읽는지" 보여준다 — PollOnceAsync가 실제로 GroupBy(t => t.Plc.Id)로 묶는 것과 동일한 기준.
    public List<PollGroupInfo> GetPollGroups()
    {
        var folderTags = _cachedFolderTags ?? new List<FolderTagRow>();
        var alarmTags  = _cachedAlarmTags  ?? new List<AlarmTagRow>();
        var labels = new Dictionary<string, string>();
        foreach (var t in folderTags) labels[t.Plc.Id] = t.Plc.Label;
        foreach (var t in alarmTags) labels[t.Plc.Id] = t.Plc.Label;

        var folderCounts = folderTags.GroupBy(t => t.Plc.Id).ToDictionary(g => g.Key, g => g.Count());
        var alarmCounts  = alarmTags.GroupBy(t => t.Plc.Id).ToDictionary(g => g.Key, g => g.Count());

        return labels.Keys.OrderBy(id => id).Select(id =>
        {
            _lastCycleChunkStats.TryGetValue(id, out var chunkStat);   // 없으면 (0,0) 기본값
            return new PollGroupInfo(
                id, labels[id], folderCounts.GetValueOrDefault(id, 0), alarmCounts.GetValueOrDefault(id, 0),
                chunkStat.Total, chunkStat.Fail
            );
        }).ToList();
    }

    // PLC별 "이번 사이클" 청크(실제 PLC 왕복 요청) 성공/실패 집계 — PollOnceAsync가 매 사이클
    // 갱신하고, GetPollGroups()가 그대로 읽어 관리 화면에 노출한다. 같은 plcId는 한 사이클에
    // 정확히 하나의 그룹 태스크만 쓰므로 별도 락 없이 그 태스크가 끝날 때 한 번만 대입한다.
    private readonly ConcurrentDictionary<string, (int Total, int Fail)> _lastCycleChunkStats = new();

    // ── 알람 상태 캐시 (tagId → 마지막 ON/OFF) — DB는 전환시에만 씀. 원래는 전환 감지에만 쓰던
    // private 필드였는데, "실시간 모니터링" 화면이 알람 현재 상태를 그대로 보여줘야 해서 공개했다.
    public ConcurrentDictionary<int, bool> AlarmTagValues { get; } = new();

    // ── 태그 목록 캐시 (알람/폴더태그 각각) ──────────────────────────────────
    private List<AlarmTagRow>? _cachedAlarmTags;
    private List<FolderTagRow>? _cachedFolderTags;
    private DateTime _tagsCachedAt = DateTime.MinValue;

    private bool _firstPoll = true;

    public LiveTagMonitorService(ILogger<LiveTagMonitorService> logger, IConfiguration config, PlcRepository repo, PlcServiceCache cache)
    {
        _logger = logger;
        _config = config;
        _repo = repo;
        _cache = cache;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        bool enabled          = _config.GetValue("PlcMonitor:Enabled", true);
        int intervalMs        = _config.GetValue("PlcMonitor:IntervalMs", 1000);
        int chunkSize         = _config.GetValue("PlcMonitor:ChunkSize", 100);
        bool treatNonZeroAsOn = _config.GetValue("PlcMonitor:TreatNonZeroAsOn", true);
        int tagCacheMs        = _config.GetValue("PlcMonitor:TagCacheMs", 30000);

        if (!enabled)
        {
            _logger.LogInformation("LiveTagMonitorService disabled by config.");
            return;
        }

        if (chunkSize < 1) chunkSize = 100;
        IntervalMs = intervalMs;
        ChunkSize  = chunkSize;
        _logger.LogInformation(
            "LiveTagMonitorService started. IntervalMs={Interval}, ChunkSize={ChunkSize}, TagCacheMs={TagCache}",
            intervalMs, chunkSize, tagCacheMs);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PollOnceAsync(treatNonZeroAsOn, chunkSize, tagCacheMs, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "LiveTagMonitorService poll error");
                RecordFailure("(전체)", null, ex.Message);
            }

            try
            {
                await Task.Delay(intervalMs, stoppingToken);
            }
            catch (TaskCanceledException)
            {
                break;
            }
        }
    }

    private async Task PollOnceAsync(bool treatNonZeroAsOn, int chunkSize, int tagCacheMs, CancellationToken ct)
    {
        // "한 바퀴 소요시간"은 여기서부터 잰다 — 태그 목록을 DB에서 다시 불러오는 [1]도 포함해야
        // 진짜 "이번 폴링 사이클 전체"를 잰 게 된다(TagCacheMs 만료 시점엔 이 재조회도 매번 일어남).
        var cycleStopwatch = Stopwatch.StartNew();

        // ── [1] 태그 목록 캐시 (알람 + 폴더태그 둘 다) ──────────────────────────
        if (_cachedAlarmTags == null || _cachedFolderTags == null ||
            (DateTime.UtcNow - _tagsCachedAt).TotalMilliseconds >= tagCacheMs)
        {
            _cachedAlarmTags  = await LoadAlarmTagsAsync(ct);
            _cachedFolderTags = await LoadFolderTagsAsync(ct);
            _tagsCachedAt     = DateTime.UtcNow;

            // 더 이상 유효하지 않게 된(비활성화/삭제/주소 파싱 실패로 목록에서 빠진) 폴더태그의
            // 예전 값을 FolderTagValues에서 지운다 — 안 지우면 "언제 읽힌 값인지 알 수 없는
            // 찌꺼기"가 API 응답에 영원히 섞여 나온다(예: 주소를 잘못 고쳤다가 태그가 폴링
            // 목록에서 빠져도, 고치기 전 마지막 정상값을 계속 실시간 값인 것처럼 보여줬었다).
            var validFolderTagIds = new HashSet<int>(_cachedFolderTags.Select(t => t.TagId));
            foreach (var staleId in FolderTagValues.Keys.Where(id => !validFolderTagIds.Contains(id)).ToList())
                FolderTagValues.TryRemove(staleId, out _);

            var validAlarmTagIds = new HashSet<int>(_cachedAlarmTags.Select(t => t.TagId));
            foreach (var staleId in AlarmTagValues.Keys.Where(id => !validAlarmTagIds.Contains(id)).ToList())
                AlarmTagValues.TryRemove(staleId, out _);

            _logger.LogDebug("Tag cache refreshed: alarm={AlarmCount}, folderTag={FolderCount}",
                _cachedAlarmTags.Count, _cachedFolderTags.Count);
        }

        // ── [2] 알람 + 폴더태그를 하나의 목록으로 합친다 (출처 표시만 다름) ──────
        var combined = new List<CombinedTagRow>(_cachedAlarmTags.Count + _cachedFolderTags.Count);
        foreach (var a in _cachedAlarmTags)
            combined.Add(new CombinedTagRow { TagId = a.TagId, DeviceType = a.DeviceType, AddressValue = a.AddressValue, Plc = a.Plc, IsAlarmSource = true });
        foreach (var f in _cachedFolderTags)
            combined.Add(new CombinedTagRow { TagId = f.TagId, DeviceType = f.DeviceType, AddressValue = f.AddressValue, Plc = f.Plc, IsAlarmSource = false });

        if (combined.Count == 0)
        {
            _logger.LogWarning("LiveTagMonitor: no valid tags configured (alarm+folderTag)");
            cycleStopwatch.Stop();
            LastCycleDurationMs = cycleStopwatch.ElapsedMilliseconds;
            RecordCycleDuration(LastCycleDurationMs);
            LastPollAt = DateTime.UtcNow;
            return;
        }

        // ── [3] PLC+디바이스 단위로 두 출처의 주소를 합쳐서 한 번에 읽고,
        //       "이 PLC 그룹이 끝나는 즉시" 알람 전환 감지+DB 반영까지 마친다.
        //       Task.WhenAll 전체가 끝나길 기다리지 않으므로, 죽은 PLC 하나가 오래 걸려도
        //       다른 PLC들의 알람 감지/기록은 지연되지 않는다 (폴더태그는 원래부터
        //       그룹별 즉시반영이었고, 알람도 동일한 방식으로 맞췄다).
        // _firstPoll은 병렬 시작 전에 한 번만 캡처해서 이번 사이클의 모든 그룹이 같은 값을
        // 보게 한다 (여러 그룹이 동시에 읽고/쓰면 사이클 중간에 값이 바뀌는 것을 방지).
        bool isFirstPollThisCycle = _firstPoll;

        await Task.WhenAll(combined.GroupBy(t => t.Plc.Id).Select(async plcGroup =>
        {
            var plc = plcGroup.First().Plc;
            try
            {
                var svc = _cache.GetOrCreate(plc);
                var groupAlarmResults = new List<(int TagId, bool IsOn, int Raw)>();
                // 이번 사이클에 이 PLC가 실제로 몇 번 왕복했고(=청크 수) 그중 몇 번 실패했는지 —
                // devGroup foreach 안에서 순서대로 늘어나므로 별도 동기화 없이 지역변수로 충분하다.
                int chunkTotal = 0, chunkFail = 0;

                foreach (var devGroup in plcGroup.GroupBy(t => t.DeviceType))
                {
                    string deviceType = devGroup.Key;
                    // 알람 태그의 D1 + 폴더태그의 D2가 같은 PLC/디바이스라면 여기서 합쳐져서
                    // 하나의 청크로 묶인다 — 두 시스템이 따로 PLC에 왕복하지 않는다.
                    var addrList = devGroup.Select(t => t.AddressValue).Distinct().OrderBy(a => a).ToList();
                    var chunks   = BuildChunks(addrList, chunkSize);
                    chunkTotal  += chunks.Count;

                    var valueMap = await svc.ReadWordsBatchAsync(chunks, deviceType, (start, count, ex) =>
                    {
                        chunkFail++;
                        _logger.LogWarning(ex,
                            "PLC read failed. PlcId={PlcId}, Device={Device}, Start={Start}, Count={Count}",
                            plc.Id, deviceType, start, count);
                        RecordFailure(plc.Id, deviceType, $"{deviceType}{start}~{start + count - 1} 읽기 실패: {ex.Message}");
                    });

                    foreach (var tag in devGroup)
                    {
                        if (!valueMap.TryGetValue(tag.AddressValue, out var raw)) continue;

                        if (tag.IsAlarmSource)
                        {
                            bool isOn = treatNonZeroAsOn ? raw != 0 : raw == 1;
                            groupAlarmResults.Add((tag.TagId, isOn, raw));
                        }
                        else
                        {
                            // 폴더태그: DB에 쓰지 않고 메모리에만 최신값 보관 (BIT/WORD 해석은 프론트 담당)
                            FolderTagValues[tag.TagId] = raw;
                        }
                    }
                }

                _lastCycleChunkStats[plc.Id] = (chunkTotal, chunkFail);

                // 이 PLC의 읽기가 끝나자마자 바로 전환 감지+DB 반영 (다른 PLC 그룹의 진행상황과 무관)
                if (groupAlarmResults.Count > 0)
                    await ProcessAlarmTransitionsAsync(groupAlarmResults, isFirstPollThisCycle, ct);
            }
            catch (Exception ex)
            {
                // 이 PLC 그룹의 실패(연결 거부 등)가 Task.WhenAll 전체를 fault시키면, 다른(정상) PLC
                // 그룹이 이미 값을 다 갱신했어도 아래 사이클 완료 기록(LastPollAt/소요시간)이 통째로
                // 스킵된다 — 그러면 "정상 PLC가 있는데도 폴링 상태가 계속 갱신 안 됨"이 된다.
                // onRangeError는 "연결은 됐는데 읽기 도중 실패"만 잡는다 — 연결 자체가 거부/타임아웃되면
                // (EnsureConnectedAsync 단계) onRangeError까지 가지도 못하고 여기로 바로 떨어지므로,
                // 그 경우를 위해 여기서도 RecordFailure를 남겨야 대시보드 "최근 실패"에 빠짐없이 보인다.
                // 청크 진행 상황은 어디서 끊겼는지 알 수 없으니 갱신하지 않는다 — 화면엔 직전 정상
                // 사이클의 마지막 값이 남고, "최근 실패" 목록이 이번 사이클이 통째로 죽었음을 알려준다.
                _logger.LogWarning(ex, "PLC group poll failed, skipping this group for this cycle. PlcId={PlcId}", plc.Id);
                RecordFailure(plc.Id, null, $"그룹 폴링 실패: {ex.Message}");
            }
        }));

        cycleStopwatch.Stop();
        LastCycleDurationMs = cycleStopwatch.ElapsedMilliseconds;
        RecordCycleDuration(LastCycleDurationMs);
        LastPollAt = DateTime.UtcNow;
        _firstPoll = false;
    }

    // PLC 그룹 하나의 알람 읽기 결과를 전환 감지 후 tb_alarm_history에 반영한다.
    // 다른 PLC 그룹을 기다리지 않고 자기 그룹이 끝나는 즉시 호출되므로, 이 태그들 전용 커넥션을 새로 연다
    // (여러 그룹이 동시에 이 메서드를 호출할 수 있어 커넥션은 그룹마다 독립적으로 열어야 한다).
    private async Task ProcessAlarmTransitionsAsync(List<(int TagId, bool IsOn, int Raw)> results, bool isFirstPoll, CancellationToken ct)
    {
        var toWrite = new List<(int TagId, bool IsOn, int Raw)>();
        foreach (var (tagId, isOn, raw) in results)
        {
            bool prev = AlarmTagValues.GetOrAdd(tagId, _ => false);
            if (!isFirstPoll && isOn == prev) continue;
            toWrite.Add((tagId, isOn, raw));
            if (isFirstPoll)
                _logger.LogDebug("Alarm sync (startup): tagId={TagId} isOn={IsOn}", tagId, isOn);
            else
                _logger.LogInformation("Alarm transition: tagId={TagId} {Prev}→{IsOn} raw={Raw}",
                    tagId, prev ? "ON" : "OFF", isOn ? "ON" : "OFF", raw);
        }

        if (toWrite.Count == 0) return;

        using var conn = new MySqlConnection(_repo.ConnectionString);
        await conn.OpenAsync(ct);
        foreach (var (tagId, isOn, raw) in toWrite)
        {
            await ApplyAlarmTransitionAsync(conn, tagId, isOn, raw, ct);
            AlarmTagValues[tagId] = isOn;
            _logger.LogDebug("Alarm DB updated: tagId={TagId} isOn={IsOn}", tagId, isOn);
        }
    }

    private async Task<List<AlarmTagRow>> LoadAlarmTagsAsync(CancellationToken ct)
    {
        using var conn = new MySqlConnection(_repo.ConnectionString);
        await conn.OpenAsync(ct);

        var tags = new List<AlarmTagRow>();
        using (var cmd = new MySqlCommand(@"
SELECT t.tag_id, t.address, t.enabled,
       p.plc_id, p.ip, p.port, p.plc_type, p.label, p.enabled AS plc_enabled
  FROM tb_alarm_tag t
  JOIN tb_plc p ON t.plc_id = p.plc_id
 WHERE t.enabled = 1 AND p.enabled = 1", conn))
        using (var reader = await cmd.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                tags.Add(new AlarmTagRow
                {
                    TagId   = reader.GetInt32(0),
                    Address = reader.GetString(1),
                    Plc = new PlcConfigRow(
                        reader.GetString(3), reader.GetString(4), reader.GetInt32(5),
                        reader.GetString(6), reader.GetString(7), reader.GetBoolean(8)
                    )
                });
            }
        }

        var valid = new List<AlarmTagRow>();
        foreach (var tag in tags)
        {
            var parsed = ParseAddressFull(tag.Address);
            if (parsed == null)
            {
                _logger.LogWarning("Skip alarm tag {TagId} invalid address: {Address}", tag.TagId, tag.Address);
                continue;
            }
            tag.DeviceType   = parsed.Value.Device;
            tag.AddressValue = parsed.Value.Addr;
            valid.Add(tag);
        }
        return valid;
    }

    private async Task<List<FolderTagRow>> LoadFolderTagsAsync(CancellationToken ct)
    {
        using var conn = new MySqlConnection(_repo.ConnectionString);
        await conn.OpenAsync(ct);

        var tags = new List<FolderTagRow>();
        using (var cmd = new MySqlCommand(@"
SELECT t.id, t.address, t.type,
       p.plc_id, p.ip, p.port, p.plc_type, p.label, p.enabled AS plc_enabled
  FROM folders_tags t
  JOIN tb_plc p ON t.plc_id = p.plc_id
 WHERE t.enabled = 1 AND p.enabled = 1", conn))
        using (var reader = await cmd.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                tags.Add(new FolderTagRow
                {
                    TagId   = reader.GetInt32(0),
                    Address = reader.IsDBNull(1) ? "" : reader.GetString(1),
                    Type    = reader.IsDBNull(2) ? "WORD" : reader.GetString(2),
                    Plc = new PlcConfigRow(
                        reader.GetString(3), reader.GetString(4), reader.GetInt32(5),
                        reader.GetString(6), reader.GetString(7), reader.GetBoolean(8)
                    )
                });
            }
        }

        var valid = new List<FolderTagRow>();
        foreach (var tag in tags)
        {
            var parsed = ParseAddressFull(tag.Address);
            if (parsed == null)
            {
                _logger.LogWarning("Skip folder tag {TagId} invalid address: {Address}", tag.TagId, tag.Address);
                continue;
            }
            tag.DeviceType   = parsed.Value.Device;
            tag.AddressValue = parsed.Value.Addr;
            valid.Add(tag);
        }
        return valid;
    }

    // 인접 주소를 한 번의 PLC 요청으로 묶는다 (알람+폴더태그 합쳐진 주소 목록 기준).
    private static List<(int Start, int Count)> BuildChunks(List<int> sortedAddrs, int chunkSize)
    {
        var result = new List<(int, int)>();
        if (sortedAddrs.Count == 0) return result;

        int s = sortedAddrs[0];
        int maxInChunk = sortedAddrs[0];

        foreach (var a in sortedAddrs)
        {
            if (a > s + chunkSize - 1)
            {
                int cnt = Math.Min(maxInChunk - s + 1, 65536 - s);
                if (cnt > 0) result.Add((s, cnt));
                s = a;
                maxInChunk = a;
            }
            else
            {
                maxInChunk = a;
            }
        }
        {
            int cnt = Math.Min(maxInChunk - s + 1, 65536 - s);
            if (cnt > 0) result.Add((s, cnt));
        }
        return result;
    }

    // "D100"/"M50"/"0xC9" → (디바이스, 숫자주소). 접두어 없으면 D로 간주.
    // internal로 열어둔 이유: Program.cs의 이름/주소 기반 조회·쓰기 엔드포인트가 folders_tags.address
    // 문자열을 파싱할 때 이 로직을 그대로 재사용한다 — 똑같은 파싱 규칙을 두 곳에 따로 구현하면
    // 나중에 한쪽만 고쳐서 어긋나기 쉽기 때문에 하나로 공유한다.
    internal static (string Device, int Addr)? ParseAddressFull(string? address)
    {
        if (string.IsNullOrWhiteSpace(address)) return null;
        address = address.Trim();

        if (address.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            if (int.TryParse(address.AsSpan(2), NumberStyles.HexNumber, null, out int hex))
                return ("D", hex);
            return null;
        }

        int i = 0;
        while (i < address.Length && char.IsLetter(address[i])) i++;

        string device  = i > 0 ? address[..i].ToUpperInvariant() : "D";
        string numPart = address[i..];

        if (device == "B")
        {
            if (int.TryParse(numPart, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int hexAddr))
                return (device, hexAddr);
            return null;
        }

        // X/Y(미쓰비시 입출력 접점) 주소는 실제 현장에서 8진수 라벨(Y110~Y117 등, 실제 물리
        // 상태와 일치하는 걸로 확인됨)과 16진수 블록(Y118~Y11F, X04A/X04B처럼 8진수로는 애초에
        // 표현 안 되는 8/9/A~F 포함)이 "같은 시스템 안에 실제로 섞여" 들어온다 — 그래서 무조건
        // 한쪽으로 통일하면 안 되고, 자릿수가 전부 0~7이면 8진수(기존 방식 그대로 보존),
        // 8/9나 A~F가 하나라도 있으면 그때만 16진수로 해석한다.
        // 예: Y110(전부 0~7) → 8진수 72,  Y118(8 포함) → 16진수 0x118=280,  X04A → 16진수 0x4A=74.
        // PlcService.Mitsubishi.cs의 ResolveMitsubishiAddress는 X/Y도 그대로 통과만 시킨다 —
        // 8진수든 16진수든 변환이 이미 여기서 끝나서 "프레임에 넣을 최종 값"까지 확정해 넘기기 때문.
        if (device is "X" or "Y")
        {
            bool validOctal = numPart.Length > 0 && numPart.All(c => c is >= '0' and <= '7');
            if (validOctal)
            {
                try { return (device, Convert.ToInt32(numPart, 8)); }
                catch { return null; }
            }
            if (int.TryParse(numPart, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int hexAddr))
                return (device, hexAddr);
            return null;
        }

        if (int.TryParse(numPart, out int v))
            return (device, v);

        return null;
    }

    private static async Task ApplyAlarmTransitionAsync(MySqlConnection conn, int tagId, bool isOn, int rawValue, CancellationToken ct)
    {
        long? openId = null;
        using (var cmdSel = new MySqlCommand(@"
SELECT history_id
  FROM tb_alarm_history
 WHERE tag_id = @tagId AND clear_time IS NULL
 ORDER BY occur_time DESC
 LIMIT 1", conn))
        {
            cmdSel.Parameters.AddWithValue("@tagId", tagId);
            var obj = await cmdSel.ExecuteScalarAsync(ct);
            if (obj != null && obj != DBNull.Value)
                openId = Convert.ToInt64(obj);
        }

        if (isOn)
        {
            if (openId == null)
            {
                using var cmdIns = new MySqlCommand(@"
INSERT INTO tb_alarm_history(tag_id, occur_time, value_at_occur)
VALUES (@tagId, NOW(), @val)", conn);
                cmdIns.Parameters.AddWithValue("@tagId", tagId);
                cmdIns.Parameters.AddWithValue("@val", rawValue.ToString());
                await cmdIns.ExecuteNonQueryAsync(ct);
            }
        }
        else
        {
            if (openId != null)
            {
                using var cmdUpd = new MySqlCommand(@"
UPDATE tb_alarm_history
   SET clear_time = NOW()
 WHERE history_id = @id", conn);
                cmdUpd.Parameters.AddWithValue("@id", openId.Value);
                await cmdUpd.ExecuteNonQueryAsync(ct);
            }
        }
    }

    // 알람/폴더태그를 하나의 폴링 배치로 합치기 위한 공용 표현 — 출처(IsAlarmSource)만 다르게 표시.
    private sealed class CombinedTagRow
    {
        public int TagId;
        public string DeviceType = "D";
        public int AddressValue;
        public PlcConfigRow Plc = null!;
        public bool IsAlarmSource;
    }

    private sealed class FolderTagRow
    {
        public int TagId { get; set; }
        public string Address { get; set; } = "";
        public string Type { get; set; } = "WORD";
        public string DeviceType { get; set; } = "D";
        public int AddressValue { get; set; }
        public PlcConfigRow Plc { get; set; } = null!;
    }
}
