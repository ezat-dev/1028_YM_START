// ============================================================================
// EzatBotEndpoints.cs
// ============================================================================
// [파일 역할]
//   EZ BOT "PLC 래더 조회" 화면 전용 API. 화면에 그려진 래더의 주소 목록(M347, SM400, C190, X29,
//   T10 …)을 한 번에 받아서 미쓰비시 PLC(Q/iQ-R)에서 현재 값을 읽고 주소별 JSON으로 돌려준다.
//   기존 단건 API(/api/foldertag/read/by-address)와 동일하게 X/Y/B/W 등을 GX Works2 기준 16진수로 해석한다.
//
//   읽기 방식: 주소를 디바이스별로 묶고 가까운 번지끼리 구간으로 합친 뒤 PlcService.ReadWordsBatchAsync로
//   연결 1개에서 순서대로 읽는다 — 주소마다 PLC와 따로 통신하지 않아 "실시간 값" 주기 갱신에도 부담이 적다.
//   읽기 전용이며 PLC에 아무것도 쓰지 않는다.
//
//   POST /api/ezat_bot/read   body: { "plcId": "TEST_PLC", "addresses": ["M347","SM400","C190","T10"] }
//   GET  /api/ezat_bot/read?plcId=TEST_PLC&addresses=M347,SM400,C190,T10   (브라우저 수동 테스트용)
// ============================================================================

using PlcApiServer.Repositories;
using PlcApiServer.Services;

namespace PlcApiServer.Endpoints;

public static class EzatBotEndpoints
{
    public record EzatBotReadRequest(string? PlcId, List<string>? Addresses);

    // 한 요청에서 받는 주소 개수 상한 — 래더 한 화면 분량(수십 개)에 넉넉한 여유. 실수로 수천 개를
    // 보내 PLC 통신을 오래 붙잡는 일을 막는다.
    private const int MaxAddresses = 500;

    // 같은 디바이스에서 번지 간격이 이 값 이하이면 한 구간으로 합쳐 읽는다 — 사이에 낀 몇 점을 더
    // 읽는 비용이 요청을 하나 더 보내는 비용보다 싸다(구간 길이는 ReadWordsBatchAsync가 64점 단위로 다시 쪼갬).
    private const int MergeGap = 16;

    // Q/iQ-R에서 번지를 16진수로 표기하는 디바이스. 나머지는 10진수.
    private static readonly HashSet<string> HexDevices = new() { "X", "Y", "B", "W", "SB", "SW", "DX", "DY" };

    // 래더 표기 → 프로토콜 디바이스 이름. 타이머/카운터는 접점(비트)과 현재값(워드)을 같이 읽는다.
    // GX 표기 STS/STC/STN(적산 타이머)은 프로토콜상 SS/SC/SN이다.
    private static readonly Dictionary<string, (string Contact, string Current)> TimerCounterAliases = new()
    {
        ["T"]  = ("TS", "TN"),
        ["ST"] = ("SS", "SN"),
        ["C"]  = ("CS", "CN"),
    };
    private static readonly Dictionary<string, string> DeviceAliases = new()
    {
        ["STS"] = "SS", ["STC"] = "SC", ["STN"] = "SN",
    };

    // 접두어 매칭은 긴 이름부터 시도한다 — 16진 번지에 A~F가 섞여서 "SB1F"를 S+B1F로, "CC10"을 C+C10으로
    // 잘못 자르지 않게 하려는 것(긴 이름이 맞고 나머지가 해당 진법 숫자로 해석될 때만 채택).
    private static readonly string[] PrefixCandidates =
        new[] { "STS", "STC", "STN", "ST", "SM", "SD", "SB", "SW", "DX", "DY", "ZR",
                "TS", "TC", "TN", "SS", "SC", "SN", "CS", "CC", "CN",
                "X", "Y", "M", "L", "F", "V", "B", "D", "W", "R", "S", "Z", "T", "C" };

    private enum Kind { Bit, Word, TimerCounter }

    private sealed record ParsedAddress(string Original, Kind Kind, string Device, int Addr, string? CurrentDevice);

    public static void MapEzatBotEndpoints(this WebApplication app)
    {
        app.MapPost("/api/ezat_bot/read", (EzatBotReadRequest req, PlcRepository repo, PlcServiceCache cache) =>
            ReadAsync(req.PlcId, req.Addresses, repo, cache));

        app.MapGet("/api/ezat_bot/read", (string? plcId, string? addresses, PlcRepository repo, PlcServiceCache cache) =>
            ReadAsync(plcId, addresses?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(), repo, cache));
    }

    private static async Task<IResult> ReadAsync(string? plcId, List<string>? addresses, PlcRepository repo, PlcServiceCache cache)
    {
        if (string.IsNullOrWhiteSpace(plcId))
            return Results.Ok(new { success = false, error = "plcId가 필요합니다." });
        if (addresses == null || addresses.Count == 0)
            return Results.Ok(new { success = false, error = "addresses가 비어 있습니다." });
        if (addresses.Count > MaxAddresses)
            return Results.Ok(new { success = false, error = $"주소는 한 번에 최대 {MaxAddresses}개까지 조회할 수 있습니다(요청 {addresses.Count}개)." });

        var cfg = await repo.GetByIdAsync(plcId);
        if (cfg == null)
            return Results.Ok(new { success = false, error = $"등록되지 않은 PLC입니다: '{plcId}'" });
        if (!string.Equals(cfg.PlcType, "MITSUBISHI", StringComparison.OrdinalIgnoreCase))
            return Results.Ok(new { success = false, error = $"미쓰비시(Q/iQ-R) PLC 전용 API입니다('{plcId}'의 타입: {cfg.PlcType})." });

        // 응답 values의 키는 화면이 보낸 표기를 정규화(대문자·공백 제거)한 그대로 쓴다 — 화면이 자기가
        // 그린 주소 문자열로 바로 값을 찾을 수 있게. 같은 주소가 중복으로 와도 한 번만 처리한다.
        var values = new Dictionary<string, object>();
        var errors = new List<object>();
        var toRead = new List<ParsedAddress>();

        foreach (var raw in addresses.Select(a => (a ?? "").Trim().ToUpperInvariant()).Where(a => a.Length > 0).Distinct())
        {
            // 래더의 상수(K10, H1F)는 PLC를 읽을 필요가 없다 — 화면이 비교식(C190 = K10)째로 보내도 되게 값만 돌려준다.
            if (TryParseConstant(raw, out int constant))
            {
                values[raw] = new { type = "CONST", value = constant };
                continue;
            }

            var parsed = ParseAddress(raw, out string? parseError);
            if (parsed == null)
            {
                errors.Add(new { address = raw, error = parseError });
                continue;
            }
            toRead.Add(parsed);
        }

        // 디바이스별 (번지 → 값). 실패한 구간은 번지가 빠진 채로 남고 rangeErrors에 사유가 쌓인다.
        var read = new Dictionary<string, Dictionary<int, int>>();
        var rangeErrors = new Dictionary<string, List<(int Start, int Count, string Message)>>();

        var wanted = new Dictionary<string, SortedSet<int>>();
        foreach (var p in toRead)
        {
            Want(wanted, p.Device, p.Addr);
            if (p.CurrentDevice != null) Want(wanted, p.CurrentDevice, p.Addr);
        }

        var svc = cache.GetOrCreate(cfg);
        foreach (var (device, addrs) in wanted)
        {
            var errs = new List<(int, int, string)>();
            rangeErrors[device] = errs;
            try
            {
                read[device] = await svc.ReadWordsBatchAsync(MergeRanges(addrs), device,
                    (start, count, ex) => errs.Add((start, count, ex.Message)));
            }
            catch (Exception ex)
            {
                // 연결 자체 실패(타임아웃·연결 거부·쿨다운 등) — 이 디바이스의 주소는 전부 실패로 처리하고
                // 다른 디바이스는 계속 시도한다(쿨다운 중이면 즉시 실패하므로 지연은 크지 않다).
                read[device] = new Dictionary<int, int>();
                errs.Add((int.MinValue, 0, ex.Message));
            }
        }

        foreach (var p in toRead)
        {
            if (!read[p.Device].TryGetValue(p.Addr, out int v))
            {
                errors.Add(new { address = p.Original, error = FindRangeError(rangeErrors[p.Device], p.Addr) });
                continue;
            }

            switch (p.Kind)
            {
                case Kind.Bit:
                    values[p.Original] = new { type = "BIT", device = p.Device, address = p.Addr, value = v != 0 ? 1 : 0, on = v != 0 };
                    break;
                case Kind.Word:
                    // PLC 화면(GX Works) 기본 표시가 부호 있는 16비트라 value는 signed, 원래 비트 패턴은 raw로 같이 준다.
                    values[p.Original] = new { type = "WORD", device = p.Device, address = p.Addr, value = (int)(short)(ushort)v, raw = v };
                    break;
                case Kind.TimerCounter:
                    int? current = read[p.CurrentDevice!].TryGetValue(p.Addr, out int cur) ? cur : null;
                    values[p.Original] = new
                    {
                        type = p.Device == "CS" ? "COUNTER" : "TIMER",
                        device = p.Device, address = p.Addr,
                        value = v != 0 ? 1 : 0, on = v != 0,   // 접점(설정값 도달 여부)
                        current                                 // 현재값(타이머는 0.1초 등 설정 단위 그대로)
                    };
                    break;
            }
        }

        return Results.Ok(new
        {
            success = true,
            plcId,
            readAt = DateTime.Now,
            count = values.Count,
            values,
            errors
        });
    }

    private static void Want(Dictionary<string, SortedSet<int>> wanted, string device, int addr)
    {
        if (!wanted.TryGetValue(device, out var set)) wanted[device] = set = new SortedSet<int>();
        set.Add(addr);
    }

    private static List<(int Start, int Count)> MergeRanges(SortedSet<int> addrs)
    {
        var ranges = new List<(int, int)>();
        int start = -1, end = -1;
        foreach (int a in addrs)
        {
            if (start < 0) { start = end = a; continue; }
            if (a - end <= MergeGap) { end = a; continue; }
            ranges.Add((start, end - start + 1));
            start = end = a;
        }
        if (start >= 0) ranges.Add((start, end - start + 1));
        return ranges;
    }

    private static string FindRangeError(List<(int Start, int Count, string Message)> errs, int addr)
    {
        foreach (var (start, count, msg) in errs)
            if (start == int.MinValue || (addr >= start && addr < start + count))
                return $"읽기 실패: {msg}";
        return "읽기 실패: PLC 응답에 값이 없습니다.";
    }

    private static bool TryParseConstant(string s, out int value)
    {
        value = 0;
        if (s.Length < 2) return false;
        if (s[0] == 'K') return int.TryParse(s.AsSpan(1), out value);
        if (s[0] == 'H') return int.TryParse(s.AsSpan(1), System.Globalization.NumberStyles.HexNumber, null, out value);
        return false;
    }

    private static ParsedAddress? ParseAddress(string s, out string? error)
    {
        error = null;
        foreach (var prefix in PrefixCandidates)
        {
            if (!s.StartsWith(prefix, StringComparison.Ordinal) || s.Length == prefix.Length) continue;
            string numPart = s[prefix.Length..];

            if (TimerCounterAliases.TryGetValue(prefix, out var tc))
            {
                if (!int.TryParse(numPart, out int tcAddr) || tcAddr < 0) continue;
                return new ParsedAddress(s, Kind.TimerCounter, tc.Contact, tcAddr, tc.Current);
            }

            string device = DeviceAliases.TryGetValue(prefix, out var alias) ? alias : prefix;
            bool ok;
            int addr;
            ok = HexDevices.Contains(device)
                ? int.TryParse(numPart, System.Globalization.NumberStyles.HexNumber, null, out addr)
                : int.TryParse(numPart, out addr);
            if (!ok || addr < 0) continue;

            if (!PlcService.IsSupportedMitsubishiDevice(device))
            {
                error = $"지원하지 않는 디바이스입니다: {device}";
                return null;
            }
            bool isBit = PlcService.IsMitsubishiBitDevice(device);
            return new ParsedAddress(s, isBit ? Kind.Bit : Kind.Word, device, addr, null);
        }

        error = s.Contains('.') || s.StartsWith('K') || s.Contains('\\')
            ? "지원하지 않는 형식입니다(워드 비트 지정 D0.1, 자릿수 지정 K4M0, 모듈 지정 U0\\G0 등)."
            : "주소 형식을 해석할 수 없습니다.";
        return null;
    }
}
