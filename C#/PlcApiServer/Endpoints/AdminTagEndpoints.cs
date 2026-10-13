// ============================================================================
// AdminTagEndpoints.cs
// ============================================================================
// [파일 역할]
//   "PLC 태그 관리" 화면(wwwroot/admin/tags.html)이 쓰는 CRUD + 엑셀 임포트/익스포트 API 전용 파일.
//   Program.cs의 기존 API들은 "값을 읽고 쓰는" 용도(/api/plc/*, /api/foldertag/value*)였고,
//   이 파일은 "태그 정의 자체(이름/주소/PLC 등)를 추가·수정·삭제"하는 관리자용 API만 모아둔다.
//   기존 폴링(LiveTagMonitorService/TempMonitorService)은 DB를 매 사이클 또는 30초 캐시로
//   다시 읽으므로, 여기서 DB 행만 바꿔주면 폴링 쪽은 별도 알림 없이 알아서 따라온다.
//
//   대상 5개 테이블(관계):
//     folders(폴더) 1 ── N folders_tags(모니터링 태그)   → 값 조회는 /api/foldertag/*
//     tb_alarm_folder(알람폴더) 1 ── N tb_alarm_tag(알람태그) → 전환 시 tb_alarm_history 기록
//     tb_temp_tag(온도태그) 1개 저장 시 tb_temp_snapshot에 col_name 컬럼이 동적 생성됨
//
//   모든 응답은 이 프로젝트 전체 컨벤션과 동일하게 "HTTP 200 + { success, ... }" 형태다
//   (호출측은 HTTP status가 아니라 JSON의 success 필드를 본다). 단, 엑셀 다운로드(export)만
//   파일 자체를 응답 바디로 내려준다(Results.File).
// ============================================================================

using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using MySqlConnector;
using PlcApiServer.Repositories;
using PlcApiServer.Services;
using PlcApiServer.Logging;

namespace PlcApiServer.Endpoints;

public static class AdminTagEndpoints
{
    private const string XlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    public static void MapAdminTagEndpoints(this WebApplication app)
    {
        MapPlcListEndpoint(app);
        MapFolderEndpoints(app);
        MapFolderTagEndpoints(app);
        MapTempTagEndpoints(app);
        MapAlarmFolderEndpoints(app);
        MapAlarmTagEndpoints(app);
        MapStringTagEndpoints(app);
        MapDoubleWordTagEndpoints(app);
        MapMonitorEndpoints(app);
    }

    // ================= 더블워드 태그 (dw_folders_tags) =================
    // 모니터링 태그(folders_tags)와 같은 folders 테이블을 그대로 재사용해서 폴더로 묶는다 —
    // 폴더 CRUD 자체는 /api/admin/folders(MapFolderEndpoints)에 이미 있어 그대로 쓰고, 여기서는
    // dw_folders_tags(태그 정의)만 다룬다. 워드 여러 개(2~4)를 이어붙여 정수 하나로 합치는 게
    // 문자열 태그와 다른 점 — "어느 오프셋이 최하위/최상위인지"를 word_order로 태그마다 정한다.
    private static void MapDoubleWordTagEndpoints(WebApplication app)
    {
        // GET /api/admin/dwtags?folderId=&name= — 목록 + 현재 합쳐진 정수값
        app.MapGet("/api/admin/dwtags", async (int? folderId, string? name, PlcRepository repo, DoubleWordTagMonitorService monitor) =>
        {
            try
            {
                var list = await QueryDwTags(repo, folderId, name);
                var tags = list.Select(t => new
                {
                    id = t.Id,
                    folderId = t.FolderId,
                    name = t.Name,
                    address = t.Address,
                    plcId = t.PlcId,
                    wordCount = t.WordCount,
                    wordOrder = t.WordOrder,
                    signed = t.Signed,
                    enabled = t.Enabled,
                    value = monitor.DoubleWordTagValues.TryGetValue(t.Id, out var v) ? (long?)v : null
                });
                return Results.Ok(new { success = true, lastPollAt = monitor.LastPollAt, tags });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/dwtags/count?folderId= — 개수만 (다른 태그 타입과 동일 패턴)
        app.MapGet("/api/admin/dwtags/count", async (int? folderId, PlcRepository repo) =>
        {
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                await EnsureDwTagTableAsync(conn);
                string sql = "SELECT COUNT(*) FROM dw_folders_tags" + (folderId.HasValue ? " WHERE folder_id=@fid" : "");
                using var cmd = new MySqlCommand(sql, conn);
                if (folderId.HasValue) cmd.Parameters.AddWithValue("@fid", folderId.Value);
                long count = Convert.ToInt64(await cmd.ExecuteScalarAsync());
                return Results.Ok(new { success = true, count });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/dwtags/export?folderId= (생략 시 전체) — 엑셀 다운로드
        app.MapGet("/api/admin/dwtags/export", async (int? folderId, PlcRepository repo) =>
        {
            var list = await QueryDwTags(repo, folderId);
            var rows = list.Select(t => new object?[] { t.Id, t.FolderId, t.Name, t.Address, t.PlcId, t.WordCount, t.WordOrder, t.Signed ? 1 : 0, t.Enabled ? 1 : 0 });
            var bytes = WriteXlsx("더블워드태그", new[] { "ID", "폴더ID", "이름", "주소", "PLC ID", "워드개수", "워드순서", "부호있음(1/0)", "사용(1/0)" }, rows);
            return Results.File(bytes, XlsxContentType, $"dw_tags_{DateTime.Now:yyyyMMdd_HHmm}.xlsx");
        });

        // POST /api/admin/dwtags/import?folderId= — 엑셀 업로드로 일괄 등록/수정
        app.MapPost("/api/admin/dwtags/import", async (IFormFile file, int? folderId, PlcRepository repo) =>
        {
            List<Dictionary<string, string>> rows;
            try
            {
                using var stream = file.OpenReadStream();
                rows = ReadXlsxRows(stream);
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = "엑셀 파일을 읽을 수 없습니다: " + ex.Message }); }

            int inserted = 0, updated = 0;
            var errors = new List<string>();
            using var conn = new MySqlConnection(repo.ConnectionString);
            await conn.OpenAsync();
            await EnsureDwTagTableAsync(conn);

            for (int i = 0; i < rows.Count; i++)
            {
                var row = rows[i];
                int excelRow = i + 2;
                string name = row.GetValueOrDefault("이름", "");
                string address = row.GetValueOrDefault("주소", "");
                string plcId = row.GetValueOrDefault("PLC ID", "");
                int wordCount = int.TryParse(row.GetValueOrDefault("워드개수", ""), out var wc) ? wc : DoubleWordCodec.MinWordCount;
                string wordOrder = row.GetValueOrDefault("워드순서", "");
                if (string.IsNullOrWhiteSpace(wordOrder)) wordOrder = DoubleWordCodec.DefaultOrder(wordCount);
                bool signed = ParseEnabledCell(row.GetValueOrDefault("부호있음(1/0)", ""));
                bool enabled = ParseEnabledCell(row.GetValueOrDefault("사용(1/0)", ""));
                int? fid = int.TryParse(row.GetValueOrDefault("폴더ID", ""), out var pf) ? pf : folderId;
                bool hasId = int.TryParse(row.GetValueOrDefault("ID", ""), out var id) && id > 0;

                var err = ValidateTagBasics(name, address, plcId);
                if (err == null && (wordCount < DoubleWordCodec.MinWordCount || wordCount > DoubleWordCodec.MaxWordCount))
                    err = $"워드 개수는 {DoubleWordCodec.MinWordCount}~{DoubleWordCodec.MaxWordCount} 사이여야 합니다";
                if (err == null && DoubleWordCodec.ParseOrder(wordOrder, wordCount) == null)
                    err = $"워드 순서는 0~{wordCount - 1}을 콤마로 구분한 순열이어야 합니다";
                if (err == null && !signed && wordCount >= 4)
                    err = "워드 4개(64비트) + 부호없음 조합은 지원하지 않습니다 — 부호있음으로 저장하거나 워드 개수를 3개 이하로 줄이세요.";
                if (err == null && fid == null) err = "폴더ID가 없고 기본 폴더도 지정되지 않았습니다";
                if (err == null && LiveTagMonitorService.ParseAddressFull(address) == null) err = $"주소 형식을 해석할 수 없습니다: '{address}'";
                if (err == null && await repo.GetByIdAsync(plcId.Trim()) == null) err = $"존재하지 않는 PLC ID입니다: '{plcId}'";
                if (err == null && fid != null && !await FolderExistsAsync(repo, fid.Value)) err = $"존재하지 않는 폴더입니다: folderId={fid}";
                if (err == null && fid != null && await DwNameExistsInFolderAsync(repo, fid.Value, name.Trim(), hasId ? id : (int?)null))
                    err = $"같은 폴더 안에 이미 같은 이름의 태그가 있습니다: '{name.Trim()}'";
                if (err != null) { errors.Add($"{excelRow}행: {err}"); continue; }

                try
                {
                    if (hasId)
                    {
                        using var cmd = new MySqlCommand(@"
UPDATE dw_folders_tags SET folder_id=@fid, name=@n, address=@addr, plc_id=@plc,
       word_count=@wc, word_order=@wo, signed_val=@sg, enabled=@en
 WHERE id=@id", conn);
                        cmd.Parameters.AddWithValue("@fid", fid);
                        cmd.Parameters.AddWithValue("@n", name.Trim());
                        cmd.Parameters.AddWithValue("@addr", address.Trim());
                        cmd.Parameters.AddWithValue("@plc", plcId.Trim());
                        cmd.Parameters.AddWithValue("@wc", wordCount);
                        cmd.Parameters.AddWithValue("@wo", wordOrder.Trim());
                        cmd.Parameters.AddWithValue("@sg", signed);
                        cmd.Parameters.AddWithValue("@en", enabled);
                        cmd.Parameters.AddWithValue("@id", id);
                        int n = await cmd.ExecuteNonQueryAsync();
                        if (n > 0) updated++; else errors.Add($"{excelRow}행: ID {id}인 태그를 찾을 수 없습니다");
                    }
                    else
                    {
                        using var cmd = new MySqlCommand(@"
INSERT INTO dw_folders_tags(folder_id, name, address, plc_id, word_count, word_order, signed_val, enabled)
VALUES (@fid, @n, @addr, @plc, @wc, @wo, @sg, @en)", conn);
                        cmd.Parameters.AddWithValue("@fid", fid);
                        cmd.Parameters.AddWithValue("@n", name.Trim());
                        cmd.Parameters.AddWithValue("@addr", address.Trim());
                        cmd.Parameters.AddWithValue("@plc", plcId.Trim());
                        cmd.Parameters.AddWithValue("@wc", wordCount);
                        cmd.Parameters.AddWithValue("@wo", wordOrder.Trim());
                        cmd.Parameters.AddWithValue("@sg", signed);
                        cmd.Parameters.AddWithValue("@en", enabled);
                        await cmd.ExecuteNonQueryAsync();
                        inserted++;
                    }
                }
                catch (MySqlException ex) when (IsFkRestrict(ex)) { errors.Add($"{excelRow}행: 존재하지 않는 폴더입니다"); }
                catch (Exception ex) { errors.Add($"{excelRow}행: {ex.Message}"); }
            }

            return Results.Ok(new { success = true, inserted, updated, errors });
        }).DisableAntiforgery();

        // POST /api/admin/dwtags  body: { folderId, name, address, plcId, wordCount, wordOrder, signed, enabled? }
        app.MapPost("/api/admin/dwtags", async (DoubleWordTagRequest req, PlcRepository repo) =>
        {
            var err = await ValidateDwTagBasicsAsync(req, repo);
            if (err != null) return Results.Ok(new { success = false, error = err });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                await EnsureDwTagTableAsync(conn);
                using var cmd = new MySqlCommand(@"
INSERT INTO dw_folders_tags(folder_id, name, address, plc_id, word_count, word_order, signed_val, enabled)
VALUES (@folderId, @name, @address, @plcId, @wordCount, @wordOrder, @signed, @enabled)", conn);
                cmd.Parameters.AddWithValue("@folderId", req.FolderId);
                cmd.Parameters.AddWithValue("@name", req.Name.Trim());
                cmd.Parameters.AddWithValue("@address", req.Address.Trim());
                cmd.Parameters.AddWithValue("@plcId", req.PlcId.Trim());
                cmd.Parameters.AddWithValue("@wordCount", req.WordCount);
                cmd.Parameters.AddWithValue("@wordOrder", req.WordOrder.Trim());
                cmd.Parameters.AddWithValue("@signed", req.Signed);
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = true, id = (int)cmd.LastInsertedId });
            }
            catch (MySqlException ex) when (IsFkRestrict(ex))
            { return Results.Ok(new { success = false, error = "존재하지 않는 폴더입니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // PUT /api/admin/dwtags/{id}
        app.MapPut("/api/admin/dwtags/{id:int}", async (int id, DoubleWordTagRequest req, PlcRepository repo) =>
        {
            var err = await ValidateDwTagBasicsAsync(req, repo, id);
            if (err != null) return Results.Ok(new { success = false, error = err });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(@"
UPDATE dw_folders_tags SET folder_id=@folderId, name=@name, address=@address, plc_id=@plcId,
       word_count=@wordCount, word_order=@wordOrder, signed_val=@signed, enabled=@enabled
 WHERE id=@id", conn);
                cmd.Parameters.AddWithValue("@folderId", req.FolderId);
                cmd.Parameters.AddWithValue("@name", req.Name.Trim());
                cmd.Parameters.AddWithValue("@address", req.Address.Trim());
                cmd.Parameters.AddWithValue("@plcId", req.PlcId.Trim());
                cmd.Parameters.AddWithValue("@wordCount", req.WordCount);
                cmd.Parameters.AddWithValue("@wordOrder", req.WordOrder.Trim());
                cmd.Parameters.AddWithValue("@signed", req.Signed);
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (MySqlException ex) when (IsFkRestrict(ex))
            { return Results.Ok(new { success = false, error = "존재하지 않는 폴더입니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // DELETE /api/admin/dwtags/{id}
        app.MapDelete("/api/admin/dwtags/{id:int}", async (int id, PlcRepository repo) =>
        {
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand("DELETE FROM dw_folders_tags WHERE id=@id", conn);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/dwtags/write/by-name?name=&value=&folderId= — 정수를 워드 여러 개로 쪼개서 순서대로 씀
        //   value를 long으로 직접 바인딩하면 숫자가 아닌 값이 왔을 때 우리 핸들러에 들어오지도 못하고
        //   ASP.NET Core가 빈 본문의 400을 그냥 돌려버려서(이 앱 전체의 "항상 200 + {success,...}"
        //   관례와 어긋남 — 실제로 확인됨), 문자열로 받아 직접 파싱하고 실패하면 우리 형식대로 답한다.
        app.MapGet("/api/admin/dwtags/write/by-name", async (string name, string value, int? folderId, PlcRepository repo, PlcServiceCache cache, DoubleWordTagMonitorService monitor) =>
        {
            if (!long.TryParse(value, out long parsedValue))
                return Results.Ok(new { success = false, error = $"정수가 아닙니다: '{value}'" });

            var list = await QueryDwTags(repo, folderId, name);
            if (list.Count == 0)
                return Results.Ok(new { success = false, error = $"더블워드 태그를 찾을 수 없음: name='{name}'" });
            if (list.Count > 1)
                return Results.Ok(new
                {
                    success = false,
                    error = $"'{name}'이 {list.Count}개 폴더에 걸쳐 있어 특정할 수 없음 — folderId를 같이 지정하세요.",
                    candidates = list.Select(t => new { t.Id, t.FolderId, t.Address, t.PlcId })
                });
            var tag = list[0];

            var order = DoubleWordCodec.ParseOrder(tag.WordOrder, tag.WordCount);
            if (order == null) return Results.Ok(new { success = false, error = $"워드 순서 설정이 올바르지 않음: '{tag.WordOrder}'" });

            long totalBits = 16L * tag.WordCount;
            long max = tag.Signed ? (1L << (int)(totalBits - 1)) - 1 : (totalBits >= 64 ? long.MaxValue : (1L << (int)totalBits) - 1);
            long min = tag.Signed ? -(1L << (int)(totalBits - 1)) : 0;
            if (parsedValue < min || parsedValue > max)
                return Results.Ok(new { success = false, error = $"값이 범위를 벗어남 — {(tag.Signed ? "부호있는" : "부호없는")} {totalBits}비트 범위는 {min} ~ {max}입니다." });

            var cfg = await repo.GetByIdAsync(tag.PlcId);
            if (cfg == null) return Results.Ok(new { success = false, error = $"tb_plc에 '{tag.PlcId}'가 없음" });

            var parsed = LiveTagMonitorService.ParseAddressFull(tag.Address);
            if (parsed == null) return Results.Ok(new { success = false, error = $"주소 형식을 해석할 수 없음: '{tag.Address}'" });

            var words = DoubleWordCodec.Encode(parsedValue, order);
            try
            {
                var svc = cache.GetOrCreate(cfg);
                for (int i = 0; i < words.Length; i++)
                    await svc.WriteWordAsync(parsed.Value.Addr + i, words[i], parsed.Value.Device);

                // 다음 정식 폴링(기본 30초)을 기다리지 않고 방금 쓴 값을 바로 캐시에 반영 —
                // 문자열 태그에서 겪은 "쓰기 직후 조회하면 안 바뀐 것처럼 보이는" 문제와 동일한 이유.
                monitor.DoubleWordTagValues[tag.Id] = parsedValue;

                return Results.Ok(new { success = true, name, plcId = tag.PlcId, address = tag.Address, value = parsedValue });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });
    }

    private static async Task<string?> ValidateDwTagBasicsAsync(DoubleWordTagRequest req, PlcRepository repo, int? excludeId = null)
    {
        var err = ValidateTagBasics(req.Name, req.Address, req.PlcId);
        if (err == null && (req.WordCount < DoubleWordCodec.MinWordCount || req.WordCount > DoubleWordCodec.MaxWordCount))
            err = $"워드 개수는 {DoubleWordCodec.MinWordCount}~{DoubleWordCodec.MaxWordCount} 사이여야 합니다";
        if (err == null && DoubleWordCodec.ParseOrder(req.WordOrder, req.WordCount) == null)
            err = $"워드 순서는 0~{req.WordCount - 1}을 콤마로 구분한 순열이어야 합니다 (예: {DoubleWordCodec.DefaultOrder(req.WordCount)})";
        // 워드 4개(64비트)를 전부 채우면 내부적으로 값을 C#의 long(부호있는 64비트)으로만 다루기 때문에
        // "부호없음" 해석을 적용할 여분 비트가 없다 — 최상위 비트가 켜진 큰 값이 화면엔 음수로 보이는
        // 문제가 실제로 재현됨(예: 전부 0xFFFF → 정상은 18446744073709551615인데 -1로 표시됨).
        // 워드 2~3개(32/48비트)는 long 안에 여유 비트가 있어 문제없다.
        if (err == null && !req.Signed && req.WordCount >= 4)
            err = "워드 4개(64비트) + 부호없음 조합은 지원하지 않습니다 — 부호있음으로 저장하거나 워드 개수를 3개 이하로 줄이세요.";
        // 저장 시점에 주소/PLC를 미리 검증하지 않으면, 오타난 주소나 존재하지 않는 PLC ID가 그대로
        // 저장돼 폴링에서 조용히 건너뛰어지고 화면엔 영원히 value:null만 남아 원인을 알 수 없게 된다
        // (실제로 확인된 문제) — 저장 자체를 막고 바로 원인을 알려준다.
        if (err == null && LiveTagMonitorService.ParseAddressFull(req.Address) == null)
            err = $"주소 형식을 해석할 수 없습니다: '{req.Address}' (예: D100, M50)";
        if (err == null && await repo.GetByIdAsync(req.PlcId.Trim()) == null)
            err = $"존재하지 않는 PLC ID입니다: '{req.PlcId}'";
        // folder_id는 실제 DB 외래키가 없어(catch(IsFkRestrict) 코드는 그래서 여태 발동한 적이 없었음)
        // 존재하지 않는 폴더로도 그냥 저장돼버렸다(실제로 확인됨) — 여기서 직접 존재를 확인한다.
        if (err == null && !await FolderExistsAsync(repo, req.FolderId))
            err = $"존재하지 않는 폴더입니다: folderId={req.FolderId}";
        // 같은 폴더 안에 이름이 겹치면 이름으로 값쓰기(write/by-name)가 folderId를 줘도 후보를
        // 좁힐 수 없어 영구히 막히는 문제가 실제로 재현됨 — 애초에 저장을 막아 이 상황 자체를 없앤다.
        if (err == null && await DwNameExistsInFolderAsync(repo, req.FolderId, req.Name.Trim(), excludeId))
            err = $"같은 폴더 안에 이미 같은 이름의 태그가 있습니다: '{req.Name.Trim()}'";
        return err;
    }

    private static async Task<bool> FolderExistsAsync(PlcRepository repo, int folderId)
    {
        using var conn = new MySqlConnection(repo.ConnectionString);
        await conn.OpenAsync();
        using var cmd = new MySqlCommand("SELECT COUNT(*) FROM folders WHERE id=@id", conn);
        cmd.Parameters.AddWithValue("@id", folderId);
        return Convert.ToInt64(await cmd.ExecuteScalarAsync()) > 0;
    }

    private static async Task<bool> DwNameExistsInFolderAsync(PlcRepository repo, int folderId, string name, int? excludeId)
    {
        using var conn = new MySqlConnection(repo.ConnectionString);
        await conn.OpenAsync();
        await EnsureDwTagTableAsync(conn);
        string sql = "SELECT COUNT(*) FROM dw_folders_tags WHERE folder_id=@fid AND name=@name" + (excludeId.HasValue ? " AND id<>@exid" : "");
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@fid", folderId);
        cmd.Parameters.AddWithValue("@name", name);
        if (excludeId.HasValue) cmd.Parameters.AddWithValue("@exid", excludeId.Value);
        return Convert.ToInt64(await cmd.ExecuteScalarAsync()) > 0;
    }

    private static async Task<bool> StringNameExistsInFolderAsync(PlcRepository repo, int folderId, string name, int? excludeId)
    {
        using var conn = new MySqlConnection(repo.ConnectionString);
        await conn.OpenAsync();
        await EnsureStringTagTableAsync(conn);
        string sql = "SELECT COUNT(*) FROM tb_string_tag WHERE folder_id=@fid AND tag_name=@name" + (excludeId.HasValue ? " AND string_id<>@exid" : "");
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@fid", folderId);
        cmd.Parameters.AddWithValue("@name", name);
        if (excludeId.HasValue) cmd.Parameters.AddWithValue("@exid", excludeId.Value);
        return Convert.ToInt64(await cmd.ExecuteScalarAsync()) > 0;
    }

    private static async Task EnsureDwTagTableAsync(MySqlConnection conn)
    {
        using var cmd = new MySqlCommand(@"
CREATE TABLE IF NOT EXISTS dw_folders_tags (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    folder_id   INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    address     VARCHAR(50) NOT NULL,
    plc_id      VARCHAR(50) NOT NULL,
    word_count  INT NOT NULL DEFAULT 2,
    word_order  VARCHAR(30) NOT NULL DEFAULT '0,1',
    signed_val  TINYINT(1) NOT NULL DEFAULT 1,
    enabled     TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_dw_folder (folder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    private sealed record DwTagRow(int Id, int FolderId, string Name, string Address, string PlcId, int WordCount, string WordOrder, bool Signed, bool Enabled);

    private static async Task<List<DwTagRow>> QueryDwTags(PlcRepository repo, int? folderId, string? name = null)
    {
        var list = new List<DwTagRow>();
        using var conn = new MySqlConnection(repo.ConnectionString);
        await conn.OpenAsync();
        await EnsureDwTagTableAsync(conn);
        string sql = "SELECT id, folder_id, name, address, plc_id, word_count, word_order, signed_val, enabled FROM dw_folders_tags";
        var conditions = new List<string>();
        if (folderId.HasValue) conditions.Add("folder_id=@fid");
        if (!string.IsNullOrWhiteSpace(name)) conditions.Add("name=@name");
        if (conditions.Count > 0) sql += " WHERE " + string.Join(" AND ", conditions);
        sql += " ORDER BY id";
        using var cmd = new MySqlCommand(sql, conn);
        if (folderId.HasValue) cmd.Parameters.AddWithValue("@fid", folderId.Value);
        if (!string.IsNullOrWhiteSpace(name)) cmd.Parameters.AddWithValue("@name", name);
        using var rd = await cmd.ExecuteReaderAsync();
        while (await rd.ReadAsync())
            list.Add(new DwTagRow(
                rd.GetInt32(0), rd.GetInt32(1), rd.GetString(2), rd.GetString(3), rd.GetString(4),
                rd.GetInt32(5), rd.GetString(6), rd.GetBoolean(7), rd.GetBoolean(8)));
        return list;
    }

    // ================= 문자열 태그 (tb_string_tag) =================
    // 온도 태그처럼 폴더 없이 플랫 목록으로 관리한다. 값 자체는 StringTagMonitorService가 30초
    // 주기로 미리 읽어 디코딩해서 메모리에 들고 있고, 여기서는 그 결과만 꺼내 보여준다(폴더/알람/
    // 온도 태그의 monitor 엔드포인트와 동일한 패턴).
    private static void MapStringTagEndpoints(WebApplication app)
    {
        // GET /api/admin/stringtags?folderId=&name= (생략 시 전체) — 목록 + 현재 디코딩된 값
        app.MapGet("/api/admin/stringtags", async (int? folderId, string? name, PlcRepository repo, StringTagMonitorService monitor) =>
        {
            try
            {
                var list = await QueryStringTags(repo, folderId, name);
                var tags = list.Select(t => new
                {
                    stringId = t.StringId,
                    folderId = t.FolderId,
                    tagName = t.TagName,
                    address = t.Address,
                    plcId = t.PlcId,
                    wordCount = t.WordCount,
                    byteOrder = t.ByteOrder,
                    enabled = t.Enabled,
                    value = monitor.StringTagValues.TryGetValue(t.StringId, out var v) ? v : null
                });
                return Results.Ok(new { success = true, lastPollAt = monitor.LastPollAt, tags });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/stringtags/count?folderId= — 개수만 (더블워드 태그와 동일 패턴)
        app.MapGet("/api/admin/stringtags/count", async (int? folderId, PlcRepository repo) =>
        {
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                await EnsureStringTagTableAsync(conn);
                string sql = "SELECT COUNT(*) FROM tb_string_tag" + (folderId.HasValue ? " WHERE folder_id=@fid" : "");
                using var cmd = new MySqlCommand(sql, conn);
                if (folderId.HasValue) cmd.Parameters.AddWithValue("@fid", folderId.Value);
                long count = Convert.ToInt64(await cmd.ExecuteScalarAsync());
                return Results.Ok(new { success = true, count });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/stringtags/export?folderId= (생략 시 전체) — 엑셀 다운로드
        app.MapGet("/api/admin/stringtags/export", async (int? folderId, PlcRepository repo) =>
        {
            var list = await QueryStringTags(repo, folderId);
            var rows = list.Select(t => new object?[] { t.StringId, t.FolderId, t.TagName, t.Address, t.PlcId, t.WordCount, t.ByteOrder, t.Enabled ? 1 : 0 });
            var bytes = WriteXlsx("문자열태그", new[] { "ID", "폴더ID", "태그이름", "주소", "PLC ID", "워드개수", "바이트순서", "사용(1/0)" }, rows);
            return Results.File(bytes, XlsxContentType, $"string_tags_{DateTime.Now:yyyyMMdd_HHmm}.xlsx");
        });

        // POST /api/admin/stringtags/import?folderId= — 엑셀 업로드로 일괄 등록/수정
        app.MapPost("/api/admin/stringtags/import", async (IFormFile file, int? folderId, PlcRepository repo) =>
        {
            List<Dictionary<string, string>> rows;
            try
            {
                using var stream = file.OpenReadStream();
                rows = ReadXlsxRows(stream);
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = "엑셀 파일을 읽을 수 없습니다: " + ex.Message }); }

            int inserted = 0, updated = 0;
            var errors = new List<string>();
            using var conn = new MySqlConnection(repo.ConnectionString);
            await conn.OpenAsync();
            await EnsureStringTagTableAsync(conn);

            for (int i = 0; i < rows.Count; i++)
            {
                var row = rows[i];
                int excelRow = i + 2;
                string tagName = row.GetValueOrDefault("태그이름", "");
                string address = row.GetValueOrDefault("주소", "");
                string plcId = row.GetValueOrDefault("PLC ID", "");
                int wordCount = int.TryParse(row.GetValueOrDefault("워드개수", ""), out var wc) ? wc : 8;
                string byteOrder = row.GetValueOrDefault("바이트순서", "");
                if (byteOrder != StringTagCodec.LowFirst) byteOrder = StringTagCodec.HighFirst;
                bool enabled = ParseEnabledCell(row.GetValueOrDefault("사용(1/0)", ""));
                int? fid = int.TryParse(row.GetValueOrDefault("폴더ID", ""), out var pf) ? pf : folderId;
                bool hasId = int.TryParse(row.GetValueOrDefault("ID", ""), out var id) && id > 0;

                var err = ValidateTagBasics(tagName, address, plcId);
                if (err == null && wordCount < 1) err = "워드 개수는 1 이상이어야 합니다";
                if (err == null && wordCount > 60) err = "워드 개수가 너무 큽니다(최대 60)";
                if (err == null && fid == null) err = "폴더ID가 없고 기본 폴더도 지정되지 않았습니다";
                if (err == null && LiveTagMonitorService.ParseAddressFull(address) == null) err = $"주소 형식을 해석할 수 없습니다: '{address}'";
                if (err == null && await repo.GetByIdAsync(plcId.Trim()) == null) err = $"존재하지 않는 PLC ID입니다: '{plcId}'";
                if (err == null && fid != null && !await FolderExistsAsync(repo, fid.Value)) err = $"존재하지 않는 폴더입니다: folderId={fid}";
                if (err == null && fid != null && await StringNameExistsInFolderAsync(repo, fid.Value, tagName.Trim(), hasId ? id : (int?)null))
                    err = $"같은 폴더 안에 이미 같은 이름의 태그가 있습니다: '{tagName.Trim()}'";
                if (err != null) { errors.Add($"{excelRow}행: {err}"); continue; }

                try
                {
                    if (hasId)
                    {
                        using var cmd = new MySqlCommand(@"
UPDATE tb_string_tag SET folder_id=@fid, tag_name=@tn, address=@addr, plc_id=@plc,
       word_count=@wc, byte_order=@bo, enabled=@en
 WHERE string_id=@id", conn);
                        cmd.Parameters.AddWithValue("@fid", fid);
                        cmd.Parameters.AddWithValue("@tn", tagName.Trim());
                        cmd.Parameters.AddWithValue("@addr", address.Trim());
                        cmd.Parameters.AddWithValue("@plc", plcId.Trim());
                        cmd.Parameters.AddWithValue("@wc", wordCount);
                        cmd.Parameters.AddWithValue("@bo", byteOrder);
                        cmd.Parameters.AddWithValue("@en", enabled);
                        cmd.Parameters.AddWithValue("@id", id);
                        int n = await cmd.ExecuteNonQueryAsync();
                        if (n > 0) updated++; else errors.Add($"{excelRow}행: ID {id}인 태그를 찾을 수 없습니다");
                    }
                    else
                    {
                        using var cmd = new MySqlCommand(@"
INSERT INTO tb_string_tag(folder_id, tag_name, address, plc_id, word_count, byte_order, enabled)
VALUES (@fid, @tn, @addr, @plc, @wc, @bo, @en)", conn);
                        cmd.Parameters.AddWithValue("@fid", fid);
                        cmd.Parameters.AddWithValue("@tn", tagName.Trim());
                        cmd.Parameters.AddWithValue("@addr", address.Trim());
                        cmd.Parameters.AddWithValue("@plc", plcId.Trim());
                        cmd.Parameters.AddWithValue("@wc", wordCount);
                        cmd.Parameters.AddWithValue("@bo", byteOrder);
                        cmd.Parameters.AddWithValue("@en", enabled);
                        await cmd.ExecuteNonQueryAsync();
                        inserted++;
                    }
                }
                catch (MySqlException ex) when (IsFkRestrict(ex)) { errors.Add($"{excelRow}행: 존재하지 않는 폴더입니다"); }
                catch (Exception ex) { errors.Add($"{excelRow}행: {ex.Message}"); }
            }

            return Results.Ok(new { success = true, inserted, updated, errors });
        }).DisableAntiforgery();

        // POST /api/admin/stringtags  body: { folderId, tagName, address, plcId, wordCount, byteOrder, enabled? }
        app.MapPost("/api/admin/stringtags", async (StringTagRequest req, PlcRepository repo) =>
        {
            var err = await ValidateStringTagBasicsAsync(req, repo);
            if (err != null) return Results.Ok(new { success = false, error = err });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                await EnsureStringTagTableAsync(conn);
                using var cmd = new MySqlCommand(@"
INSERT INTO tb_string_tag(folder_id, tag_name, address, plc_id, word_count, byte_order, enabled)
VALUES (@folderId, @tagName, @address, @plcId, @wordCount, @byteOrder, @enabled)", conn);
                cmd.Parameters.AddWithValue("@folderId", req.FolderId);
                cmd.Parameters.AddWithValue("@tagName", req.TagName.Trim());
                cmd.Parameters.AddWithValue("@address", req.Address.Trim());
                cmd.Parameters.AddWithValue("@plcId", req.PlcId.Trim());
                cmd.Parameters.AddWithValue("@wordCount", req.WordCount);
                cmd.Parameters.AddWithValue("@byteOrder", req.ByteOrder);
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = true, id = (int)cmd.LastInsertedId });
            }
            catch (MySqlException ex) when (IsFkRestrict(ex))
            { return Results.Ok(new { success = false, error = "존재하지 않는 폴더입니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // PUT /api/admin/stringtags/{id}
        app.MapPut("/api/admin/stringtags/{id:int}", async (int id, StringTagRequest req, PlcRepository repo) =>
        {
            var err = await ValidateStringTagBasicsAsync(req, repo, id);
            if (err != null) return Results.Ok(new { success = false, error = err });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(@"
UPDATE tb_string_tag SET folder_id=@folderId, tag_name=@tagName, address=@address, plc_id=@plcId,
       word_count=@wordCount, byte_order=@byteOrder, enabled=@enabled
 WHERE string_id=@id", conn);
                cmd.Parameters.AddWithValue("@folderId", req.FolderId);
                cmd.Parameters.AddWithValue("@tagName", req.TagName.Trim());
                cmd.Parameters.AddWithValue("@address", req.Address.Trim());
                cmd.Parameters.AddWithValue("@plcId", req.PlcId.Trim());
                cmd.Parameters.AddWithValue("@wordCount", req.WordCount);
                cmd.Parameters.AddWithValue("@byteOrder", req.ByteOrder);
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (MySqlException ex) when (IsFkRestrict(ex))
            { return Results.Ok(new { success = false, error = "존재하지 않는 폴더입니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // DELETE /api/admin/stringtags/{id}
        app.MapDelete("/api/admin/stringtags/{id:int}", async (int id, PlcRepository repo) =>
        {
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand("DELETE FROM tb_string_tag WHERE string_id=@id", conn);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/stringtags/write/by-name?name=&value=&folderId= — 문자열을 워드로 인코딩해서 순서대로 씀.
        //   각 워드는 기존 WriteWordAsync(쓰기 후 재확인 로직 포함)를 그대로 재사용한다.
        app.MapGet("/api/admin/stringtags/write/by-name", async (string name, string value, int? folderId, PlcRepository repo, PlcServiceCache cache, StringTagMonitorService monitor) =>
        {
            // 아스키(공백~물결, 0x20~0x7E) 범위를 벗어나는 문자(한글 등)를 그대로 인코딩하면
            // Encoding.ASCII.GetBytes가 조용히 '?'로 바꿔버려서, 사용자는 한글을 썼다고 생각하는데
            // 실제로는 전혀 다른(그리고 알아볼 수 없는) 값이 PLC에 써지는 문제가 생긴다 — 저장 자체를
            // 막고 명확한 에러로 알려준다.
            if (value != null && value.Any(c => c < 0x20 || c > 0x7E))
                return Results.Ok(new { success = false, error = "아스키(영문/숫자/기호) 문자만 쓸 수 있습니다 — 한글 등은 이 PLC 문자열 저장 방식(1바이트 아스키)으로 표현할 수 없습니다." });

            var list = await QueryStringTags(repo, folderId, name);
            if (list.Count == 0)
                return Results.Ok(new { success = false, error = $"문자열 태그를 찾을 수 없음: name='{name}'" });
            // 이제 폴더로 나뉘어 있어서 같은 이름이 여러 폴더에 걸쳐 있을 수 있다 — 어느 걸 쓸지
            // 서버가 임의로 고르면 사용자 의도와 다른 태그에 쓸 위험이 있어(실제로 코드 리뷰에서
            // 확인됨), 알람 태그와 동일하게 후보만 보여주고 쓰기는 거부한다.
            if (list.Count > 1)
                return Results.Ok(new
                {
                    success = false,
                    error = $"'{name}'이 {list.Count}개 폴더에 걸쳐 있어 특정할 수 없음 — folderId를 같이 지정하세요.",
                    candidates = list.Select(t => new { t.StringId, t.FolderId, t.Address, t.PlcId })
                });
            var tag = list[0];

            var cfg = await repo.GetByIdAsync(tag.PlcId);
            if (cfg == null) return Results.Ok(new { success = false, error = $"tb_plc에 '{tag.PlcId}'가 없음" });

            var parsed = LiveTagMonitorService.ParseAddressFull(tag.Address);
            if (parsed == null) return Results.Ok(new { success = false, error = $"주소 형식을 해석할 수 없음: '{tag.Address}'" });

            var (words, truncated) = StringTagCodec.Encode(value, tag.WordCount, tag.ByteOrder);
            try
            {
                var svc = cache.GetOrCreate(cfg);
                for (int i = 0; i < words.Length; i++)
                    await svc.WriteWordAsync(parsed.Value.Addr + i, words[i], parsed.Value.Device);

                // StringTagMonitorService는 30초마다만 캐시(StringTagValues)를 갱신한다 — 방금 쓴
                // 값을 그 다음 폴링까지 기다리지 않고 여기서 바로 반영해야, 화면에서 쓰기 직후
                // 새로고침해도 "안 바뀐 것처럼" 보이는 문제(실제로 확인됨)가 생기지 않는다. 실제로
                // 쓴 워드를 그대로 디코딩해서 넣으므로 다음 정식 폴링과도 값이 어긋나지 않는다.
                monitor.StringTagValues[tag.StringId] = StringTagCodec.Decode(words, tag.ByteOrder);

                return Results.Ok(new { success = true, name, plcId = tag.PlcId, address = tag.Address, value, truncated });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });
    }

    private static async Task<string?> ValidateStringTagBasicsAsync(StringTagRequest req, PlcRepository repo, int? excludeId = null)
    {
        var err = ValidateTagBasics(req.TagName, req.Address, req.PlcId);
        if (err == null && req.WordCount < 1) err = "워드 개수는 1 이상이어야 합니다";
        if (err == null && req.WordCount > 60) err = "워드 개수가 너무 큽니다(최대 60)";
        if (err == null && req.ByteOrder != StringTagCodec.HighFirst && req.ByteOrder != StringTagCodec.LowFirst) err = "바이트 순서 값이 올바르지 않습니다";
        // 더블워드 태그와 동일한 이유 — 저장 시점에 주소/PLC 존재 여부를 미리 막아야 영원히
        // value:null인 채로 원인 모르게 남는 태그가 생기지 않는다.
        if (err == null && LiveTagMonitorService.ParseAddressFull(req.Address) == null)
            err = $"주소 형식을 해석할 수 없습니다: '{req.Address}' (예: D100, M50)";
        if (err == null && await repo.GetByIdAsync(req.PlcId.Trim()) == null)
            err = $"존재하지 않는 PLC ID입니다: '{req.PlcId}'";
        if (err == null && !await FolderExistsAsync(repo, req.FolderId))
            err = $"존재하지 않는 폴더입니다: folderId={req.FolderId}";
        if (err == null && await StringNameExistsInFolderAsync(repo, req.FolderId, req.TagName.Trim(), excludeId))
            err = $"같은 폴더 안에 이미 같은 이름의 태그가 있습니다: '{req.TagName.Trim()}'";
        return err;
    }

    private static async Task EnsureStringTagTableAsync(MySqlConnection conn)
    {
        using (var cmd = new MySqlCommand(@"
CREATE TABLE IF NOT EXISTS tb_string_tag (
    string_id   INT AUTO_INCREMENT PRIMARY KEY,
    folder_id   INT NOT NULL DEFAULT 4,
    tag_name    VARCHAR(100) NOT NULL,
    address     VARCHAR(50) NOT NULL,
    plc_id      VARCHAR(50) NOT NULL,
    word_count  INT NOT NULL DEFAULT 8,
    byte_order  VARCHAR(20) NOT NULL DEFAULT 'HIGH_FIRST',
    enabled     TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_string_folder (folder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", conn))
            await cmd.ExecuteNonQueryAsync();

        // 문자열 태그가 처음엔 폴더 없이(플랫 목록) 나왔었는데, 나중에 모니터링 태그처럼 folders로
        // 묶어달라는 요청이 와서 기존 테이블에 컬럼을 추가한다 — 이미 있으면 조용히 넘어간다.
        // 기존 행은 "test" 폴더(id=4, 이 환경에 이미 있는 테스트용 폴더)로 기본 배정한다.
        using (var alter = new MySqlCommand(
            "ALTER TABLE tb_string_tag ADD COLUMN IF NOT EXISTS folder_id INT NOT NULL DEFAULT 4 AFTER string_id", conn))
            await alter.ExecuteNonQueryAsync();
    }

    private sealed record StringTagRow(int StringId, int FolderId, string TagName, string Address, string PlcId, int WordCount, string ByteOrder, bool Enabled);

    private static async Task<List<StringTagRow>> QueryStringTags(PlcRepository repo, int? folderId, string? name = null)
    {
        var list = new List<StringTagRow>();
        using var conn = new MySqlConnection(repo.ConnectionString);
        await conn.OpenAsync();
        await EnsureStringTagTableAsync(conn);
        string sql = "SELECT string_id, folder_id, tag_name, address, plc_id, word_count, byte_order, enabled FROM tb_string_tag";
        var conditions = new List<string>();
        if (folderId.HasValue) conditions.Add("folder_id=@fid");
        if (!string.IsNullOrWhiteSpace(name)) conditions.Add("tag_name=@name");
        if (conditions.Count > 0) sql += " WHERE " + string.Join(" AND ", conditions);
        sql += " ORDER BY string_id";
        using var cmd = new MySqlCommand(sql, conn);
        if (folderId.HasValue) cmd.Parameters.AddWithValue("@fid", folderId.Value);
        if (!string.IsNullOrWhiteSpace(name)) cmd.Parameters.AddWithValue("@name", name);
        using var rd = await cmd.ExecuteReaderAsync();
        while (await rd.ReadAsync())
            list.Add(new StringTagRow(
                rd.GetInt32(0), rd.GetInt32(1), rd.GetString(2), rd.GetString(3), rd.GetString(4), rd.GetInt32(5), rd.GetString(6), rd.GetBoolean(7)));
        return list;
    }

    // ================= 실시간 모니터링 — PLC를 새로 두드리지 않고, LiveTagMonitorService/
    // TempMonitorService가 이미 폴링해서 메모리(또는 tb_temp_snapshot)에 들고 있는 값만 꺼내 보여준다 =================
    private static void MapMonitorEndpoints(WebApplication app)
    {
        // ai-diagnosis가 쓰는 모델 — 채팅(AdminChatEndpoints)과 같은 설정값을 써야 Ollama가 두 모델을
        // 번갈아 메모리에 올렸다 내리는(모델 스왑) 지연이 생기지 않는다.
        string ollamaModel = app.Configuration["Ollama:Model"] ?? "ax4-light";

        // GET /api/admin/monitor/foldertags?folderId= (생략 시 전체) — FolderTagValues(메모리) 그대로 조회
        app.MapGet("/api/admin/monitor/foldertags", async (int? folderId, LiveTagMonitorService monitor, PlcRepository repo) =>
        {
            try
            {
                var list = await QueryFolderTags(repo, folderId);
                var tags = list.Select(t => new
                {
                    id = t.Id,
                    name = t.Name,
                    address = t.Address,
                    folderId = t.FolderId,
                    folderName = t.FolderName,
                    plcId = t.PlcId,
                    value = monitor.FolderTagValues.TryGetValue(t.Id, out var v) ? v : null
                });
                return Results.Ok(new { success = true, lastPollAt = monitor.LastPollAt, tags });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/monitor/alarmtags?folderId=&name= (둘 다 생략 시 전체) — AlarmTagValues(메모리, ON/OFF) 그대로 조회
        // name을 주면 그 이름 하나로 정확히 좁혀서 반환한다 — AI 어시스턴트가 태그 하나의 상태만 물을 때
        // 전체 목록(238개 등)을 받아 앞부분만 잘려서 놓치는 일이 없도록 하기 위함.
        // onOnly=true면 현재 ON 상태인 태그만 걸러서 반환한다 — "지금 켜져있는 알람 있어?" 같은 질문에
        // 전체 목록을 다 주면(TrimForLlm이 앞 40개만 넘김) 41번째 이후에서 켜진 알람을 놓칠 수 있어서,
        // 그 경우엔 이 필터로 ON인 것만 추려 애초에 40개 미만이 되게 한다(보통 ON은 소수뿐).
        app.MapGet("/api/admin/monitor/alarmtags", async (int? folderId, string? name, string? equipId, bool? onOnly, LiveTagMonitorService monitor, PlcRepository repo) =>
        {
            try
            {
                var list = await QueryAlarmTags(repo, folderId, name, equipId);
                var tags = list.Select(t => new
                {
                    tagId = t.TagId,
                    tagName = t.TagName,
                    address = t.Address,
                    plcId = t.PlcId,
                    folderName = t.FolderName,
                    alarmMsg = t.AlarmMsg,
                    level = t.Level,
                    isOn = monitor.AlarmTagValues.TryGetValue(t.TagId, out var v) ? (bool?)v : null
                });
                if (onOnly == true) tags = tags.Where(t => t.isOn == true);
                return Results.Ok(new { success = true, lastPollAt = monitor.LastPollAt, tags });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/monitor/temptags?equipId=&minutes=60 (생략 시 전체/60분)
        //   tb_temp_snapshot에서 최근 N분 치를 태그별 col_name 컬럼으로 뽑아 트렌드(시계열)로 재구성한다.
        //   col_name은 태그 등록 시 SafeColumnName으로 이미 검증된 값만 DB에 들어올 수 있어
        //   여기서 SELECT 컬럼 목록에 직접 꽂아도 SQL 인젝션 위험이 없다.
        app.MapGet("/api/admin/monitor/temptags", async (string? equipId, int? minutes, PlcRepository repo) =>
        {
            try
            {
                var tempTags = await QueryTempTags(repo, equipId);
                if (tempTags.Count == 0) return Results.Ok(new { success = true, tags = Array.Empty<object>() });

                int mins = minutes is > 0 ? minutes.Value : 60;
                var colNames = tempTags.Select(t => t.ColName).Distinct().ToList();
                string selectCols = string.Join(", ", colNames.Select(c => $"`{c}`"));

                var seriesByCol = colNames.ToDictionary(c => c, _ => new List<(string T, double V)>());
                using (var conn = new MySqlConnection(repo.ConnectionString))
                {
                    await conn.OpenAsync();
                    using var cmd = new MySqlCommand($@"
SELECT record_time, {selectCols} FROM tb_temp_snapshot
 WHERE record_time >= DATE_SUB(NOW(), INTERVAL @mins MINUTE)
 ORDER BY record_time ASC", conn);
                    cmd.Parameters.AddWithValue("@mins", mins);
                    using var rd = await cmd.ExecuteReaderAsync();
                    while (await rd.ReadAsync())
                    {
                        string time = rd.GetDateTime(0).ToString("o");
                        for (int i = 0; i < colNames.Count; i++)
                        {
                            int ordinal = i + 1;
                            if (!rd.IsDBNull(ordinal))
                                seriesByCol[colNames[i]].Add((time, rd.GetDouble(ordinal)));
                        }
                    }
                }

                var tags = tempTags.Select(t => new
                {
                    tempId = t.TempId,
                    tagName = t.TagName,
                    trendName = t.TrendName,
                    equipId = t.EquipId,
                    current = seriesByCol[t.ColName].Count > 0 ? seriesByCol[t.ColName][^1].V : (double?)null,
                    series = seriesByCol[t.ColName].Select(s => new { t = s.T, v = s.V })
                });
                return Results.Ok(new { success = true, tags });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/monitor/taglog?limit=50 — 값 쓰기 이력(tb_tag_log) 최근 N건.
        // 모니터링 태그 값쓰기 패널이 빈 공간을 채우는 용도로 쓴다. 쓰기 자체가 없었으면 빈 배열.
        app.MapGet("/api/admin/monitor/taglog", async (int? limit, PlcRepository repo) =>
        {
            try
            {
                int take = Math.Clamp(limit ?? 50, 1, 500);
                var logs = new List<object>();
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using (var cmd = new MySqlCommand(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='tb_tag_log'", conn))
                {
                    if (Convert.ToInt64(await cmd.ExecuteScalarAsync()) == 0)
                        return Results.Ok(new { success = true, logs = Array.Empty<object>() }); // 아직 한 번도 안 써봄
                }
                using var sel = new MySqlCommand(@"
SELECT log_id, tag_type, tag_id, tag_name, address, plc_id, old_value, new_value, written_at
  FROM tb_tag_log ORDER BY written_at DESC, log_id DESC LIMIT @take", conn);
                sel.Parameters.AddWithValue("@take", take);
                using var rd = await sel.ExecuteReaderAsync();
                while (await rd.ReadAsync())
                {
                    logs.Add(new
                    {
                        logId = rd.GetInt64(0),
                        tagType = rd.GetString(1),
                        tagId = rd.IsDBNull(2) ? (int?)null : rd.GetInt32(2),
                        tagName = rd.IsDBNull(3) ? null : rd.GetString(3),
                        address = rd.GetString(4),
                        plcId = rd.GetString(5),
                        oldValue = rd.IsDBNull(6) ? (int?)null : rd.GetInt32(6),
                        newValue = rd.GetInt32(7),
                        writtenAt = rd.GetDateTime(8)
                    });
                }
                return Results.Ok(new { success = true, logs });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/monitor/pollstatus — PLC 관리 화면 우측 패널용. 백그라운드 폴링 두 서비스
        // (LiveTagMonitorService=알람+폴더 통합, TempMonitorService=온도)가 지금 PLC별로 어떻게
        // 묶여서 도는지, 한 사이클에 실제 몇 ms 걸리는지, 최근 실패가 있었는지를 그대로 보여준다.
        // PLC를 새로 두드리지 않는다 — 두 서비스가 이미 들고 있는 값만 꺼낸다.
        app.MapGet("/api/admin/monitor/pollstatus", (LiveTagMonitorService liveMonitor, TempMonitorService tempMonitor) =>
        {
            var liveFailures = liveMonitor.RecentFailures.Select(f => new
            {
                at = f.At, source = "알람/폴더", plcId = f.PlcId, device = f.Device, message = f.Message
            });
            var tempFailures = tempMonitor.RecentFailures.Select(f => new
            {
                at = f.At, source = "온도", plcId = f.PlcId, device = f.Device, message = f.Message
            });
            var failures = liveFailures.Concat(tempFailures).OrderByDescending(f => f.at).Take(30);

            return Results.Ok(new
            {
                success = true,
                live = new
                {
                    intervalMs = liveMonitor.IntervalMs,
                    chunkSize = liveMonitor.ChunkSize,
                    lastCycleDurationMs = liveMonitor.LastCycleDurationMs,
                    lastPollAt = liveMonitor.LastPollAt,
                    groups = liveMonitor.GetPollGroups(),
                    durationHistory = liveMonitor.DurationHistory.Select(h => new { at = h.At, ms = h.DurationMs })
                },
                temp = new
                {
                    intervalMs = tempMonitor.IntervalMs,
                    lastCycleDurationMs = tempMonitor.LastCycleDurationMs,
                    lastPollAt = tempMonitor.LastPollAt,
                    tagCount = tempMonitor.LastTagCount,
                    durationHistory = tempMonitor.DurationHistory.Select(h => new { at = h.At, ms = h.DurationMs })
                },
                failures
            });
        });

        // POST /api/admin/monitor/ai-diagnosis  body: pollstatus가 이미 내려준 { live, temp, failures } 그대로
        //   PLC를 새로 두드리거나 DB를 새로 조회하지 않는다 — 프론트가 이미 가지고 있는 상태 요약을
        //   그대로 받아서 로컬 Ollama(같은 PC, http://localhost:11434)에게 "지금 상황을 설명해달라"고
        //   물어본 결과만 돌려준다. Ollama가 안 켜져 있거나 느리면 success:false로 응답한다.
        app.MapPost("/api/admin/monitor/ai-diagnosis", async (HttpRequest req) =>
        {
            try
            {
                using var reader = new StreamReader(req.Body);
                string body = await reader.ReadToEndAsync();
                using var doc = JsonDocument.Parse(body);

                string prompt = BuildDiagnosisPrompt(doc.RootElement);

                // 7B 모델은 처음 호출될 때 GPU에 올리는 시간까지 더해지므로 60초로는 빠듯해 넉넉히 잡는다.
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(120) };
                var ollamaReq = new { model = ollamaModel, prompt, stream = false, keep_alive = AdminChatEndpoints.OllamaKeepAlive };
                var resp = await http.PostAsJsonAsync("http://localhost:11434/api/generate", ollamaReq);
                if (!resp.IsSuccessStatusCode)
                    return Results.Ok(new { success = false, error = $"Ollama 응답 오류: {resp.StatusCode}" });

                var ollamaJson = await resp.Content.ReadFromJsonAsync<JsonElement>();
                string analysis = ollamaJson.TryGetProperty("response", out var respProp) ? (respProp.GetString() ?? "") : "";
                return Results.Ok(new { success = true, analysis = analysis.Trim() });
            }
            catch (HttpRequestException ex)
            {
                return Results.Ok(new { success = false, error = $"Ollama에 연결할 수 없습니다(로컬에서 실행 중인지 확인하세요): {ex.Message}" });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });
    }

    // pollstatus 응답(JSON)을 그대로 받아 Ollama에게 물어볼 한국어 프롬프트로 조립한다.
    // 실패 로그는 프롬프트가 너무 길어지지 않도록 최근 15건까지만 포함한다.
    private static string BuildDiagnosisPrompt(JsonElement root)
    {
        var sb = new StringBuilder();
        sb.AppendLine("당신은 공장 PLC 통신 모니터링 시스템의 진단 도우미입니다. 아래 현재 상태를 보고 한국어로, " +
                       "5줄 이내로 짧고 실용적으로 현재 상황·원인 추정·조치 방법을 설명해주세요.");
        sb.AppendLine();

        if (root.TryGetProperty("live", out var live))
        {
            sb.AppendLine($"[알람+폴더 태그 폴링] 주기 {live.GetProperty("intervalMs").GetInt32()}ms, " +
                           $"최근 한 바퀴 소요시간 {live.GetProperty("lastCycleDurationMs").GetInt64()}ms");
            if (live.TryGetProperty("groups", out var groups))
                foreach (var g in groups.EnumerateArray())
                    sb.AppendLine($"  - {g.GetProperty("plcLabel").GetString()}({g.GetProperty("plcId").GetString()}): " +
                                  $"폴더 {g.GetProperty("folderTagCount").GetInt32()}개, 알람 {g.GetProperty("alarmTagCount").GetInt32()}개");
        }
        if (root.TryGetProperty("temp", out var temp))
        {
            sb.AppendLine($"[온도 태그 폴링] 주기 {temp.GetProperty("intervalMs").GetInt32()}ms, " +
                           $"최근 한 바퀴 소요시간 {temp.GetProperty("lastCycleDurationMs").GetInt64()}ms, " +
                           $"태그 {temp.GetProperty("tagCount").GetInt32()}개");
        }

        sb.AppendLine();
        int failureCount = root.TryGetProperty("failures", out var failures) ? failures.GetArrayLength() : 0;
        if (failureCount > 0)
        {
            sb.AppendLine("[최근 실패 로그]");
            int i = 0;
            foreach (var f in failures.EnumerateArray())
            {
                if (i++ >= 15) break;
                sb.AppendLine($"  - {f.GetProperty("plcId").GetString()}: {f.GetProperty("message").GetString()}");
            }
        }
        else
        {
            sb.AppendLine("[최근 실패 로그] 없음 — 모든 PLC 정상 통신 중");
        }

        return sb.ToString();
    }

    // col_name으로 쓸 수 있는 안전한 식별자인지 검사.
    // tb_temp_snapshot에 `ALTER TABLE ... ADD COLUMN `{col}` DOUBLE` 형태로 그대로 꽂히므로
    // 영문/숫자/밑줄만 허용해서 SQL 식별자 주입(백틱 탈출 등)을 원천 차단한다.
    // 맨 앞이 숫자여도 허용한다 — MySQL은 백틱으로 감싸면 숫자로 시작하는 식별자도 유효하고,
    // 실제로 기존 온도 태그(No.1/No.2 Zone)의 col_name이 "1zone"/"2zone"라 숫자로 시작한다.
    // 앞글자를 강제하면 이 기존 태그를 수정/재업로드할 때마다 검증에 걸려 저장이 안 되는 문제가 있었다.
    private static readonly Regex SafeColumnName = new(@"^[A-Za-z0-9_]{1,64}$", RegexOptions.Compiled);

    private static bool IsFkRestrict(MySqlException ex) => ex.Number is 1451 or 1452;

    // "사용" 엑셀 컬럼 파싱 — 비우면 기본 true(신규 등록 폼과 동일한 기본값), 0/false/N 계열만 false.
    private static bool ParseEnabledCell(string? v)
    {
        if (string.IsNullOrWhiteSpace(v)) return true;
        var t = v.Trim();
        return !(t == "0" || t.Equals("false", StringComparison.OrdinalIgnoreCase) || t.Equals("N", StringComparison.OrdinalIgnoreCase));
    }

    // ── 엑셀 공용 헬퍼: 워크시트 1행을 헤더로 보고, 그 아래 행들을 "헤더텍스트→값(문자열)" 딕셔너리로 읽는다.
    // 인덱스가 아니라 헤더 텍스트로 찾기 때문에, 사용자가 엑셀에서 컬럼 순서를 바꿔도 안전하다.
    private static List<Dictionary<string, string>> ReadXlsxRows(Stream stream)
    {
        using var wb = new XLWorkbook(stream);
        var ws = wb.Worksheet(1);
        var headers = new List<string>();
        int col = 1;
        while (!ws.Cell(1, col).IsEmpty())
        {
            headers.Add(ws.Cell(1, col).GetString().Trim());
            col++;
        }

        var rows = new List<Dictionary<string, string>>();
        int lastRow = ws.LastRowUsed()?.RowNumber() ?? 1;
        for (int r = 2; r <= lastRow; r++)
        {
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            bool anyValue = false;
            for (int c = 0; c < headers.Count; c++)
            {
                var cell = ws.Cell(r, c + 1);
                string val = cell.IsEmpty() ? "" : cell.GetString().Trim();
                if (val.Length > 0) anyValue = true;
                dict[headers[c]] = val;
            }
            if (anyValue) rows.Add(dict);
        }
        return rows;
    }

    // ── 엑셀 공용 헬퍼: 헤더 배열 + 행 데이터로 .xlsx 바이트를 만든다.
    private static byte[] WriteXlsx(string sheetName, string[] headers, IEnumerable<object?[]> rows)
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add(sheetName);
        for (int i = 0; i < headers.Length; i++) ws.Cell(1, i + 1).Value = headers[i];
        ws.Row(1).Style.Font.Bold = true;
        ws.Row(1).Style.Fill.BackgroundColor = XLColor.FromArgb(0xE3, 0xF1, 0xF5);
        ws.SheetView.FreezeRows(1);

        int r = 2;
        foreach (var row in rows)
        {
            for (int c = 0; c < row.Length; c++)
            {
                var cell = ws.Cell(r, c + 1);
                switch (row[c])
                {
                    case null: cell.Value = ""; break;
                    case int iv: cell.Value = iv; break;
                    case bool bv: cell.Value = bv ? 1 : 0; break;
                    default: cell.Value = row[c]!.ToString(); break;
                }
            }
            r++;
        }
        ws.Columns().AdjustToContents(1, Math.Min(r - 1, 500));
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    // ================= 공용: PLC 목록 (드롭다운용) =================
    private static readonly HashSet<string> KnownPlcTypes = new(StringComparer.OrdinalIgnoreCase) { "LS", "MITSUBISHI", "MODBUS_TCP" };

    private static void MapPlcListEndpoint(WebApplication app)
    {
        // GET /api/admin/plcs — "PLC 관리" 탭의 목록이자, 다른 태그 등록 폼들의 "PLC 선택" 드롭다운도
        // 같은 응답을 그대로 재사용한다(둘 다 tb_plc 전체 목록이 필요할 뿐이라 API를 나눌 이유가 없음).
        app.MapGet("/api/admin/plcs", async (PlcRepository repo) =>
        {
            var list = await repo.GetAllAsync();
            return Results.Ok(new
            {
                success = true,
                plcs = list.Select(p => new { plcId = p.Id, label = p.Label, ip = p.Ip, port = p.Port, plcType = p.PlcType, enabled = p.Enabled })
            });
        });

        // POST /api/admin/plcs  body: { plcId, ip, port, plcType, label, enabled? }
        //   plc_id가 PK라 신규 등록 때 이미 있는 id를 쓰면 기존 PLC 설정을 덮어쓰는 사고가 될 수 있어
        //   생성 전에 먼저 존재 여부를 확인한다(수정은 아래 PUT에서 id를 route로 고정해서 처리).
        app.MapPost("/api/admin/plcs", async (PlcAdminRequest req, PlcRepository repo) =>
        {
            var err = ValidatePlcBasics(req.PlcId, req.Ip, req.Label, req.PlcType, req.Port);
            if (err != null) return Results.Ok(new { success = false, error = err });
            try
            {
                if (await repo.GetByIdAsync(req.PlcId.Trim()) != null)
                    return Results.Ok(new { success = false, error = "이미 존재하는 PLC ID입니다" });
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(@"
INSERT INTO tb_plc(plc_id, ip, port, plc_type, label, enabled, created_at, updated_at)
VALUES (@id, @ip, @port, @type, @label, @enabled, NOW(), NOW())", conn);
                cmd.Parameters.AddWithValue("@id", req.PlcId.Trim());
                cmd.Parameters.AddWithValue("@ip", req.Ip.Trim());
                cmd.Parameters.AddWithValue("@port", req.Port);
                cmd.Parameters.AddWithValue("@type", req.PlcType.Trim().ToUpperInvariant());
                cmd.Parameters.AddWithValue("@label", req.Label.Trim());
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = true, plcId = req.PlcId.Trim() });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // PUT /api/admin/plcs/{id}  body: { ip, port, plcType, label, enabled? } — plc_id(PK)는 route로 고정,
        //   본문으로 바꿀 수 없다(다른 태그들이 문자열로 참조하고 있어 여기서 바뀌면 전부 끊어짐).
        app.MapPut("/api/admin/plcs/{id}", async (string id, PlcAdminRequest req, PlcRepository repo) =>
        {
            var err = ValidatePlcBasics(id, req.Ip, req.Label, req.PlcType, req.Port);
            if (err != null) return Results.Ok(new { success = false, error = err });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(@"
UPDATE tb_plc SET ip=@ip, port=@port, plc_type=@type, label=@label, enabled=@enabled, updated_at=NOW()
 WHERE plc_id=@id", conn);
                cmd.Parameters.AddWithValue("@ip", req.Ip.Trim());
                cmd.Parameters.AddWithValue("@port", req.Port);
                cmd.Parameters.AddWithValue("@type", req.PlcType.Trim().ToUpperInvariant());
                cmd.Parameters.AddWithValue("@label", req.Label.Trim());
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/plcs/{id}/usage — 삭제 확인창에 "이 PLC를 쓰는 태그가 몇 개 있는지" 보여주기 위한 사전 조회.
        //   folders_tags/tb_temp_tag는 plc_id에 FK가 없어 삭제해도 조용히 고아 참조로 남고,
        //   tb_alarm_tag만 FK가 SET NULL이라 삭제 시 자동으로 plc_id가 비워진다 — 셋 다 "막지는" 않는다.
        app.MapGet("/api/admin/plcs/{id}/usage", async (string id, PlcRepository repo) =>
        {
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                async Task<int> CountAsync(string table, string col)
                {
                    using var cmd = new MySqlCommand($"SELECT COUNT(*) FROM {table} WHERE {col}=@id", conn);
                    cmd.Parameters.AddWithValue("@id", id);
                    return Convert.ToInt32(await cmd.ExecuteScalarAsync());
                }
                int folderTags = await CountAsync("folders_tags", "plc_id");
                int tempTags = await CountAsync("tb_temp_tag", "plc_id");
                int alarmTags = await CountAsync("tb_alarm_tag", "plc_id");
                return Results.Ok(new { success = true, folderTags, tempTags, alarmTags });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // DELETE /api/admin/plcs/{id}
        // PLC를 지우면 그 PLC를 참조 중인 태그들의 plc_id도 FK 없이 그냥 끊어져서(dw_folders_tags/
        // tb_string_tag는 물론 folders_tags/tb_temp_tag/tb_alarm_tag도 plc_id에 FK가 없음) 이후
        // JOIN이 안 돼 조용히 영원히 폴링 안 되는 태그가 남는다 — 폴더 삭제 때 고쳤던 것과 같은
        // 문제라, 여기서는 캐스케이드 삭제 대신(태그 개수가 훨씬 많을 수 있어 더 위험) 사용 중이면
        // 삭제 자체를 막는 쪽을 택했다.
        app.MapDelete("/api/admin/plcs/{id}", async (string id, PlcRepository repo) =>
        {
            try
            {
                var refs = await CountPlcReferencesAsync(repo, id);
                var inUse = refs.Where(kv => kv.Value > 0).ToList();
                if (inUse.Count > 0)
                {
                    string detail = string.Join(", ", inUse.Select(kv => $"{kv.Key} {kv.Value}개"));
                    return Results.Ok(new { success = false, error = $"이 PLC를 사용 중인 태그가 있어 삭제할 수 없습니다 — {detail}. 먼저 해당 태그들을 삭제하거나 다른 PLC로 옮기세요." });
                }
                bool ok = await repo.RemoveAsync(id);
                return Results.Ok(new { success = ok });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });
    }

    private static async Task<Dictionary<string, int>> CountPlcReferencesAsync(PlcRepository repo, string plcId)
    {
        using var conn = new MySqlConnection(repo.ConnectionString);
        await conn.OpenAsync();
        await EnsureDwTagTableAsync(conn);
        await EnsureStringTagTableAsync(conn);

        async Task<int> CountFrom(string table, string col)
        {
            using var cmd = new MySqlCommand($"SELECT COUNT(*) FROM {table} WHERE {col}=@id", conn);
            cmd.Parameters.AddWithValue("@id", plcId);
            return Convert.ToInt32(await cmd.ExecuteScalarAsync());
        }

        return new Dictionary<string, int>
        {
            ["모니터링 태그"] = await CountFrom("folders_tags", "plc_id"),
            ["온도 태그"] = await CountFrom("tb_temp_tag", "plc_id"),
            ["알람 태그"] = await CountFrom("tb_alarm_tag", "plc_id"),
            ["더블워드 태그"] = await CountFrom("dw_folders_tags", "plc_id"),
            ["문자열 태그"] = await CountFrom("tb_string_tag", "plc_id"),
        };
    }

    private static string? ValidatePlcBasics(string? plcId, string? ip, string? label, string? plcType, int port)
    {
        if (string.IsNullOrWhiteSpace(plcId)) return "PLC ID는 필수입니다";
        if (string.IsNullOrWhiteSpace(ip)) return "IP는 필수입니다";
        if (string.IsNullOrWhiteSpace(label)) return "이름(label)은 필수입니다";
        if (string.IsNullOrWhiteSpace(plcType) || !KnownPlcTypes.Contains(plcType.Trim())) return "타입은 LS/MITSUBISHI/MODBUS_TCP 중 하나여야 합니다";
        if (port is < 1 or > 65535) return "포트는 1~65535 사이여야 합니다";
        return null;
    }

    // ================= 폴더 (folders) — 모니터링 태그가 속하는 폴더 =================
    private static void MapFolderEndpoints(WebApplication app)
    {
        // GET /api/admin/folders — 전체 폴더 목록 (트리 구성은 프론트에서 parentId로 조립)
        app.MapGet("/api/admin/folders", async (PlcRepository repo) =>
        {
            try
            {
                var list = new List<object>();
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand("SELECT id, name, parent_id FROM folders ORDER BY id", conn);
                using var rd = await cmd.ExecuteReaderAsync();
                while (await rd.ReadAsync())
                    list.Add(new { id = rd.GetInt32(0), name = rd.GetString(1), parentId = rd.IsDBNull(2) ? (int?)null : rd.GetInt32(2) });
                return Results.Ok(new { success = true, folders = list });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // POST /api/admin/folders  body: { name, parentId? }
        app.MapPost("/api/admin/folders", async (FolderRequest req, PlcRepository repo) =>
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                return Results.Ok(new { success = false, error = "폴더 이름은 필수입니다" });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand("INSERT INTO folders(name, parent_id) VALUES (@name, @parentId)", conn);
                cmd.Parameters.AddWithValue("@name", req.Name.Trim());
                cmd.Parameters.AddWithValue("@parentId", (object?)req.ParentId ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = true, id = (int)cmd.LastInsertedId });
            }
            catch (MySqlException ex) when (IsFkRestrict(ex))
            { return Results.Ok(new { success = false, error = "존재하지 않는 상위 폴더입니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // PUT /api/admin/folders/{id}  body: { name, parentId? }
        app.MapPut("/api/admin/folders/{id:int}", async (int id, FolderRequest req, PlcRepository repo) =>
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                return Results.Ok(new { success = false, error = "폴더 이름은 필수입니다" });
            if (req.ParentId == id)
                return Results.Ok(new { success = false, error = "자기 자신을 상위 폴더로 지정할 수 없습니다" });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand("UPDATE folders SET name=@name, parent_id=@parentId WHERE id=@id", conn);
                cmd.Parameters.AddWithValue("@name", req.Name.Trim());
                cmd.Parameters.AddWithValue("@parentId", (object?)req.ParentId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (MySqlException ex) when (IsFkRestrict(ex))
            { return Results.Ok(new { success = false, error = "존재하지 않는 상위 폴더입니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // DELETE /api/admin/folders/{id}
        //   주의: folders_tags.folder_id와 folders.parent_id 둘 다 FK가 ON DELETE CASCADE라,
        //   이 폴더 삭제는 안의 태그/하위 폴더까지 DB가 조용히 함께 지운다(막아주지 않음).
        //   그래서 되돌릴 수 없는 개수 경고는 프론트(tags.js)가 삭제 전 태그 목록을 먼저 조회해서 보여준다.
        //
        //   dw_folders_tags/tb_string_tag는 folders를 나중에(각각 이 파일 안에서) 공유해서 쓰게 됐는데
        //   FK 제약 없이 folder_id만 저장해서, 폴더를 지워도 이 두 테이블 행은 조용히 안 지워지고
        //   존재하지 않는 folder_id를 가진 채로 남는(고아 행) 문제가 실제로 확인됐다 — 화면 확인창은
        //   "태그도 같이 삭제된다"고 안내하는데 실제로는 안 지워지는 불일치였다. 여기서 명시적으로
        //   같이 지워서 folders_tags와 동일한 동작(폴더 삭제 = 안의 태그도 삭제)을 보장한다.
        app.MapDelete("/api/admin/folders/{id:int}", async (int id, PlcRepository repo) =>
        {
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                await EnsureDwTagTableAsync(conn);
                await EnsureStringTagTableAsync(conn);
                using (var delDw = new MySqlCommand("DELETE FROM dw_folders_tags WHERE folder_id=@id", conn))
                { delDw.Parameters.AddWithValue("@id", id); await delDw.ExecuteNonQueryAsync(); }
                using (var delStr = new MySqlCommand("DELETE FROM tb_string_tag WHERE folder_id=@id", conn))
                { delStr.Parameters.AddWithValue("@id", id); await delStr.ExecuteNonQueryAsync(); }
                using var cmd = new MySqlCommand("DELETE FROM folders WHERE id=@id", conn);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });
    }

    // ================= 모니터링 태그 (folders_tags) =================
    private static void MapFolderTagEndpoints(WebApplication app)
    {
        // GET /api/admin/foldertags/count?folderId=4 (생략 시 전체) — 개수만 필요한 질문 전용.
        // AI 어시스턴트가 "태그 몇 개야?" 질문에 list_folder_tags(태그 40개 분량 데이터 + note)를 쓰면
        // 작은 모델이 데이터량에 압도돼 답을 아예 못 만드는 경우가 실제로 확인돼서, 개수 하나만
        // 가볍게 돌려주는 전용 경로를 따로 둔다.
        app.MapGet("/api/admin/foldertags/count", async (int? folderId, PlcRepository repo) =>
        {
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                string sql = "SELECT COUNT(*) FROM folders_tags" + (folderId.HasValue ? " WHERE folder_id=@fid" : "");
                using var cmd = new MySqlCommand(sql, conn);
                if (folderId.HasValue) cmd.Parameters.AddWithValue("@fid", folderId.Value);
                long count = Convert.ToInt64(await cmd.ExecuteScalarAsync());
                return Results.Ok(new { success = true, count });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/foldertags?folderId=4 (생략 시 전체 폴더 통틀어 전부) — 관리 화면용 "정의" 목록
        // (값이 아니라 정의. 값 조회는 /api/foldertag/values)
        app.MapGet("/api/admin/foldertags", async (int? folderId, PlcRepository repo) =>
        {
            try
            {
                var list = await QueryFolderTags(repo, folderId);
                return Results.Ok(new { success = true, tags = list });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/foldertags/export?folderId=4 (생략 시 전체) — 엑셀 다운로드
        app.MapGet("/api/admin/foldertags/export", async (int? folderId, PlcRepository repo) =>
        {
            var list = await QueryFolderTags(repo, folderId);
            var rows = list.Select(t => new object?[] { t.Id, t.FolderId, t.FolderName, t.Name, t.Address, t.PlcId, t.Type, t.Enabled ? 1 : 0 });
            var bytes = WriteXlsx("모니터링태그", new[] { "ID", "폴더ID", "폴더명(참고용,수정무시)", "태그이름", "주소", "PLC ID", "타입", "사용(1/0)" }, rows);
            return Results.File(bytes, XlsxContentType, $"monitoring_tags_{DateTime.Now:yyyyMMdd_HHmm}.xlsx");
        });

        // POST /api/admin/foldertags/import?folderId=4 — 엑셀 업로드로 일괄 등록/수정
        //   행의 "폴더ID"가 비어있으면 이 folderId(현재 화면에서 선택된 폴더)를 기본값으로 쓴다.
        //   "ID"가 있고 실제 존재하는 태그면 수정, 없으면 신규 등록. 한 행 실패해도 나머지는 계속 처리한다.
        app.MapPost("/api/admin/foldertags/import", async (IFormFile file, int? folderId, PlcRepository repo) =>
        {
            List<Dictionary<string, string>> rows;
            try
            {
                using var stream = file.OpenReadStream();
                rows = ReadXlsxRows(stream);
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = "엑셀 파일을 읽을 수 없습니다: " + ex.Message }); }

            int inserted = 0, updated = 0;
            var errors = new List<string>();
            using var conn = new MySqlConnection(repo.ConnectionString);
            await conn.OpenAsync();

            for (int i = 0; i < rows.Count; i++)
            {
                var row = rows[i];
                int excelRow = i + 2;
                string name = row.GetValueOrDefault("태그이름", "");
                string address = row.GetValueOrDefault("주소", "");
                string plcId = row.GetValueOrDefault("PLC ID", "");
                string type = row.GetValueOrDefault("타입", "WORD");
                bool enabled = ParseEnabledCell(row.GetValueOrDefault("사용(1/0)", ""));
                int? fid = int.TryParse(row.GetValueOrDefault("폴더ID", ""), out var pf) ? pf : folderId;

                var err = ValidateTagBasics(name, address, plcId);
                if (err == null && fid == null) err = "폴더ID가 없고 기본 폴더도 지정되지 않았습니다";
                if (err != null) { errors.Add($"{excelRow}행: {err}"); continue; }

                bool hasId = int.TryParse(row.GetValueOrDefault("ID", ""), out var id) && id > 0;
                try
                {
                    if (hasId)
                    {
                        using var cmd = new MySqlCommand(@"
UPDATE folders_tags SET folder_id=@fid, name=@name, address=@addr, plc_id=@plc, type=@type, enabled=@en WHERE id=@id", conn);
                        cmd.Parameters.AddWithValue("@fid", fid);
                        cmd.Parameters.AddWithValue("@name", name.Trim());
                        cmd.Parameters.AddWithValue("@addr", address.Trim());
                        cmd.Parameters.AddWithValue("@plc", plcId.Trim());
                        cmd.Parameters.AddWithValue("@type", string.IsNullOrWhiteSpace(type) ? "WORD" : type.Trim());
                        cmd.Parameters.AddWithValue("@en", enabled);
                        cmd.Parameters.AddWithValue("@id", id);
                        int n = await cmd.ExecuteNonQueryAsync();
                        if (n > 0) updated++; else errors.Add($"{excelRow}행: ID {id}인 태그를 찾을 수 없습니다");
                    }
                    else
                    {
                        using var cmd = new MySqlCommand(@"
INSERT INTO folders_tags(folder_id, name, address, plc_id, type, enabled) VALUES (@fid, @name, @addr, @plc, @type, @en)", conn);
                        cmd.Parameters.AddWithValue("@fid", fid);
                        cmd.Parameters.AddWithValue("@name", name.Trim());
                        cmd.Parameters.AddWithValue("@addr", address.Trim());
                        cmd.Parameters.AddWithValue("@plc", plcId.Trim());
                        cmd.Parameters.AddWithValue("@type", string.IsNullOrWhiteSpace(type) ? "WORD" : type.Trim());
                        cmd.Parameters.AddWithValue("@en", enabled);
                        await cmd.ExecuteNonQueryAsync();
                        inserted++;
                    }
                }
                catch (MySqlException ex) when (ex.Number == 1062) { errors.Add($"{excelRow}행: 같은 이름의 태그가 이미 있습니다"); }
                catch (Exception ex) { errors.Add($"{excelRow}행: {ex.Message}"); }
            }

            return Results.Ok(new { success = true, inserted, updated, errors });
        }).DisableAntiforgery(); // 이 관리 화면은 인증/세션이 아예 없는 내부망 전용 도구라 CSRF 토큰이 막을 대상이 없다.

        // POST /api/admin/foldertags  body: { folderId, name, address, plcId, type?, enabled? }
        app.MapPost("/api/admin/foldertags", async (FolderTagRequest req, PlcRepository repo) =>
        {
            var err = ValidateTagBasics(req.Name, req.Address, req.PlcId);
            if (err != null) return Results.Ok(new { success = false, error = err });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(@"
INSERT INTO folders_tags(folder_id, name, address, plc_id, type, enabled)
VALUES (@folderId, @name, @address, @plcId, @type, @enabled)", conn);
                cmd.Parameters.AddWithValue("@folderId", req.FolderId);
                cmd.Parameters.AddWithValue("@name", req.Name.Trim());
                cmd.Parameters.AddWithValue("@address", req.Address.Trim());
                cmd.Parameters.AddWithValue("@plcId", req.PlcId.Trim());
                cmd.Parameters.AddWithValue("@type", string.IsNullOrWhiteSpace(req.Type) ? "WORD" : req.Type.Trim());
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = true, id = (int)cmd.LastInsertedId });
            }
            catch (MySqlException ex) when (ex.Number == 1062)
            { return Results.Ok(new { success = false, error = "이 폴더에 같은 이름의 태그가 이미 있습니다" }); }
            catch (MySqlException ex) when (IsFkRestrict(ex))
            { return Results.Ok(new { success = false, error = "존재하지 않는 폴더입니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // PUT /api/admin/foldertags/{id}  body: { folderId, name, address, plcId, type?, enabled? }
        app.MapPut("/api/admin/foldertags/{id:int}", async (int id, FolderTagRequest req, PlcRepository repo) =>
        {
            var err = ValidateTagBasics(req.Name, req.Address, req.PlcId);
            if (err != null) return Results.Ok(new { success = false, error = err });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(@"
UPDATE folders_tags SET folder_id=@folderId, name=@name, address=@address, plc_id=@plcId, type=@type, enabled=@enabled
 WHERE id=@id", conn);
                cmd.Parameters.AddWithValue("@folderId", req.FolderId);
                cmd.Parameters.AddWithValue("@name", req.Name.Trim());
                cmd.Parameters.AddWithValue("@address", req.Address.Trim());
                cmd.Parameters.AddWithValue("@plcId", req.PlcId.Trim());
                cmd.Parameters.AddWithValue("@type", string.IsNullOrWhiteSpace(req.Type) ? "WORD" : req.Type.Trim());
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (MySqlException ex) when (ex.Number == 1062)
            { return Results.Ok(new { success = false, error = "이 폴더에 같은 이름의 태그가 이미 있습니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // DELETE /api/admin/foldertags/{id}
        app.MapDelete("/api/admin/foldertags/{id:int}", async (int id, PlcRepository repo) =>
        {
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand("DELETE FROM folders_tags WHERE id=@id", conn);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });
    }

    private sealed record FolderTagRow(int Id, int FolderId, string FolderName, string Name, string Address, string PlcId, string Type, bool Enabled);

    // folderId 생략 시 전체 폴더 통틀어 조회 — "전체" 화면과 엑셀 내보내기 둘 다 이 헬퍼를 공용으로 쓴다.
    private static async Task<List<FolderTagRow>> QueryFolderTags(PlcRepository repo, int? folderId)
    {
        var list = new List<FolderTagRow>();
        using var conn = new MySqlConnection(repo.ConnectionString);
        await conn.OpenAsync();
        string sql = @"
SELECT t.id, t.folder_id, f.name AS folder_name, t.name, t.address, t.plc_id, t.type, t.enabled
  FROM folders_tags t JOIN folders f ON t.folder_id = f.id";
        if (folderId.HasValue) sql += " WHERE t.folder_id=@fid";
        sql += " ORDER BY f.name, t.id";
        using var cmd = new MySqlCommand(sql, conn);
        if (folderId.HasValue) cmd.Parameters.AddWithValue("@fid", folderId.Value);
        using var rd = await cmd.ExecuteReaderAsync();
        while (await rd.ReadAsync())
            list.Add(new FolderTagRow(
                rd.GetInt32(0), rd.GetInt32(1), rd.GetString(2), rd.GetString(3),
                rd.IsDBNull(4) ? "" : rd.GetString(4), rd.IsDBNull(5) ? "" : rd.GetString(5),
                rd.IsDBNull(6) ? "" : rd.GetString(6), rd.GetBoolean(7)));
        return list;
    }

    // ================= 온도 태그 (tb_temp_tag) =================

    // col_name이 바뀔 때 tb_temp_snapshot의 실제 컬럼도 같이 맞춘다.
    // 예전 컬럼이 있고 새 이름 컬럼이 아직 없으면 진짜 컬럼 RENAME(CHANGE COLUMN)으로 과거 데이터를 그대로 이어간다.
    // 새 이름이 이미 다른 컬럼으로 존재하면(충돌) 덮어쓰지 않고 컬럼 존재만 보장한 뒤 경고 문구를 돌려준다.
    private static async Task<string?> EnsureTempSnapshotColumnRenamed(MySqlConnection conn, string? oldColName, string newColName)
    {
        if (string.IsNullOrEmpty(oldColName) || oldColName.Equals(newColName, StringComparison.OrdinalIgnoreCase))
        {
            using var ensure = new MySqlCommand("ALTER TABLE tb_temp_snapshot ADD COLUMN IF NOT EXISTS `" + newColName + "` DOUBLE", conn);
            await ensure.ExecuteNonQueryAsync();
            return null;
        }

        async Task<bool> ColumnExists(string name)
        {
            using var cmd = new MySqlCommand(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tb_temp_snapshot' AND column_name = @c", conn);
            cmd.Parameters.AddWithValue("@c", name);
            return Convert.ToInt64(await cmd.ExecuteScalarAsync()) > 0;
        }

        bool oldExists = await ColumnExists(oldColName);
        bool newExists = await ColumnExists(newColName);

        if (oldExists && !newExists)
        {
            using var rename = new MySqlCommand("ALTER TABLE tb_temp_snapshot CHANGE COLUMN `" + oldColName + "` `" + newColName + "` DOUBLE", conn);
            await rename.ExecuteNonQueryAsync();
            return null;
        }

        using (var ensure = new MySqlCommand("ALTER TABLE tb_temp_snapshot ADD COLUMN IF NOT EXISTS `" + newColName + "` DOUBLE", conn))
            await ensure.ExecuteNonQueryAsync();

        return oldExists && newExists
            ? $"컬럼 '{newColName}'이 이미 존재해 이전 컬럼('{oldColName}')의 과거 데이터를 자동으로 옮기지 못했습니다. 필요하면 DB에서 직접 병합하세요."
            : null;
    }

    private static void MapTempTagEndpoints(WebApplication app)
    {
        // GET /api/admin/temptags?equipId=BCF1 (선택) — equipId 생략 시 전체
        app.MapGet("/api/admin/temptags", async (string? equipId, PlcRepository repo) =>
        {
            try
            {
                var list = await QueryTempTags(repo, equipId);
                return Results.Ok(new { success = true, tags = list });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/temptags/export?equipId=BCF1 (선택)
        app.MapGet("/api/admin/temptags/export", async (string? equipId, PlcRepository repo) =>
        {
            var list = await QueryTempTags(repo, equipId);
            var rows = list.Select(t => new object?[] { t.TempId, t.TagName, t.Address, t.PlcId, t.ColName, t.TrendName, t.Scale, t.EquipId, t.Enabled ? 1 : 0 });
            var bytes = WriteXlsx("온도태그", new[] { "ID", "태그이름", "주소", "PLC ID", "컬럼명", "트렌드명", "스케일", "설비", "사용(1/0)" }, rows);
            return Results.File(bytes, XlsxContentType, $"temp_tags_{DateTime.Now:yyyyMMdd_HHmm}.xlsx");
        });

        // POST /api/admin/temptags/import — 엑셀 업로드로 일괄 등록/수정 (신규 행은 컬럼도 즉시 생성)
        app.MapPost("/api/admin/temptags/import", async (IFormFile file, PlcRepository repo) =>
        {
            List<Dictionary<string, string>> rows;
            try
            {
                using var stream = file.OpenReadStream();
                rows = ReadXlsxRows(stream);
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = "엑셀 파일을 읽을 수 없습니다: " + ex.Message }); }

            int inserted = 0, updated = 0;
            var errors = new List<string>();
            using var conn = new MySqlConnection(repo.ConnectionString);
            await conn.OpenAsync();

            for (int i = 0; i < rows.Count; i++)
            {
                var row = rows[i];
                int excelRow = i + 2;
                string tagName = row.GetValueOrDefault("태그이름", "");
                string address = row.GetValueOrDefault("주소", "");
                string plcId = row.GetValueOrDefault("PLC ID", "");
                string colName = row.GetValueOrDefault("컬럼명", "").Trim();
                string trendName = row.GetValueOrDefault("트렌드명", "");
                string scale = row.GetValueOrDefault("스케일", "");
                string equipId = row.GetValueOrDefault("설비", "");
                bool enabled = ParseEnabledCell(row.GetValueOrDefault("사용(1/0)", ""));

                var err = ValidateTagBasics(tagName, address, plcId);
                if (err == null && colName.Length == 0) err = "컬럼명이 없습니다";
                if (err == null && !SafeColumnName.IsMatch(colName)) err = "컬럼명은 영문/숫자/밑줄만 가능합니다";
                if (err != null) { errors.Add($"{excelRow}행: {err}"); continue; }
                if (string.IsNullOrWhiteSpace(trendName)) trendName = tagName;

                bool hasId = int.TryParse(row.GetValueOrDefault("ID", ""), out var id) && id > 0;
                try
                {
                    if (hasId)
                    {
                        string? oldColName = null;
                        using (var lookup = new MySqlCommand("SELECT col_name FROM tb_temp_tag WHERE temp_id=@id", conn))
                        {
                            lookup.Parameters.AddWithValue("@id", id);
                            var found = await lookup.ExecuteScalarAsync();
                            if (found != null && found != DBNull.Value) oldColName = (string)found;
                        }
                        string? renameWarning = await EnsureTempSnapshotColumnRenamed(conn, oldColName, colName);
                        if (renameWarning != null) errors.Add($"{excelRow}행: {renameWarning}");

                        using var cmd = new MySqlCommand(@"
UPDATE tb_temp_tag SET tag_name=@tn, address=@addr, plc_id=@plc, col_name=@col, trend_name=@trend,
       scale=@scale, equip_id=@equip, enabled=@en WHERE temp_id=@id", conn);
                        cmd.Parameters.AddWithValue("@tn", tagName.Trim());
                        cmd.Parameters.AddWithValue("@addr", address.Trim());
                        cmd.Parameters.AddWithValue("@plc", plcId.Trim());
                        cmd.Parameters.AddWithValue("@col", colName);
                        cmd.Parameters.AddWithValue("@trend", trendName.Trim());
                        cmd.Parameters.AddWithValue("@scale", string.IsNullOrWhiteSpace(scale) ? DBNull.Value : scale.Trim());
                        cmd.Parameters.AddWithValue("@equip", string.IsNullOrWhiteSpace(equipId) ? DBNull.Value : equipId.Trim());
                        cmd.Parameters.AddWithValue("@en", enabled);
                        cmd.Parameters.AddWithValue("@id", id);
                        int n = await cmd.ExecuteNonQueryAsync();
                        if (n > 0) updated++; else errors.Add($"{excelRow}행: ID {id}인 태그를 찾을 수 없습니다");
                    }
                    else
                    {
                        using (var alter = new MySqlCommand("ALTER TABLE tb_temp_snapshot ADD COLUMN IF NOT EXISTS `" + colName + "` DOUBLE", conn))
                            await alter.ExecuteNonQueryAsync();

                        using var cmd = new MySqlCommand(@"
INSERT INTO tb_temp_tag(tag_name, address, plc_id, col_name, trend_name, scale, equip_id, enabled)
VALUES (@tn, @addr, @plc, @col, @trend, @scale, @equip, @en)", conn);
                        cmd.Parameters.AddWithValue("@tn", tagName.Trim());
                        cmd.Parameters.AddWithValue("@addr", address.Trim());
                        cmd.Parameters.AddWithValue("@plc", plcId.Trim());
                        cmd.Parameters.AddWithValue("@col", colName);
                        cmd.Parameters.AddWithValue("@trend", trendName.Trim());
                        cmd.Parameters.AddWithValue("@scale", string.IsNullOrWhiteSpace(scale) ? DBNull.Value : scale.Trim());
                        cmd.Parameters.AddWithValue("@equip", string.IsNullOrWhiteSpace(equipId) ? DBNull.Value : equipId.Trim());
                        cmd.Parameters.AddWithValue("@en", enabled);
                        await cmd.ExecuteNonQueryAsync();
                        inserted++;
                    }
                }
                catch (Exception ex) { errors.Add($"{excelRow}행: {ex.Message}"); }
            }

            return Results.Ok(new { success = true, inserted, updated, errors });
        }).DisableAntiforgery(); // 이 관리 화면은 인증/세션이 아예 없는 내부망 전용 도구라 CSRF 토큰이 막을 대상이 없다.

        // GET /api/admin/temptags/equipids — 설비명 자동완성용 기존 값 목록
        app.MapGet("/api/admin/temptags/equipids", async (PlcRepository repo) =>
        {
            try
            {
                var list = new List<string>();
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(
                    "SELECT DISTINCT equip_id FROM tb_temp_tag WHERE equip_id IS NOT NULL AND equip_id <> '' ORDER BY equip_id", conn);
                using var rd = await cmd.ExecuteReaderAsync();
                while (await rd.ReadAsync()) list.Add(rd.GetString(0));
                return Results.Ok(new { success = true, equipIds = list });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/tempsnapshot/columns — tb_temp_snapshot에 실제로 존재하는 컬럼 확인용
        // (온도 태그 저장 → 이 컬럼 목록에 즉시 반영되는 걸 화면에서 눈으로 확인시켜주는 용도)
        app.MapGet("/api/admin/tempsnapshot/columns", async (PlcRepository repo) =>
        {
            try
            {
                var list = new List<string>();
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(@"
SELECT COLUMN_NAME FROM information_schema.columns
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_temp_snapshot'
   AND COLUMN_NAME NOT IN ('snapshot_id','record_time')
 ORDER BY ORDINAL_POSITION", conn);
                using var rd = await cmd.ExecuteReaderAsync();
                while (await rd.ReadAsync()) list.Add(rd.GetString(0));
                return Results.Ok(new { success = true, columns = list });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // POST /api/admin/temptags  body: { tagName, address, plcId, colName, trendName, scale?, equipId?, enabled? }
        //   저장과 동시에 tb_temp_snapshot에 col_name 컬럼을 즉시 만든다(원래 TempMonitorService가
        //   다음 30초 폴링에서 만들던 것을 화면에서 바로 확인 가능하도록 여기서도 선제적으로 실행).
        app.MapPost("/api/admin/temptags", async (TempTagRequest req, PlcRepository repo) =>
        {
            var err = ValidateTagBasics(req.TagName, req.Address, req.PlcId);
            if (err == null && string.IsNullOrWhiteSpace(req.ColName)) err = "컬럼 이름(colName)은 필수입니다";
            if (err == null && !SafeColumnName.IsMatch(req.ColName.Trim())) err = "컬럼 이름은 영문/숫자/밑줄(_)만 가능합니다";
            if (err == null && req.ColName.Trim().Equals("snapshot_id", StringComparison.OrdinalIgnoreCase)) err = "컬럼 이름으로 사용할 수 없는 예약어입니다";
            if (err == null && req.ColName.Trim().Equals("record_time", StringComparison.OrdinalIgnoreCase)) err = "컬럼 이름으로 사용할 수 없는 예약어입니다";
            if (err != null) return Results.Ok(new { success = false, error = err });

            string colName = req.ColName.Trim();
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();

                using (var alter = new MySqlCommand("ALTER TABLE tb_temp_snapshot ADD COLUMN IF NOT EXISTS `" + colName + "` DOUBLE", conn))
                    await alter.ExecuteNonQueryAsync();

                using var cmd = new MySqlCommand(@"
INSERT INTO tb_temp_tag(tag_name, address, plc_id, col_name, trend_name, scale, equip_id, enabled)
VALUES (@tagName, @address, @plcId, @colName, @trendName, @scale, @equipId, @enabled)", conn);
                cmd.Parameters.AddWithValue("@tagName", req.TagName.Trim());
                cmd.Parameters.AddWithValue("@address", req.Address.Trim());
                cmd.Parameters.AddWithValue("@plcId", req.PlcId.Trim());
                cmd.Parameters.AddWithValue("@colName", colName);
                cmd.Parameters.AddWithValue("@trendName", string.IsNullOrWhiteSpace(req.TrendName) ? req.TagName.Trim() : req.TrendName.Trim());
                cmd.Parameters.AddWithValue("@scale", (object?)req.Scale ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@equipId", (object?)req.EquipId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = true, id = (int)cmd.LastInsertedId, colName });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // PUT /api/admin/temptags/{id} — colName이 바뀌면 tb_temp_snapshot의 실제 컬럼도 CHANGE COLUMN으로
        //   같이 리네임해서 과거 데이터를 그대로 이어간다(새 이름이 이미 다른 컬럼과 충돌할 때만 예외적으로
        //   컬럼 생성만 보장하고 warning을 돌려준다 — EnsureTempSnapshotColumnRenamed 참고).
        app.MapPut("/api/admin/temptags/{id:int}", async (int id, TempTagRequest req, PlcRepository repo) =>
        {
            var err = ValidateTagBasics(req.TagName, req.Address, req.PlcId);
            if (err == null && string.IsNullOrWhiteSpace(req.ColName)) err = "컬럼 이름(colName)은 필수입니다";
            if (err == null && !SafeColumnName.IsMatch(req.ColName.Trim())) err = "컬럼 이름은 영문/숫자/밑줄(_)만 가능합니다";
            if (err != null) return Results.Ok(new { success = false, error = err });

            string colName = req.ColName.Trim();
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();

                string? oldColName = null;
                using (var lookup = new MySqlCommand("SELECT col_name FROM tb_temp_tag WHERE temp_id=@id", conn))
                {
                    lookup.Parameters.AddWithValue("@id", id);
                    var found = await lookup.ExecuteScalarAsync();
                    if (found != null && found != DBNull.Value) oldColName = (string)found;
                }
                string? renameWarning = await EnsureTempSnapshotColumnRenamed(conn, oldColName, colName);

                using var cmd = new MySqlCommand(@"
UPDATE tb_temp_tag SET tag_name=@tagName, address=@address, plc_id=@plcId, col_name=@colName,
       trend_name=@trendName, scale=@scale, equip_id=@equipId, enabled=@enabled
 WHERE temp_id=@id", conn);
                cmd.Parameters.AddWithValue("@tagName", req.TagName.Trim());
                cmd.Parameters.AddWithValue("@address", req.Address.Trim());
                cmd.Parameters.AddWithValue("@plcId", req.PlcId.Trim());
                cmd.Parameters.AddWithValue("@colName", colName);
                cmd.Parameters.AddWithValue("@trendName", string.IsNullOrWhiteSpace(req.TrendName) ? req.TagName.Trim() : req.TrendName.Trim());
                cmd.Parameters.AddWithValue("@scale", (object?)req.Scale ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@equipId", (object?)req.EquipId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0, colName, warning = renameWarning });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // DELETE /api/admin/temptags/{id} — 태그 정의만 삭제. tb_temp_snapshot 컬럼/과거 데이터는
        //   보존한다(과거 추세 데이터를 실수로 영구 삭제하는 사고를 방지하기 위한 의도적 설계).
        app.MapDelete("/api/admin/temptags/{id:int}", async (int id, PlcRepository repo) =>
        {
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand("DELETE FROM tb_temp_tag WHERE temp_id=@id", conn);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });
    }

    private sealed record TempTagRow(int TempId, string TagName, string Address, string PlcId, string ColName, string TrendName, string Scale, string EquipId, bool Enabled);

    private static async Task<List<TempTagRow>> QueryTempTags(PlcRepository repo, string? equipId)
    {
        var list = new List<TempTagRow>();
        using var conn = new MySqlConnection(repo.ConnectionString);
        await conn.OpenAsync();
        string sql = "SELECT temp_id, tag_name, address, plc_id, col_name, trend_name, scale, equip_id, enabled FROM tb_temp_tag";
        // equipId 인자로 설비명(BCF1 등)뿐 아니라 존 이름("1존" 등)이 실려 오는 경우가 실제로 확인됨
        // (AI 어시스턴트가 "1존 온도 몇 도야?"를 equipId="1존"으로 호출) — equip_id 정확 일치 외에
        // trend_name/tag_name 부분일치도 같이 봐서, 설비를 특정하지 않고 존 이름만 물어도 해당 존을
        // 가진 모든 설비를 찾을 수 있게 한다.
        if (!string.IsNullOrWhiteSpace(equipId)) sql += " WHERE (equip_id=@equipId OR trend_name LIKE @equipLike OR tag_name LIKE @equipLike)";
        sql += " ORDER BY temp_id";
        using var cmd = new MySqlCommand(sql, conn);
        if (!string.IsNullOrWhiteSpace(equipId))
        {
            cmd.Parameters.AddWithValue("@equipId", equipId);
            cmd.Parameters.AddWithValue("@equipLike", $"%{equipId}%");
        }
        using var rd = await cmd.ExecuteReaderAsync();
        while (await rd.ReadAsync())
            list.Add(new TempTagRow(
                rd.GetInt32(0), rd.GetString(1), rd.GetString(2), rd.GetString(3), rd.GetString(4),
                rd.GetString(5), rd.IsDBNull(6) ? "" : rd.GetString(6), rd.IsDBNull(7) ? "" : rd.GetString(7), rd.GetBoolean(8)));
        return list;
    }

    // ================= 알람 폴더 (tb_alarm_folder) =================
    private static void MapAlarmFolderEndpoints(WebApplication app)
    {
        app.MapGet("/api/admin/alarmfolders", async (PlcRepository repo) =>
        {
            try
            {
                var list = await QueryAlarmFolders(repo);
                return Results.Ok(new { success = true, folders = list });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        app.MapPost("/api/admin/alarmfolders", async (AlarmFolderRequest req, PlcRepository repo) =>
        {
            if (string.IsNullOrWhiteSpace(req.FolderName))
                return Results.Ok(new { success = false, error = "폴더 이름은 필수입니다" });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(
                    "INSERT INTO tb_alarm_folder(folder_name, parent_id, sort_order) VALUES (@name, @parentId, @sortOrder)", conn);
                cmd.Parameters.AddWithValue("@name", req.FolderName.Trim());
                cmd.Parameters.AddWithValue("@parentId", (object?)req.ParentId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@sortOrder", req.SortOrder ?? 0);
                await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = true, folderId = (int)cmd.LastInsertedId });
            }
            catch (MySqlException ex) when (IsFkRestrict(ex))
            { return Results.Ok(new { success = false, error = "존재하지 않는 상위 폴더입니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        app.MapPut("/api/admin/alarmfolders/{id:int}", async (int id, AlarmFolderRequest req, PlcRepository repo) =>
        {
            if (string.IsNullOrWhiteSpace(req.FolderName))
                return Results.Ok(new { success = false, error = "폴더 이름은 필수입니다" });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(
                    "UPDATE tb_alarm_folder SET folder_name=@name, parent_id=@parentId, sort_order=@sortOrder WHERE folder_id=@id", conn);
                cmd.Parameters.AddWithValue("@name", req.FolderName.Trim());
                cmd.Parameters.AddWithValue("@parentId", (object?)req.ParentId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@sortOrder", req.SortOrder ?? 0);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (MySqlException ex) when (IsFkRestrict(ex))
            { return Results.Ok(new { success = false, error = "존재하지 않는 상위 폴더입니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // 주의: tb_alarm_tag.folder_id와 tb_alarm_folder.parent_id 둘 다 FK가 ON DELETE CASCADE라
        // folders와 마찬가지로 이 폴더 삭제는 안의 알람 태그/하위 폴더까지 조용히 함께 지운다.
        app.MapDelete("/api/admin/alarmfolders/{id:int}", async (int id, PlcRepository repo) =>
        {
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand("DELETE FROM tb_alarm_folder WHERE folder_id=@id", conn);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });
    }

    private sealed record AlarmFolderRow(int FolderId, string FolderName, int? ParentId, int SortOrder);

    private static async Task<List<AlarmFolderRow>> QueryAlarmFolders(PlcRepository repo)
    {
        var list = new List<AlarmFolderRow>();
        using var conn = new MySqlConnection(repo.ConnectionString);
        await conn.OpenAsync();
        using var cmd = new MySqlCommand("SELECT folder_id, folder_name, parent_id, sort_order FROM tb_alarm_folder ORDER BY sort_order, folder_id", conn);
        using var rd = await cmd.ExecuteReaderAsync();
        while (await rd.ReadAsync())
        {
            int fid = rd.GetInt32(0);
            int? parentId = rd.IsDBNull(2) ? null : rd.GetInt32(2);
            // 기존 데이터에 folder_id와 parent_id가 같은(자기참조) 행이 있다 — 최상위를
            // NULL 대신 자기 자신으로 표시해둔 것으로 보고, 화면에서는 "최상위"로 취급한다.
            if (parentId == fid) parentId = null;
            list.Add(new AlarmFolderRow(fid, rd.GetString(1), parentId, rd.GetInt32(3)));
        }
        return list;
    }

    // ================= 알람 태그 (tb_alarm_tag) =================
    private static void MapAlarmTagEndpoints(WebApplication app)
    {
        // GET /api/admin/alarmtags/write/by-name?name=ALARM_102&value=0
        //   Program.cs의 /api/foldertag/write/by-name과 동일한 패턴이지만 tb_alarm_tag 대상.
        //   AI 어시스턴트가 "이 알람 꺼줘/0으로 만들어줘"를 write_folder_tag로 잘못 시도해 "태그를
        //   찾을 수 없음"으로 실패하는 문제가 실제로 확인돼서(ALARM_102는 folders_tags가 아니라
        //   tb_alarm_tag에만 있음) 알람 전용 쓰기 경로를 별도로 둔다. 이름으로 주소/PLC를 찾은 뒤
        //   실제 쓰기는 폴더 태그와 동일한 WriteBitAsync/WriteWordAsync(read-back 검증 포함)를 쓴다.
        app.MapGet("/api/admin/alarmtags/write/by-name", async (string name, int value, int? folderId, string? equipId, PlcRepository repo, PlcServiceCache cache, LiveTagMonitorService monitor) =>
        {
            var found = await QueryAlarmTags(repo, folderId, name, equipId);
            if (found.Count == 0)
                return Results.Ok(new { success = false, error = $"알람 태그를 찾을 수 없음: name='{name}'" });
            if (found.Count > 1)
                return Results.Ok(new
                {
                    success = false,
                    error = $"'{name}'에 해당하는 알람이 {found.Count}개 설비에 걸쳐 있어 특정할 수 없음 — 어느 설비인지 equipId로 같이 지정하세요.",
                    candidates = found.Select(t => new { t.TagId, equipId = t.FolderName, t.Address, t.PlcId })
                });

            var tag = found[0];
            var cfg = await repo.GetByIdAsync(tag.PlcId);
            if (cfg == null) return Results.Ok(new { success = false, error = $"tb_plc에 '{tag.PlcId}'가 없음" });

            var parsed = LiveTagMonitorService.ParseAddressFull(tag.Address);
            if (parsed == null) return Results.Ok(new { success = false, error = $"주소 형식을 해석할 수 없음: '{tag.Address}'" });

            try
            {
                var svc = cache.GetOrCreate(cfg);
                bool isBit = "MLXYBS".Contains(parsed.Value.Device, StringComparison.OrdinalIgnoreCase);
                monitor.AlarmTagValues.TryGetValue(tag.TagId, out var wasOn);

                if (isBit) await svc.WriteBitAsync(parsed.Value.Addr, value != 0, parsed.Value.Device);
                else await svc.WriteWordAsync(parsed.Value.Addr, value, parsed.Value.Device);

                await TagWriteLog.LogAsync(repo.ConnectionString, "ALARM", tag.TagId, name, tag.Address, tag.PlcId, wasOn ? 1 : 0, value);
                return Results.Ok(new { success = true, name, plcId = tag.PlcId, address = tag.Address, type = isBit ? "BIT" : "WORD", value, wasOn });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // folderId 생략 시 전체 알람 폴더 통틀어 전부
        app.MapGet("/api/admin/alarmtags", async (int? folderId, PlcRepository repo) =>
        {
            try
            {
                var list = await QueryAlarmTags(repo, folderId);
                return Results.Ok(new { success = true, tags = list });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // GET /api/admin/alarmtags/export?folderId=42 (생략 시 전체)
        app.MapGet("/api/admin/alarmtags/export", async (int? folderId, PlcRepository repo) =>
        {
            var list = await QueryAlarmTags(repo, folderId);
            var rows = list.Select(t => new object?[] { t.TagId, t.FolderId, t.FolderName, t.TagName, t.Address, t.PlcId, t.AlarmMsg, t.Level, t.Enabled ? 1 : 0 });
            var bytes = WriteXlsx("알람태그", new[] { "ID", "폴더ID", "폴더명(참고용,수정무시)", "태그이름", "주소", "PLC ID", "알람메시지", "레벨", "사용(1/0)" }, rows);
            return Results.File(bytes, XlsxContentType, $"alarm_tags_{DateTime.Now:yyyyMMdd_HHmm}.xlsx");
        });

        // POST /api/admin/alarmtags/import?folderId=42 — 엑셀 업로드로 일괄 등록/수정
        app.MapPost("/api/admin/alarmtags/import", async (IFormFile file, int? folderId, PlcRepository repo) =>
        {
            List<Dictionary<string, string>> rows;
            try
            {
                using var stream = file.OpenReadStream();
                rows = ReadXlsxRows(stream);
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = "엑셀 파일을 읽을 수 없습니다: " + ex.Message }); }

            int inserted = 0, updated = 0;
            var errors = new List<string>();
            using var conn = new MySqlConnection(repo.ConnectionString);
            await conn.OpenAsync();

            for (int i = 0; i < rows.Count; i++)
            {
                var row = rows[i];
                int excelRow = i + 2;
                string tagName = row.GetValueOrDefault("태그이름", "");
                string address = row.GetValueOrDefault("주소", "");
                string plcId = row.GetValueOrDefault("PLC ID", "");
                string alarmMsg = row.GetValueOrDefault("알람메시지", "");
                bool enabled = ParseEnabledCell(row.GetValueOrDefault("사용(1/0)", ""));
                byte level = byte.TryParse(row.GetValueOrDefault("레벨", ""), out var lv) ? lv : (byte)1;
                int? fid = int.TryParse(row.GetValueOrDefault("폴더ID", ""), out var pf) ? pf : folderId;

                var err = ValidateTagBasics(tagName, address, plcId);
                if (err == null && string.IsNullOrWhiteSpace(alarmMsg)) err = "알람 메시지가 없습니다";
                if (err == null && fid == null) err = "폴더ID가 없고 기본 폴더도 지정되지 않았습니다";
                if (err != null) { errors.Add($"{excelRow}행: {err}"); continue; }

                bool hasId = int.TryParse(row.GetValueOrDefault("ID", ""), out var id) && id > 0;
                try
                {
                    if (hasId)
                    {
                        using var cmd = new MySqlCommand(@"
UPDATE tb_alarm_tag SET folder_id=@fid, tag_name=@tn, address=@addr, plc_id=@plc, alarm_msg=@msg, level=@lv, enabled=@en
 WHERE tag_id=@id", conn);
                        cmd.Parameters.AddWithValue("@fid", fid);
                        cmd.Parameters.AddWithValue("@tn", tagName.Trim());
                        cmd.Parameters.AddWithValue("@addr", address.Trim());
                        cmd.Parameters.AddWithValue("@plc", plcId.Trim());
                        cmd.Parameters.AddWithValue("@msg", alarmMsg.Trim());
                        cmd.Parameters.AddWithValue("@lv", level);
                        cmd.Parameters.AddWithValue("@en", enabled);
                        cmd.Parameters.AddWithValue("@id", id);
                        int n = await cmd.ExecuteNonQueryAsync();
                        if (n > 0) updated++; else errors.Add($"{excelRow}행: ID {id}인 태그를 찾을 수 없습니다");
                    }
                    else
                    {
                        using var cmd = new MySqlCommand(@"
INSERT INTO tb_alarm_tag(folder_id, tag_name, address, plc_id, alarm_msg, level, enabled)
VALUES (@fid, @tn, @addr, @plc, @msg, @lv, @en)", conn);
                        cmd.Parameters.AddWithValue("@fid", fid);
                        cmd.Parameters.AddWithValue("@tn", tagName.Trim());
                        cmd.Parameters.AddWithValue("@addr", address.Trim());
                        cmd.Parameters.AddWithValue("@plc", plcId.Trim());
                        cmd.Parameters.AddWithValue("@msg", alarmMsg.Trim());
                        cmd.Parameters.AddWithValue("@lv", level);
                        cmd.Parameters.AddWithValue("@en", enabled);
                        await cmd.ExecuteNonQueryAsync();
                        inserted++;
                    }
                }
                catch (MySqlException ex) when (IsFkRestrict(ex)) { errors.Add($"{excelRow}행: 존재하지 않는 폴더 또는 PLC입니다"); }
                catch (Exception ex) { errors.Add($"{excelRow}행: {ex.Message}"); }
            }

            return Results.Ok(new { success = true, inserted, updated, errors });
        }).DisableAntiforgery(); // 이 관리 화면은 인증/세션이 아예 없는 내부망 전용 도구라 CSRF 토큰이 막을 대상이 없다.

        // POST /api/admin/alarmtags  body: { folderId, tagName, address, plcId, alarmMsg, level?, enabled? }
        app.MapPost("/api/admin/alarmtags", async (AlarmTagRequest req, PlcRepository repo) =>
        {
            var err = ValidateTagBasics(req.TagName, req.Address, req.PlcId);
            if (err == null && string.IsNullOrWhiteSpace(req.AlarmMsg)) err = "알람 메시지는 필수입니다";
            if (err != null) return Results.Ok(new { success = false, error = err });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(@"
INSERT INTO tb_alarm_tag(folder_id, tag_name, address, plc_id, alarm_msg, level, enabled)
VALUES (@folderId, @tagName, @address, @plcId, @alarmMsg, @level, @enabled)", conn);
                cmd.Parameters.AddWithValue("@folderId", req.FolderId);
                cmd.Parameters.AddWithValue("@tagName", req.TagName.Trim());
                cmd.Parameters.AddWithValue("@address", req.Address.Trim());
                cmd.Parameters.AddWithValue("@plcId", req.PlcId.Trim());
                cmd.Parameters.AddWithValue("@alarmMsg", req.AlarmMsg.Trim());
                cmd.Parameters.AddWithValue("@level", req.Level ?? 1);
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = true, tagId = (int)cmd.LastInsertedId });
            }
            catch (MySqlException ex) when (IsFkRestrict(ex))
            { return Results.Ok(new { success = false, error = "존재하지 않는 폴더 또는 PLC입니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        // PUT /api/admin/alarmtags/{id}
        app.MapPut("/api/admin/alarmtags/{id:int}", async (int id, AlarmTagRequest req, PlcRepository repo) =>
        {
            var err = ValidateTagBasics(req.TagName, req.Address, req.PlcId);
            if (err == null && string.IsNullOrWhiteSpace(req.AlarmMsg)) err = "알람 메시지는 필수입니다";
            if (err != null) return Results.Ok(new { success = false, error = err });
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(@"
UPDATE tb_alarm_tag SET folder_id=@folderId, tag_name=@tagName, address=@address, plc_id=@plcId,
       alarm_msg=@alarmMsg, level=@level, enabled=@enabled
 WHERE tag_id=@id", conn);
                cmd.Parameters.AddWithValue("@folderId", req.FolderId);
                cmd.Parameters.AddWithValue("@tagName", req.TagName.Trim());
                cmd.Parameters.AddWithValue("@address", req.Address.Trim());
                cmd.Parameters.AddWithValue("@plcId", req.PlcId.Trim());
                cmd.Parameters.AddWithValue("@alarmMsg", req.AlarmMsg.Trim());
                cmd.Parameters.AddWithValue("@level", req.Level ?? 1);
                cmd.Parameters.AddWithValue("@enabled", req.Enabled ?? true);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (MySqlException ex) when (IsFkRestrict(ex))
            { return Results.Ok(new { success = false, error = "존재하지 않는 폴더 또는 PLC입니다" }); }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });

        app.MapDelete("/api/admin/alarmtags/{id:int}", async (int id, PlcRepository repo) =>
        {
            try
            {
                using var conn = new MySqlConnection(repo.ConnectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand("DELETE FROM tb_alarm_tag WHERE tag_id=@id", conn);
                cmd.Parameters.AddWithValue("@id", id);
                int n = await cmd.ExecuteNonQueryAsync();
                return Results.Ok(new { success = n > 0 });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });
    }

    private sealed record AlarmTagRow(int TagId, int FolderId, string FolderName, string TagName, string Address, string PlcId, string AlarmMsg, byte Level, bool Enabled);

    // name을 지정하면 정확히 일치하는 태그만 DB에서 걸러서 반환한다 — 알람 태그가 (실사용 환경에서
    // 238개처럼) 많을 때, 목록 전체를 가져와 앞부분만 잘라 보여주는 방식(TrimForLlm)으로는 뒤쪽에
    // 있는 태그를 "없는 것"으로 오판할 수 있어(AI 어시스턴트에서 실제로 확인됨), 이름 하나만 정확히
    // 찾을 땐 이 필터로 애초에 결과를 1건으로 좁힌다.
    // name은 태그 이름(ALARM_102)뿐 아니라 알람 메시지(alarm_msg, 예: "본실 온도 과열")로도 매칭한다 —
    // 현장 작업자는 태그 이름이 아니라 알람 문구로 물어보는 게 자연스럽기 때문. 같은 문구가 여러
    // 설비(폴더)에 걸쳐 등록돼 있을 수 있어(예: "본실 온도 과열"이 BCF1~BCF5에 모두 있음) equipId로
    // 설비명(BCF1 등, tb_alarm_folder.folder_name) 기준으로도 좁힐 수 있게 한다.
    private static async Task<List<AlarmTagRow>> QueryAlarmTags(PlcRepository repo, int? folderId, string? name = null, string? equipId = null)
    {
        var list = new List<AlarmTagRow>();
        using var conn = new MySqlConnection(repo.ConnectionString);
        await conn.OpenAsync();
        string sql = @"
SELECT t.tag_id, t.folder_id, f.folder_name, t.tag_name, t.address, t.plc_id, t.alarm_msg, t.level, t.enabled
  FROM tb_alarm_tag t JOIN tb_alarm_folder f ON t.folder_id = f.folder_id";
        var conditions = new List<string>();
        if (folderId.HasValue) conditions.Add("t.folder_id=@fid");
        if (!string.IsNullOrWhiteSpace(equipId)) conditions.Add("f.folder_name=@equip");
        // 양방향 부분일치: "온도 과열"처럼 문구 일부만 줘도(alarm_msg가 name을 포함) 찾고, 반대로
        // "예열 온도이상 알람"처럼 실제 alarm_msg 뒤에 "알람/태그" 같은 군더더기가 붙어도(name이
        // alarm_msg를 포함) 찾는다 — AI 어시스턴트가 사용자 말투를 그대로 넘기다 보니 실제로 후자
        // 패턴이 자주 나와서(예: alarm_msg="예열 온도이상"인데 name="예열 온도이상 알람") 한쪽만
        // 검사하면 정확히 존재하는 알람도 못 찾는 게 확인됨.
        if (!string.IsNullOrWhiteSpace(name)) conditions.Add("(t.tag_name=@name OR t.alarm_msg LIKE @nameLike OR INSTR(@name, t.alarm_msg) > 0)");
        if (conditions.Count > 0) sql += " WHERE " + string.Join(" AND ", conditions);
        sql += " ORDER BY f.sort_order, t.tag_id";
        using var cmd = new MySqlCommand(sql, conn);
        if (folderId.HasValue) cmd.Parameters.AddWithValue("@fid", folderId.Value);
        if (!string.IsNullOrWhiteSpace(equipId)) cmd.Parameters.AddWithValue("@equip", equipId);
        if (!string.IsNullOrWhiteSpace(name))
        {
            cmd.Parameters.AddWithValue("@name", name);
            cmd.Parameters.AddWithValue("@nameLike", $"%{name}%");
        }
        using var rd = await cmd.ExecuteReaderAsync();
        while (await rd.ReadAsync())
            list.Add(new AlarmTagRow(
                rd.GetInt32(0), rd.GetInt32(1), rd.GetString(2), rd.GetString(3), rd.GetString(4),
                rd.IsDBNull(5) ? "" : rd.GetString(5), rd.GetString(6), rd.GetByte(7), rd.GetBoolean(8)));
        return list;
    }

    // 이름/주소/PLC ID처럼 세 태그 종류가 공통으로 갖는 필수값을 한 곳에서 검사.
    private static string? ValidateTagBasics(string? name, string? address, string? plcId)
    {
        if (string.IsNullOrWhiteSpace(name)) return "태그 이름은 필수입니다";
        if (string.IsNullOrWhiteSpace(address)) return "주소는 필수입니다";
        if (string.IsNullOrWhiteSpace(plcId)) return "PLC 선택은 필수입니다";
        return null;
    }
}

// ── 요청 바디 DTO들 (System.Text.Json 기본 바인딩은 대소문자 구분 안 함 → 프론트는 camelCase로 보내면 됨) ──
public record PlcAdminRequest(string PlcId, string Ip, int Port, string PlcType, string Label, bool? Enabled);
public record FolderRequest(string Name, int? ParentId);
public record FolderTagRequest(int FolderId, string Name, string Address, string PlcId, string? Type, bool? Enabled);
public record TempTagRequest(string TagName, string Address, string PlcId, string ColName, string? TrendName, string? Scale, string? EquipId, bool? Enabled);
public record AlarmFolderRequest(string FolderName, int? ParentId, int? SortOrder);
public record AlarmTagRequest(int FolderId, string TagName, string Address, string PlcId, string AlarmMsg, byte? Level, bool? Enabled);
public record StringTagRequest(int FolderId, string TagName, string Address, string PlcId, int WordCount, string ByteOrder, bool? Enabled);
public record DoubleWordTagRequest(int FolderId, string Name, string Address, string PlcId, int WordCount, string WordOrder, bool Signed, bool? Enabled);
