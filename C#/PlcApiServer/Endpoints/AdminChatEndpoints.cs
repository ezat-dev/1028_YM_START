// ============================================================================
// AdminChatEndpoints.cs
// ============================================================================
// [파일 역할]
//   "PLC 태그 관리" 화면의 채팅 영역 전용 API. 사용자가 자연어로 "PLC 목록 보여줘",
//   "온도 태그 알려줘", "TEST 태그에 100 써줘" 같은 요청을 하면, 로컬 Ollama(A.X 4.0 Light, appsettings의 Ollama:Model —
//   ai-diagnosis 기능에 이미 붙여둔 그 로컬 LLM)의 tool-calling 기능으로 어떤 동작인지 해석한
//   뒤, 실제로는 이 서버 자신의 기존 API(/api/admin/plcs, /api/foldertag/write/by-name 등)를
//   내부 루프백 HTTP 호출로 그대로 재사용해서 처리한다 — DB/폴링 로직을 새로 만들지 않고
//   이미 검증된 기존 엔드포인트에 얹는 얇은 오케스트레이션 계층이다.
//
//   안전장치: 실제 설비/DB에 변화를 주는 "쓰기" 도구(태그 값 쓰기, 온도 태그 신규 등록)는
//   모델이 호출하기로 결정해도 여기서 즉시 실행하지 않는다. "이 동작을 실행할까요?"라는 확인
//   대기 상태(pendingConfirm)만 클라이언트에 돌려주고, 사용자가 화면에서 실행 버튼을 눌러
//   confirm:true로 다시 요청해야만 실제로 수행한다. 조회(읽기) 도구는 설비에 영향이 없으므로
//   바로 실행하고 결과를 모델에게 다시 넘겨 자연어로 요약하게 한다.
//
//   대화 상태는 서버에 저장하지 않는다(무상태) — 매 요청마다 지금까지의 전체 messages 배열을
//   클라이언트가 그대로 실어 보내고, 서버는 그걸 이어 붙여 되돌려줄 뿐이다.
// ============================================================================

using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using PlcApiServer.Services;

namespace PlcApiServer.Endpoints;

public static class AdminChatEndpoints
{
    private const string OllamaChatUrl = "http://localhost:11434/api/chat";
    // appsettings.json의 Ollama:Model로 바꿀 수 있다(코드 수정 없이 모델 비교/교체용). 기본값은
    // SKT A.X 4.0 Light(Qwen2.5 기반 한국어 특화 7B, Q8_0) — `ollama create ax4-light`로 등록한 이름.
    private static string ChatModel = "ax4-light";
    internal const string OllamaKeepAlive = "60m";
    private const string SelfBaseUrl = "http://localhost:5050";
    private const int MaxToolIterations = 6;

    // 실제 설비/DB에 변화를 주는 도구 이름 — 이 목록에 있으면 confirm:true 없이는 절대 실행하지 않는다.
    // PLC/폴더/알람 CRUD 전체를 도구로 열었더니(28개) 3B 모델이 완전히 무관한 삭제를 제안하는 등
    // 안정성이 크게 떨어지는 게 확인돼(get_docs만 물어봤는데 delete_folder_tag를 시도) 다시 핵심
    // 범위(조회 + 값쓰기 + 온도 태그 추가)로 축소했다 — 7b로 모델을 키워도 같은 문제가 반복돼
    // 근본 원인이 "도구 개수"라고 결론 내림.
    private static readonly HashSet<string> WriteTools = new() { "write_folder_tag", "write_alarm_tag", "write_plc_address", "add_temp_tag" };

    // 이름 하나를 정확히 찾는 조회인지 판단 — 결과 구조가 고정적이라 서버에서 바로 한국어로 조립해
    // 확정 답변한다(아래 TryBuildDeterministicReply 참고, 도입 이유는 그 근처 주석에 상세히 적음).
    // list_alarm_tags는 원래 "전체 목록 훑어보기"용이지만, get_alarm_tag_status와 완전히 같은 엔드포인트
    // (/api/admin/monitor/alarmtags)를 쓰기 때문에 모델이 get_alarm_tag_status 대신 이걸 골라도(실제로
    // 자주 그럼) name 인자가 실려 있으면 결과는 똑같이 정확하다 — 그래서 도구 이름이 아니라 "name으로
    // 좁혀서 호출됐는가"로 판단한다.
    private static bool IsPreciseLookupCall(string toolName, JsonElement args) =>
        toolName == "get_alarm_tag_status" || toolName == "get_folder_tag_value" ||
        toolName == "list_active_alarms" || toolName == "list_temp_tags" || toolName == "list_equip_ids" ||
        (toolName == "list_alarm_tags" && !string.IsNullOrWhiteSpace(GetStringArg(args, "name")));

    // JsonNode.ToJsonString() 기본 인코더는 한글 등을 \uXXXX로 이스케이프한다 — 도구 결과를 모델에게
    // 다시 넘길 때(TrimForLlm/EnrichPlcNotFoundError) 이 상태로 주면 작은 모델이 이스케이프를 못 풀고
    // 엉뚱하게 베껴 써서 답변이 깨지는 게 실제로 확인됐다(예: 알람 메시지). Program.cs의 전역 HTTP
    // JSON 설정과 같은 이유로 여기서도 완화된 인코더를 명시적으로 써야 한다(전역 설정은 Minimal API
    // 자동 직렬화에만 적용되고, JsonNode.ToJsonString()의 수동 재직렬화에는 안 먹는다).
    private static readonly JsonSerializerOptions RelaxedJsonOptions = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private const string SystemPrompt =
        "당신은 이 화면(PLC 태그 관리, PlcApiServer)의 어시스턴트입니다. 답변은 항상 한국어로 간결하게.\n" +
        "\n" +
        "답변 상대는 개발자가 아니라 현장 작업자/관리자입니다. 최종 답변에는 테이블명(tb_alarm_tag 등), " +
        "폴더 ID 같은 내부 번호, 도구/API 이름, 컬럼명 같은 개발 용어를 절대 쓰지 마세요 — 알람 문구, " +
        "설비명(BCF1 등), 존 이름(1존 등), 켜짐/꺼짐/몇 도처럼 사람이 바로 이해할 수 있는 말로만 " +
        "답하세요. 내부 조회에 필요한 값(태그 이름, 도구 이름 등)은 도구 호출에서만 쓰고 사용자에게 " +
        "보여주는 문장에는 노출하지 마세요.\n" +
        "\n" +
        "이 시스템 자체에 대한 질문(테이블 구조, API 사용법, 폴링/쓰기 동작 방식 등)을 받으면 절대 스스로 " +
        "기억하거나 지어내지 말고, 반드시 get_docs 도구를 호출해서 정확한 문서를 가져온 뒤 그 내용을 바탕으로 " +
        "답하세요. (이런 개발자용 질문은 사용자가 직접 시스템 구조를 물었을 때만 예외적으로 도구/테이블 " +
        "용어를 써서 답해도 됩니다.)\n" +
        "\n" +
        "실제 조회/조작이 필요한 요청은 도구(tools)를 사용하세요.\n" +
        "중요한 구분 1: '이미 있는 태그에 값을 쓰다/써줘/변경해줘'는 write_folder_tag이고, " +
        "'새 태그를 추가/등록/만들어줘'는 add_temp_tag입니다 — 절대 혼동하지 마세요. " +
        "태그에 값을 쓰라는 요청에 add_temp_tag를 쓰면 안 됩니다.\n" +
        "중요한 구분 1-1: 태그가 3가지 테이블 중 어디 있는지에 따라 쓰기 도구가 다릅니다 — " +
        "모니터링(폴더) 태그(list_folder_tags/get_folder_tag_value로 조회되는 것)는 write_folder_tag, " +
        "알람 태그(list_alarm_tags/get_alarm_tag_status/list_active_alarms로 조회되는 것, 이름이 " +
        "ALARM_ 등으로 시작하는 경우가 많음)는 write_alarm_tag를 쓰세요 — 알람 태그는 folders_tags가 " +
        "아니라 tb_alarm_tag에 등록돼 있어서 write_folder_tag로는 절대 못 찾습니다. 온도 태그(tb_temp_tag, " +
        "list_temp_tags로 조회되는 것)는 센서 값을 읽기만 하는 용도라 값을 쓰는 도구 자체가 없습니다 — " +
        "온도 태그에 값을 쓰라고 하면 지원하지 않는다고 답하세요. 어느 테이블인지 애매하면 먼저 " +
        "get_folder_tag_value/get_alarm_tag_status로 조회해보고 어느 쪽에서 찾아지는지 확인한 뒤 그에 " +
        "맞는 쓰기 도구를 쓰세요.\n" +
        "알람 관련 도구(get_alarm_tag_status/write_alarm_tag)는 사용자가 부르는 이름을 그대로 name에 " +
        "넣으면 됩니다 — 태그 코드(ALARM_102)든 실제 알람 문구(예: '본실 온도 과열', '비상정지')든 다 " +
        "찾아집니다. 현장 사용자는 코드가 아니라 문구나 증상으로 말하는 경우가 대부분이니 코드로 바꿔 " +
        "부르려 하지 말고 사용자 말 그대로 넘기세요. 같은 문구가 여러 설비에 걸쳐 있어 결과가 여러 건이면 " +
        "절대 아무거나 골라 진행하지 말고 '어느 설비(BCF1, BCF2 등) 말씀이신가요?'라고 되물은 뒤 " +
        "equipId로 좁혀서 다시 조회/실행하세요. 폴더 ID 같은 내부 번호는 사용자에게 절대 언급하지 " +
        "마세요 — 설비명(BCF1 등)으로만 대화하세요.\n" +
        "중요한 구분 2: 사용자가 'D100', 'M10'처럼 PLC 번지(디바이스 문자+숫자) 그 자체만 딱 말하며 읽거나 " +
        "쓰라고 하면(등록된 태그 이름이 아니라 번지 자체) read_plc_address/write_plc_address를 쓰세요. " +
        "하지만 'name_D101'처럼 번지 앞뒤에 다른 글자가 붙어있거나 '~태그'라는 말이 같이 나오면, 번지처럼 " +
        "보여도 그건 등록된 태그의 이름이지 번지 자체가 아닙니다 — 이때는 절대 read_plc_address/" +
        "write_plc_address를 쓰지 말고 구분 3(get_folder_tag_value 등)을 쓰세요. 예: 'name_D101 태그 값 " +
        "알려줘'는 이름이 'name_D101'인 태그를 get_folder_tag_value로 조회해야지, 'D101'만 잘라내서 " +
        "read_plc_address/write_plc_address에 넣으면 안 됩니다.\n" +
        "중요한 구분 3: 사용자가 태그 이름 하나를 콕 집어 '값 알려줘/얼마야'라고 물으면 list_folder_tags가 " +
        "아니라 get_folder_tag_value를, 알람 하나(태그 코드든 '본실 온도 과열' 같은 알람 문구든)를 콕 " +
        "집어 '켜져있어?/꺼져있어?/상태 어때?'라고 물으면 list_alarm_tags가 아니라 반드시 " +
        "get_alarm_tag_status를 쓰세요(예: '본실 온도 과열 알람 켜져있어?' → get_alarm_tag_status(name=" +
        "'본실 온도 과열'), 'ALARM_102 상태 알려줘' → get_alarm_tag_status(name='ALARM_102')). 특정 " +
        "이름/문구 없이 '지금 켜져있는 알람 있어?/문제 있어?'처럼 전체 중에 켜진 게 있는지 물으면 " +
        "list_active_alarms를 쓰세요 — " +
        "list_folder_tags/list_alarm_tags는 앞부분만 보여줘서 태그가 많으면(폴더 하나에 수천 개, 알람 " +
        "수백 개) 뒤쪽에 있는 태그·켜진 알람을 놓치고 '없다'고 잘못 답하게 됩니다. list_folder_tags/" +
        "list_alarm_tags는 전체를 죽 훑어볼 때만 쓰세요. 태그 개수만 궁금하면(예: '전체 몇 개야?') " +
        "list_folder_tags 대신 count_folder_tags를 쓰세요 — 태그 데이터까지 같이 받으면 개수 답을 " +
        "못 만드는 경우가 있습니다.\n" +
        "중요한 구분 4: 사용자가 어떤 번지(D101 등)를 대며 '읽어줘/값 알려줘'라고 하면 실제 PLC와 통신하는 " +
        "read_plc_address를 쓰지만, '이 번지로 등록된 태그 있어?/뭐가 등록돼있어?'처럼 등록 여부를 물으면 " +
        "find_folder_tag_by_address를 쓰세요 — 이건 DB 정의만 조회하고 PLC와 통신하지 않습니다.\n" +
        "중요한 구분 5: '1존 온도 몇 도야?', 'BCF1 온도 태그 알려줘', '설비 온도 알려줘'처럼 온도(존/설비 " +
        "이름)를 물으면 항상 list_temp_tags를 쓰세요(설비명이 언급되면 equipId로 좁히기) — 번지(D101 등)를 " +
        "직접 대지 않는 한 read_plc_address를 쓰면 안 됩니다. list_temp_tags 결과 하나만 받으면 그걸로 " +
        "바로 답하고, list_plcs 같은 무관한 도구를 추가로 부르지 마세요.\n" +
        "중요한 구분 6: '설비'(BCF1처럼 온도/알람이 딸린 실제 라인·장비)와 'PLC'(그 설비들을 통신으로 " +
        "제어하는 컨트롤러, IP/포트를 가짐)는 서로 다른 개념입니다 — PLC 1대가 설비 여러 개를 담당할 수 " +
        "있습니다. 사용자가 '등록된 설비 목록/설비 몇 개야?'처럼 설비를 물으면 list_equip_ids를 쓰세요 " +
        "— list_plcs(통신 연결 정보 목록)를 쓰면 안 됩니다. 반대로 'PLC 목록/PLC 몇 대야?'처럼 통신 " +
        "장비 자체를 물을 때만 list_plcs를 쓰세요.\n" +
        "PLC ID, 주소(D4 등), 컬럼명처럼 도구 인자에 필요한 값을 사용자가 알려주지 않았다면 절대 추측하거나 " +
        "지어내지 마세요 — list_plcs/list_folder_tags 같은 조회 도구로 먼저 확인하거나 사용자에게 되물어보세요.\n" +
        "중요: 도구 결과가 빈 배열이거나 success:false거나 원하는 데이터가 안 보이면, 절대 상태를 지어내서 " +
        "답하지 말고 \"찾을 수 없습니다/정보가 없습니다\"라고 정직하게 답하세요. 도구가 여러 항목(배열)을 " +
        "돌려주면 그중 일부만 보고 답하지 말고 전체 항목을 다 확인한 뒤 답하세요.\n" +
        "중요: 도구 결과에 질문에 답할 수 있는 정보가 이미 들어있으면 그걸로 바로 답하세요 — 답을 이미 " +
        "받았는데 필터 없이 같은 도구를 또 부르거나 다른 도구로 다시 확인하지 마세요(특히 알람 문구로 " +
        "조회했는데 여러 설비에서 결과가 나온 경우, 그 결과를 그대로 설비별로 정리해서 답하고 " +
        "list_alarm_tags를 필터 없이 다시 부르면 안 됩니다 — 필터 없는 전체 목록은 앞부분만 잘려 있어 " +
        "방금 찾은 답을 오히려 놓치게 됩니다).\n" +
        "중요: get_alarm_tag_status나 get_folder_tag_value처럼 이름 하나를 정확히 찾는 도구를 한 번 " +
        "호출해서 success:true로 원하는 값/상태를 이미 확인했다면 그것으로 답변을 마무리하세요. " +
        "재확인한다며 list_active_alarms, list_alarm_tags, list_folder_tags 같은 다른 조회 도구를 " +
        "추가로 부르지 마세요 — 이미 정확한 답을 갖고 있는데 전체 목록 도구를 또 부르면 그 전체 " +
        "목록(앞부분만 잘림)에 정신이 팔려 방금 확인한 정답을 답변에서 빠뜨리게 됩니다.";

    public static void MapAdminChatEndpoints(this WebApplication app)
    {
        ChatModel = app.Configuration["Ollama:Model"] ?? ChatModel;

        app.MapPost("/api/admin/chat", async (HttpRequest req) =>
        {
            try
            {
                using var reader = new StreamReader(req.Body);
                string body = await reader.ReadToEndAsync();
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                bool confirm = root.TryGetProperty("confirm", out var cf) && cf.ValueKind == JsonValueKind.True;

                // 클라이언트가 보낸 messages를 그대로 이어받는다. doc(JsonDocument)은 이 핸들러가 끝나면
                // 사라지므로, 응답으로 다시 돌려줄 수 있게 각 원소를 Clone()해서 doc 수명과 분리한다.
                var transcript = new List<object>();
                foreach (var m in root.GetProperty("messages").EnumerateArray())
                    transcript.Add(m.Clone());

                // 대화 첫 질문인지 여부 — 확정 답변(TryBuildDeterministicReply)은 이때만 쓴다. 이미 답을
                // 한 번 준 상태에서 사용자가 "주소도 알려줘"처럼 같은 데이터에 대해 다른 형태로 되물으면,
                // 확정 답변은 항상 똑같은 고정 문장만 돌려줘서 아무리 다시 물어도 답이 안 바뀌는 문제가
                // 실제로 확인됐다(list_active_alarms 결과를 매번 똑같은 문구로만 답함). 후속 질문에서는
                // 모델이 대화 맥락을 보고 원하는 형태로 답할 수 있게 이 지름길을 쓰지 않는다.
                bool isFreshConversation = transcript.Count <= 1;

                // 도구가 28개로 늘고 시스템 프롬프트에 지식베이스까지 들어가면서 CPU로 돌아가는 3B 모델
                // 기준 한 번의 응답이 60초를 넘기는 경우가 실제로 생겨(확인됨) 넉넉히 잡는다.
                // 7B(A.X 4.0 Light Q8_0)를 GPU 없이 CPU로 돌리면 결과 요약 호출 한 번이 3분 가까이 걸리는
                // 경우가 실제로 확인돼(get_poll_status 요약) 더 늘렸다.
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(300) };
                var toolsUsed = new List<string>();

                // 직전 턴에서 "쓰기" 도구 호출이 확인 대기 중이었고, 사용자가 방금 실행을 승인한 경우 —
                // 마지막 메시지(보류 중이던 assistant의 tool_calls)를 지금 실제로 실행하고 결과를 이어붙인다.
                if (confirm && transcript.Count > 0 && transcript[^1] is JsonElement lastEl &&
                    lastEl.TryGetProperty("tool_calls", out var pendingCalls) && pendingCalls.GetArrayLength() > 0)
                {
                    var fn = pendingCalls[0].GetProperty("function");
                    string pendingName = fn.GetProperty("name").GetString() ?? "";
                    var pendingArgs = NormalizeArgs(fn.GetProperty("arguments"));
                    string pendingResult = await ExecuteToolAsync(http, pendingName, pendingArgs);
                    toolsUsed.Add(pendingName);
                    transcript.Add(new { role = "tool", content = pendingResult });
                }

                // 도구가 늘면서(28개) 작은 모델이 이미 조회한 도구를 의미 없이 반복 호출하다 반복
                // 한도까지 소진해버리는 경우가 실제로 확인됨(get_docs 이후 list_plcs를 5번 연속 호출).
                // 직전과 완전히 같은 도구+인자 호출이면 다시 실행하지 않고, "그만 반복하라"는 안내만
                // 돌려줘서 다음 턴에 다른 판단을 하도록(또는 있는 정보로 답하도록) 유도한다.
                string? lastToolCallKey = null;

                for (int iter = 0; iter < MaxToolIterations; iter++)
                {
                    var ollamaMessages = new List<object> { new { role = "system", content = SystemPrompt } };
                    ollamaMessages.AddRange(transcript);

                    // num_ctx를 안 주면 Ollama가 작은 기본값(모델 학습 최대치인 32768보다 훨씬 작음)을
                    // 쓰는데, 시스템 프롬프트+도구 스키마(16개 이상)+대화 이력을 합치면 이 기본값을 넘겨서
                    // 앞부분(시스템 프롬프트/도구 정의)이 조용히 잘려나가 모델이 도구 호출 없이 빈 답을
                    // 내놓는 게 실제로 재현됨(예: "지금 켜져있는 알람 있어?"가 도구 호출 자체를 안 하고
                    // 빈 문자열만 반환). 프롬프트를 더 늘릴수록 이 문제가 더 자주 터지므로, 프롬프트를
                    // 줄이는 대신 컨텍스트 창 자체를 넉넉히 키운다.
                    // keep_alive: Ollama 기본값(5분)이 지나면 모델을 메모리에서 내려서, 다음 질문 때 8.5GB를
                    // 다시 올리는 시간이 매번 더해진다 — 현장에서 띄엄띄엄 묻는 사용 패턴이라 넉넉히 유지한다.
                    var ollamaReq = new { model = ChatModel, messages = ollamaMessages, tools = ToolSchema, stream = false, keep_alive = OllamaKeepAlive, options = new { num_ctx = 8192 } };
                    var resp = await http.PostAsJsonAsync(OllamaChatUrl, ollamaReq);
                    if (!resp.IsSuccessStatusCode)
                        return Results.Ok(new { success = false, error = $"Ollama 응답 오류: {resp.StatusCode}" });

                    var ollamaJson = await resp.Content.ReadFromJsonAsync<JsonElement>();
                    var message = ollamaJson.GetProperty("message");
                    string? content = message.TryGetProperty("content", out var cEl) ? cEl.GetString() : null;
                    bool hasToolCalls = message.TryGetProperty("tool_calls", out var toolCalls) && toolCalls.ValueKind == JsonValueKind.Array && toolCalls.GetArrayLength() > 0;

                    if (!hasToolCalls)
                    {
                        transcript.Add(new { role = "assistant", content });
                        return Results.Ok(new { success = true, done = true, messages = transcript, reply = content, toolsUsed });
                    }

                    var firstFn = toolCalls[0].GetProperty("function");
                    string toolName = firstFn.GetProperty("name").GetString() ?? "";
                    var toolArgs = NormalizeArgs(firstFn.GetProperty("arguments"));
                    var toolCallEntry = new { function = new { name = toolName, arguments = toolArgs } };

                    // 이번 턴에서 새로 등장한 "쓰기" 도구는 여기서 실행하지 않고 확인을 요청한다.
                    if (WriteTools.Contains(toolName))
                    {
                        transcript.Add(new { role = "assistant", content, tool_calls = new[] { toolCallEntry } });
                        return Results.Ok(new
                        {
                            success = true,
                            done = false,
                            messages = transcript,
                            toolsUsed,
                            pendingConfirm = new { name = toolName, arguments = toolArgs, description = DescribePendingAction(toolName, toolArgs) }
                        });
                    }

                    string callKey = toolName + "|" + toolArgs.GetRawText();
                    string toolResult;
                    if (callKey == lastToolCallKey)
                    {
                        toolResult = JsonSerializer.Serialize(new
                        {
                            success = false,
                            error = "바로 직전과 같은 조회를 반복하고 있습니다 — 이미 받은 정보로 답하거나, 다른 도구를 시도하세요."
                        }, RelaxedJsonOptions);
                    }
                    else
                    {
                        toolResult = await ExecuteToolAsync(http, toolName, toolArgs);
                        toolsUsed.Add(toolName);
                        lastToolCallKey = callKey;
                    }

                    // get_alarm_tag_status/get_folder_tag_value는 이름 하나를 정확히 찾는 도구라 결과
                    // 구조가 고정적이고 답이 이미 결정돼 있다 — 그런데도 이 결과를 다시 LLM에게 넘겨
                    // 자연어로 요약시키면(qwen2.5:3b) 이미 정확한 답을 받고도 불필요한 추가 도구를 계속
                    // 호출하다 반복 한도(6회)를 소진해 아예 무응답이 되거나, 엉뚱한 값을 지어내는 문제가
                    // 실제로 재현됐다(예: "본실 온도 과열 알람 켜져있어?" 질문에서 이미 정답을 받고도
                    // list_alarm_tags를 필터 없이 다시 불러 앞 40개 노이즈에서 헛소리를 만듦). 프롬프트로
                    // "그만 불러라"를 여러 번 강조해도 3B 모델에서 재현이 계속돼, 모델 판단에 맡기지 않고
                    // 서버가 도구 결과를 그대로 한국어 문장으로 조립해 즉시 확정 답변한다.
                    // iter==0(사용자 질문 직후 첫 도구 호출)일 때만 적용한다 — "등록된 설비 목록 보여줘"에서
                    // 모델이 먼저 정답인 list_equip_ids를 부르고 그 다음 불필요하게 list_temp_tags까지
                    // 부른 사례가 실제로 확인됨: 이때 두 번째(무관한) 호출에 확정 답변 로직이 걸려버리면
                    // 이미 나온 올바른 답(list_equip_ids 결과)을 무시하고 엉뚱한 답(온도 목록)으로
                    // 덮어써버린다. 질문과 가장 직접적으로 연결된 건 항상 모델의 "첫" 도구 선택이므로
                    // 거기서만 확정하고, 그 이후 호출은 원래 방식(LLM 판단)에 맡긴다.
                    if (iter == 0 && isFreshConversation && IsPreciseLookupCall(toolName, toolArgs))
                    {
                        var deterministic = TryBuildDeterministicReply(toolName, toolResult);
                        if (deterministic != null)
                        {
                            transcript.Add(new { role = "assistant", content, tool_calls = new[] { toolCallEntry } });
                            transcript.Add(new { role = "tool", content = toolResult });
                            transcript.Add(new { role = "assistant", content = deterministic });
                            return Results.Ok(new { success = true, done = true, messages = transcript, reply = deterministic, toolsUsed });
                        }
                    }

                    transcript.Add(new { role = "assistant", content, tool_calls = new[] { toolCallEntry } });
                    transcript.Add(new { role = "tool", content = toolResult });
                }

                return Results.Ok(new { success = false, error = "요청이 너무 복잡해서 처리하지 못했습니다(반복 한도 초과).", messages = transcript, toolsUsed });
            }
            catch (HttpRequestException ex)
            {
                return Results.Ok(new { success = false, error = $"Ollama에 연결할 수 없습니다(로컬에서 실행 중인지 확인하세요): {ex.Message}" });
            }
            catch (Exception ex) { return Results.Ok(new { success = false, error = ex.Message }); }
        });
    }

    // Ollama tool_calls의 arguments는 버전에 따라 JSON 객체로 오거나 JSON 문자열로 올 수 있어 방어적으로 통일한다.
    private static JsonElement NormalizeArgs(JsonElement raw)
    {
        if (raw.ValueKind == JsonValueKind.String)
        {
            string s = raw.GetString() ?? "{}";
            using var d = JsonDocument.Parse(string.IsNullOrWhiteSpace(s) ? "{}" : s);
            return d.RootElement.Clone();
        }
        return raw;
    }

    private static string? GetStringArg(JsonElement args, string key) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static int? GetIntArg(JsonElement args, string key)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(key, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i)) return i;
        if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var pi)) return pi;
        return null;
    }

    // PreciseLookupTools(get_alarm_tag_status/get_folder_tag_value) 결과를 LLM에게 넘기지 않고
    // 서버가 바로 한국어 문장으로 조립한다. success:true가 아니거나 예상한 모양(tags 배열)이 아니면
    // null을 반환해 기존 방식(LLM에게 넘겨 계속 진행)으로 자연스럽게 폴백한다.
    private static string? TryBuildDeterministicReply(string toolName, string toolResultJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(toolResultJson);
            var root = doc.RootElement;
            if (!root.TryGetProperty("success", out var sOk) || sOk.ValueKind != JsonValueKind.True) return null;

            if (toolName == "list_equip_ids")
            {
                if (!root.TryGetProperty("equipIds", out var eqIds) || eqIds.ValueKind != JsonValueKind.Array) return null;
                var names = eqIds.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s.Length > 0).ToList();
                return names.Count == 0 ? "등록된 설비가 없습니다." : "등록된 설비: " + string.Join(", ", names);
            }

            if (!root.TryGetProperty("tags", out var tags) || tags.ValueKind != JsonValueKind.Array) return null;
            // TrimForLlm이 40개로 잘라내면서 note를 붙인 경우 — 확정 답변이 전체를 대표하지 못하므로
            // 여기서 조립하지 않고 기존 방식(LLM에게 넘김)으로 폴백한다.
            if (root.TryGetProperty("note", out _)) return null;
            int n = tags.GetArrayLength();

            if (toolName == "get_alarm_tag_status" || toolName == "list_alarm_tags")
            {
                if (n == 0) return "해당 알람을 찾을 수 없습니다.";
                if (n == 1)
                {
                    var t = tags[0];
                    string msg = t.GetProperty("alarmMsg").GetString() ?? t.GetProperty("tagName").GetString() ?? "";
                    string equip = t.GetProperty("folderName").GetString() ?? "";
                    string addr1 = t.GetProperty("address").GetString() ?? "";
                    bool on = t.TryGetProperty("isOn", out var onEl) && onEl.ValueKind == JsonValueKind.True;
                    return $"{equip} — {msg}({addr1}) 알람은 지금 {(on ? "켜져(ON) 있습니다." : "꺼져(OFF) 있습니다.")}";
                }
                var lines = new List<string>();
                foreach (var t in tags.EnumerateArray())
                {
                    string msg = t.GetProperty("alarmMsg").GetString() ?? "";
                    string equip = t.GetProperty("folderName").GetString() ?? "";
                    string addr = t.GetProperty("address").GetString() ?? "";
                    bool on = t.TryGetProperty("isOn", out var onEl) && onEl.ValueKind == JsonValueKind.True;
                    lines.Add($"- {equip}: {msg}({addr}) — {(on ? "ON" : "OFF")}");
                }
                return "같은 이름/문구의 알람이 여러 설비에 등록되어 있습니다:\n" + string.Join("\n", lines);
            }

            if (toolName == "list_active_alarms")
            {
                if (n == 0) return "지금 켜져있는 알람은 없습니다.";
                var lines3 = new List<string>();
                foreach (var t in tags.EnumerateArray())
                {
                    string msg = t.GetProperty("alarmMsg").GetString() ?? "";
                    string equip = t.GetProperty("folderName").GetString() ?? "";
                    string addr3 = t.GetProperty("address").GetString() ?? "";
                    lines3.Add($"- {equip}: {msg}({addr3})");
                }
                return $"지금 켜져있는 알람이 {n}개 있습니다:\n" + string.Join("\n", lines3);
            }

            if (toolName == "list_temp_tags")
            {
                if (n == 0) return "해당 온도 태그를 찾을 수 없습니다.";
                var lines4 = new List<string>();
                foreach (var t in tags.EnumerateArray())
                {
                    string label = t.TryGetProperty("trendName", out var trEl) && trEl.ValueKind == JsonValueKind.String
                        ? trEl.GetString()!
                        : (t.TryGetProperty("tagName", out var tnEl) ? tnEl.GetString() ?? "" : "");
                    string equip = t.TryGetProperty("equipId", out var eqEl) && eqEl.ValueKind == JsonValueKind.String ? eqEl.GetString()! : "";
                    var curEl = t.GetProperty("current");
                    string cur = curEl.ValueKind == JsonValueKind.Null ? "값 없음" : curEl.ToString();
                    lines4.Add(string.IsNullOrEmpty(equip) ? $"- {label}: {cur}도" : $"- {equip} {label}: {cur}도");
                }
                return string.Join("\n", lines4);
            }

            if (toolName == "get_folder_tag_value")
            {
                if (n == 0) return "해당 태그를 찾을 수 없습니다.";
                if (n == 1)
                {
                    var t = tags[0];
                    string tname = t.GetProperty("name").GetString() ?? "";
                    string val = t.GetProperty("value").ValueKind == JsonValueKind.Null ? "값 없음" : t.GetProperty("value").ToString();
                    return $"'{tname}' 태그의 현재 값은 {val}입니다.";
                }
                var lines2 = new List<string>();
                foreach (var t in tags.EnumerateArray())
                {
                    string tname = t.GetProperty("name").GetString() ?? "";
                    string val = t.GetProperty("value").ValueKind == JsonValueKind.Null ? "값 없음" : t.GetProperty("value").ToString();
                    lines2.Add($"- {tname}: {val}");
                }
                return "같은 이름의 태그가 여러 개 있습니다:\n" + string.Join("\n", lines2);
            }

            return null;
        }
        catch { return null; }
    }

    // ── 도구 실행: 전부 이 서버 자신의 기존 API를 루프백으로 호출한다(로직 중복 없음). ──────────
    private static async Task<string> ExecuteToolAsync(HttpClient http, string name, JsonElement args)
    {
        try
        {
            HttpResponseMessage resp;
            switch (name)
            {
                case "list_plcs":
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/admin/plcs");
                    break;
                case "get_poll_status":
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/admin/monitor/pollstatus");
                    break;
                case "get_docs":
                    // 시스템 프롬프트에 문서를 통째로 넣어뒀을 때는 작은 모델이 정확한 테이블/컬럼명을
                    // 잘 인용하지 못했다(실제로 확인됨) — 대신 도구 결과로 "방금 막 읽은 것"처럼 주면
                    // 다른 조회 도구들과 같은 방식으로 훨씬 정확하게 인용한다.
                    return JsonSerializer.Serialize(new { success = true, docs = GetDocs(GetStringArg(args, "topic")) }, RelaxedJsonOptions);
                case "list_folder_tags":
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/admin/monitor/foldertags" +
                        (GetIntArg(args, "folderId") is int fid ? $"?folderId={fid}" : ""));
                    break;
                case "get_folder_tag_value":
                    // list_folder_tags는 TrimForLlm이 앞 40개로 잘라서 모델에게 준다 — 태그가 몇만 개인
                    // 폴더도 있어서(실제로 12,000개 넘는 폴더 있음) 이름 하나만 찾을 땐 그 목록에 없을 수
                    // 있다(실제로 294번째라 놓친 사례 확인됨). 이 도구는 DB에서 이름으로 직접 찾아서
                    // 잘림 없이 정확히 반환한다.
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/foldertag/value/by-name?name={Uri.EscapeDataString(GetStringArg(args, "name") ?? "")}");
                    break;
                case "find_folder_tag_by_address":
                {
                    // 태그 이름이 아니라 PLC 주소(D101 등)로 등록 여부를 찾을 때 전용 — plcId 없이도
                    // 검색 가능(그 주소를 쓰는 모든 PLC에서 찾음). read_plc_address(실제 PLC에 접속해서
                    // 읽음)와 다르게 이건 DB에 등록된 "정의"만 조회하고 PLC와 통신하지 않는다.
                    string address = GetStringArg(args, "address") ?? "";
                    string? plcId = GetStringArg(args, "plcId");
                    string url = $"{SelfBaseUrl}/api/foldertag/value/by-address?address={Uri.EscapeDataString(address)}";
                    if (!string.IsNullOrWhiteSpace(plcId)) url += $"&plcId={Uri.EscapeDataString(plcId)}";
                    resp = await http.GetAsync(url);
                    break;
                }
                case "count_folder_tags":
                    // list_folder_tags로 개수만 물어보면 태그 40개 분량 데이터에 모델이 압도돼 답을
                    // 아예 못 만드는 경우가 확인돼서, 개수만 가볍게 돌려주는 전용 경로.
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/admin/foldertags/count" +
                        (GetIntArg(args, "folderId") is int cfid ? $"?folderId={cfid}" : ""));
                    break;
                case "list_alarm_tags":
                {
                    // 원래 이 도구는 name 인자를 받지 않지만(스키마에도 없음), 실제로 모델이 특정 알람을
                    // 물으면서도 get_alarm_tag_status 대신 이 도구를 부르고 name을 끼워 넣는 일이
                    // 확인됐다 — 그러면 필터 없이 238개 전체(앞 40개만)가 넘어가 모델이 엉뚱한 답을
                    // 지어내게 된다. name이 실려 오면 무시하지 말고 그대로 필터에 반영해 안전하게 만든다.
                    var q = new List<string>();
                    if (GetStringArg(args, "equipId") is string leq) q.Add($"equipId={Uri.EscapeDataString(leq)}");
                    if (GetStringArg(args, "name") is string lname && !string.IsNullOrWhiteSpace(lname)) q.Add($"name={Uri.EscapeDataString(lname)}");
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/admin/monitor/alarmtags" + (q.Count > 0 ? "?" + string.Join("&", q) : ""));
                    break;
                }
                case "get_alarm_tag_status":
                {
                    // list_alarm_tags와 동일한 이유(태그가 238개처럼 많으면 앞부분만 잘려 전달됨) —
                    // 이름 하나만 정확히 찾을 땐 이 쪽을 쓴다. name은 태그 이름(ALARM_102) 또는 알람
                    // 메시지 문구("본실 온도 과열" 등)로도 매칭되므로, equipId 없이 여러 건이 나오면
                    // 어느 설비인지 되물어 equipId로 좁혀 재조회한다.
                    var q = new List<string> { $"name={Uri.EscapeDataString(GetStringArg(args, "name") ?? "")}" };
                    if (GetStringArg(args, "equipId") is string geq) q.Add($"equipId={Uri.EscapeDataString(geq)}");
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/admin/monitor/alarmtags?{string.Join("&", q)}");
                    break;
                }
                case "list_active_alarms":
                    // "지금 켜져있는 알람 있어?" 같은 질문 전용 — 서버가 ON인 것만 먼저 걸러서 주므로
                    // 전체 목록을 앞 40개만 보다가 뒤쪽에서 켜진 알람을 놓치는 일이 없다.
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/admin/monitor/alarmtags?onOnly=true");
                    break;
                case "list_temp_tags":
                {
                    // temptags 엔드포인트는 그래프용 시계열(series)까지 기본 60분치를 같이 계산해 내려준다 —
                    // series 자체는 TrimForLlm이 모델에게 넘기기 전에 걷어내지만(아래 공통 처리), 서버가
                    // 매번 60분치를 굳이 계산하는 건 낭비라 채팅에서는 최소 구간만 요청한다(그래프 화면은
                    // 이 엔드포인트를 직접 쓰므로 영향 없음). 스키마에 minutes를 노출하지 않는 이유이기도
                    // 함 — 모델이 직접 크게 요청할 길을 아예 막아둔다.
                    var q = new List<string> { "minutes=2" };
                    if (GetStringArg(args, "equipId") is string eq) q.Add($"equipId={Uri.EscapeDataString(eq)}");
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/admin/monitor/temptags?{string.Join("&", q)}");
                    break;
                }
                case "list_equip_ids":
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/admin/temptags/equipids");
                    break;
                case "write_folder_tag":
                {
                    string tagName = GetStringArg(args, "name") ?? "";
                    int value = GetIntArg(args, "value") ?? 0;
                    var q = new List<string> { $"name={Uri.EscapeDataString(tagName)}", $"value={value}" };
                    if (GetIntArg(args, "folderId") is int wfid) q.Add($"folderId={wfid}");
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/foldertag/write/by-name?{string.Join("&", q)}");
                    break;
                }
                case "add_temp_tag":
                {
                    var reqBody = new
                    {
                        tagName = GetStringArg(args, "tagName") ?? "",
                        address = GetStringArg(args, "address") ?? "",
                        plcId = GetStringArg(args, "plcId") ?? "",
                        colName = GetStringArg(args, "colName") ?? "",
                        trendName = GetStringArg(args, "trendName"),
                        scale = GetStringArg(args, "scale"),
                        equipId = GetStringArg(args, "equipId"),
                        enabled = true
                    };
                    resp = await http.PostAsJsonAsync($"{SelfBaseUrl}/api/admin/temptags", reqBody);
                    break;
                }
                case "read_plc_address":
                {
                    string plcId = GetStringArg(args, "plcId") ?? "";
                    string address = GetStringArg(args, "address") ?? "";
                    int count = GetIntArg(args, "count") ?? 1;
                    var parsed = LiveTagMonitorService.ParseAddressFull(address);
                    if (parsed == null)
                        return JsonSerializer.Serialize(new { success = false, error = $"주소 형식을 해석할 수 없음: '{address}'" }, RelaxedJsonOptions);
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/plc/read/{Uri.EscapeDataString(plcId)}" +
                        $"?start={parsed.Value.Addr}&count={count}&device={Uri.EscapeDataString(parsed.Value.Device)}");
                    break;
                }
                case "write_plc_address":
                {
                    string plcId = GetStringArg(args, "plcId") ?? "";
                    string address = GetStringArg(args, "address") ?? "";
                    int value = GetIntArg(args, "value") ?? 0;
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/foldertag/write/by-address" +
                        $"?plcId={Uri.EscapeDataString(plcId)}&address={Uri.EscapeDataString(address)}&value={value}");
                    break;
                }
                case "write_alarm_tag":
                {
                    // write_folder_tag는 folders_tags만 뒤져서 tb_alarm_tag에만 있는 이름을 못 찾는다
                    // (실제로 확인됨) — 알람 태그 이름으로 쓸 땐 반드시 이 전용 경로를 쓴다.
                    string alarmName = GetStringArg(args, "name") ?? "";
                    int alarmValue = GetIntArg(args, "value") ?? 0;
                    var q = new List<string> { $"name={Uri.EscapeDataString(alarmName)}", $"value={alarmValue}" };
                    if (GetStringArg(args, "equipId") is string weq) q.Add($"equipId={Uri.EscapeDataString(weq)}");
                    resp = await http.GetAsync($"{SelfBaseUrl}/api/admin/alarmtags/write/by-name?{string.Join("&", q)}");
                    break;
                }
                default:
                    return JsonSerializer.Serialize(new { success = false, error = $"알 수 없는 도구: {name}" }, RelaxedJsonOptions);
            }

            string raw = await resp.Content.ReadAsStringAsync();
            raw = await EnrichPlcNotFoundError(http, raw);
            return TrimForLlm(raw);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { success = false, error = ex.Message }, RelaxedJsonOptions);
        }
    }

    // plcId를 직접 타이핑/추론해야 하는 도구(read_plc_address 등)는 작은 모델이 한 글자 틀리는 실수를
    // 종종 한다(실제로 확인됨: 사용자가 "MST_MITSUBISHI"라고 정확히 알려줬는데도 모델이 "MST_MITSUBISHIS"로
    // 잘못 불러 실패). "PLC를 찾을 수 없음" 오류가 나면 실제 PLC ID 목록을 같이 돌려줘서, 같은 턴 안에서
    // 모델이 다음 반복 때 스스로 맞는 ID로 다시 시도할 수 있게 한다.
    private static async Task<string> EnrichPlcNotFoundError(HttpClient http, string rawJson)
    {
        try
        {
            if (JsonNode.Parse(rawJson) is not JsonObject node) return rawJson;
            bool ok = node["success"]?.GetValue<bool>() ?? true;
            string? error = node["error"]?.GetValue<string>();
            if (ok || error == null) return rawJson;
            bool looksLikeMissingPlc = error.Contains("not found", StringComparison.OrdinalIgnoreCase) || error.Contains("없음");
            if (!looksLikeMissingPlc) return rawJson;

            var plcsResp = await http.GetAsync($"{SelfBaseUrl}/api/admin/plcs");
            var plcsJson = await plcsResp.Content.ReadFromJsonAsync<JsonElement>();
            if (plcsJson.TryGetProperty("plcs", out var plcsArr))
            {
                var ids = new JsonArray();
                foreach (var p in plcsArr.EnumerateArray())
                    if (p.TryGetProperty("plcId", out var idProp)) ids.Add(JsonValue.Create(idProp.GetString()));
                node["validPlcIds"] = ids;
            }
            return node.ToJsonString(RelaxedJsonOptions);
        }
        catch { return rawJson; }   // 목록 조회 자체가 실패해도 원래 오류는 그대로 전달한다.
    }

    // 도구 실행 결과를 그대로 모델에게 돌려주면 안 되는 경우가 있다 — 온도 태그의 시계열(series),
    // 폴링 이력(durationHistory)은 화면 차트용이라 통째로 넘기면 3B 모델이 숫자 나열에 압도돼 엉뚱한
    // 답을 하거나(실제로 확인됨: "온도 태그 목록 보여줘"에 시간대별 수치 분석을 늘어놓은 사례) 응답이
    // 크게 느려진다. 태그 개수 자체도 실사용 환경에서 PLC 1대당 수백 개(예: 폴더 242개)까지 있어서,
    // 목록형 도구는 개수를 넉넉히 앞부분만 잘라서 넘기고 전체 개수는 note로 알려준다(화면 표는 그대로 전체를 보여준다 — 이건 LLM에게 넘기는 사본에만 적용).
    private const int MaxArrayItemsForLlm = 40;
    private static readonly string[] ArrayKeysToCap = { "tags", "plcs" };

    private static string TrimForLlm(string rawJson)
    {
        try
        {
            if (JsonNode.Parse(rawJson) is not JsonObject node) return rawJson;

            if (node["tags"] is JsonArray tagsArr)
                foreach (var t in tagsArr)
                    (t as JsonObject)?.Remove("series");
            (node["live"] as JsonObject)?.Remove("durationHistory");
            (node["temp"] as JsonObject)?.Remove("durationHistory");

            foreach (var key in ArrayKeysToCap)
            {
                if (node[key] is JsonArray arr && arr.Count > MaxArrayItemsForLlm)
                {
                    int total = arr.Count;
                    while (arr.Count > MaxArrayItemsForLlm) arr.RemoveAt(arr.Count - 1);
                    node["note"] = $"총 {total}개 중 {MaxArrayItemsForLlm}개만 표시(나머지 {total - MaxArrayItemsForLlm}개 생략) — " +
                                   "전체 목록이 필요하면 화면의 표를 직접 확인하도록 안내하세요.";
                }
            }

            return node.ToJsonString(RelaxedJsonOptions);
        }
        catch { return rawJson; }   // 예상과 다른 형식이면 안전하게 원본 그대로 넘긴다.
    }

    // get_docs 도구가 돌려주는 실제 문서 내용. 시스템 프롬프트에 그대로 박아뒀을 때보다 "도구 결과"로
    // 줬을 때 모델이 정확한 테이블/컬럼명·API 경로를 훨씬 잘 인용해서(다른 조회 도구들과 동일한 경로라서)
    // 이 텍스트를 시스템 프롬프트가 아니라 여기 도구 결과 쪽에 둔다.
    private static string GetDocs(string? topic)
    {
        const string tables =
            "[테이블 구조] tb_plc(plc_id PK, ip, port, plc_type=LS|MITSUBISHI|MODBUS_TCP, label, enabled) — PLC 연결정보. " +
            "folders(id,name,parent_id) 1─N folders_tags(id,folder_id,name,address,plc_id,type,enabled) = 모니터링(폴더) 태그 정의. " +
            "tb_alarm_folder(folder_id,folder_name,parent_id,sort_order) 1─N tb_alarm_tag(tag_id,folder_id,tag_name,address,plc_id,alarm_msg,level,enabled) " +
            "— ON/OFF로 전환되는 순간마다 tb_alarm_history에 발생/해제 이력이 남는다(현재 이 이력을 조회하는 API는 없음). " +
            "tb_temp_tag(temp_id,tag_name,address,plc_id,col_name,trend_name,scale,equip_id,enabled) — col_name 하나당 " +
            "tb_temp_snapshot 테이블에 실제 컬럼이 하나 생기고, 폴링 주기마다 스냅샷 1행이 새로 쌓인다.";

        const string api =
            "[API로 값 읽기/쓰기] 태그 이름으로: GET /api/foldertag/value/by-name?name=이름 (읽기), " +
            "GET /api/foldertag/write/by-name?name=이름&value=값 (쓰기, 실제 PLC에 씀). " +
            "PLC 번지 직접(태그 등록 여부 무관): GET /api/plc/read/{plcId}?start=번지숫자&count=개수&device=디바이스문자 (읽기), " +
            "GET /api/foldertag/write/by-address?plcId=아이디&address=번지&value=값 (쓰기). " +
            "목록 조회: GET /api/admin/plcs, /api/admin/foldertags, /api/admin/alarmtags, /api/admin/temptags.";

        const string process =
            "[동작 방식] 폴더/알람 태그는 백그라운드 서비스가 2초 주기로, 온도 태그는 30초 주기로 각각 독립적으로 " +
            "PLC를 직접 폴링한다(HTTP 요청과 무관하게 항상 돌아감, PLC 하나당 커넥션 1개를 재사용). " +
            "폴더 태그 값은 DB에 저장하지 않고 서버 메모리에만 있다가 API 요청이 오면 그 값을 그대로 보여준다(추가 " +
            "PLC 통신 없음). 온도 태그는 매 주기마다 전체 태그의 값을 한 행으로 tb_temp_snapshot에 insert한다. " +
            "값 쓰기는 큐 없이 그 자리에서 즉시 실제 PLC에 쓰고, 쓴 직후 다시 읽어서 반영됐는지 확인한다.";

        return (topic?.Trim().ToLowerInvariant()) switch
        {
            "tables" or "table" or "테이블" => tables,
            "api" => api,
            "process" or "flow" or "동작" => process,
            _ => tables + " " + api + " " + process
        };
    }

    // "쓰기" 도구를 실행하기 전, 사용자에게 무엇을 할지 미리 보여줄 한국어 설명.
    private static string DescribePendingAction(string toolName, JsonElement args) => toolName switch
    {
        "write_folder_tag" =>
            $"태그 '{GetStringArg(args, "name")}' 에 값 {GetIntArg(args, "value")} 쓰기" +
            (GetIntArg(args, "folderId") is int fid ? $" (폴더 ID {fid})" : "") +
            " — 실제 설비에 값이 전달됩니다.",
        "write_plc_address" =>
            $"PLC '{GetStringArg(args, "plcId")}'의 번지 '{GetStringArg(args, "address")}'에 값 {GetIntArg(args, "value")} 쓰기" +
            " — 태그 등록 여부와 상관없이 그 번지에 직접 쓰며, 실제 설비에 값이 전달됩니다.",
        "write_alarm_tag" =>
            $"알람 '{GetStringArg(args, "name")}'을(를) {(GetIntArg(args, "value") == 0 ? "OFF로" : "ON으로")} 변경" +
            (GetStringArg(args, "equipId") is string weq2 ? $" (설비: {weq2})" : "") +
            " — 실제 설비에 값이 전달됩니다.",
        "add_temp_tag" =>
            $"새 온도 태그 등록 — 이름:'{GetStringArg(args, "tagName")}', PLC:'{GetStringArg(args, "plcId")}', " +
            $"주소:'{GetStringArg(args, "address")}', 컬럼:'{GetStringArg(args, "colName")}'" +
            (GetStringArg(args, "equipId") is string eq ? $", 설비:'{eq}'" : ""),
        _ => $"{toolName} 실행"
    };

    private static object Tool(string name, string description, object parameters) =>
        new { type = "function", function = new { name, description, parameters } };

    // ── Ollama에게 알려줄 도구 목록(JSON Schema) ────────────────────────────────────────────
    private static readonly object[] ToolSchema =
    {
        Tool("list_plcs", "등록된 모든 PLC 목록을 IP/포트/타입/사용여부와 함께 조회한다.",
            new { type = "object", properties = new { } }),

        Tool("get_poll_status", "현재 PLC 통신(폴링) 상태를 조회한다. '지금 통신 상태 어때', '문제 있어?' 같은 " +
                                 "질문에 사용한다. 결과의 live.groups는 PLC별 배열이다 — 배열 안의 PLC를 " +
                                 "하나라도 빠뜨리지 말고 전부 언급하세요(태그 개수가 적은 PLC만 보고 답하면 " +
                                 "안 됨). temp 필드도 항상 있으니 온도 폴링 정보도 반드시 같이 답하세요. " +
                                 "failures가 빈 배열이면 실패 0건이라는 뜻입니다.",
            new { type = "object", properties = new { } }),

        Tool("get_docs", "이 시스템 자체에 대한 문서를 조회한다 — 테이블 구조, 값 읽기/쓰기 API 사용법, 폴링/쓰기 " +
                          "동작 방식을 묻는 질문에는 반드시 이 도구를 먼저 호출해서 정확한 내용을 가져온 뒤 답한다.",
            new
            {
                type = "object",
                properties = new
                {
                    topic = new { type = "string", description = "tables(테이블 구조) | api(API 사용법) | process(동작 방식) 중 하나, 생략하면 전체" }
                }
            }),

        Tool("list_folder_tags", "모니터링(폴더) 태그 목록과 현재 값을 조회한다. 태그가 매우 많을 수 있어(수천~수만 개) " +
                                  "결과는 앞부분 일부만 보여준다 — 목록을 훑어보거나 폴더 단위로 살펴볼 때만 쓰고, " +
                                  "특정 태그 하나의 값이 궁금할 땐 get_folder_tag_value를, 주소로 찾을 땐 " +
                                  "find_folder_tag_by_address를, 개수만 궁금할 땐 count_folder_tags를 대신 쓴다.",
            new
            {
                type = "object",
                properties = new { folderId = new { type = "integer", description = "특정 폴더 ID로 좁히고 싶을 때만 지정(선택)" } }
            }),

        Tool("get_folder_tag_value", "모니터링(폴더) 태그 하나를 정확한 이름으로 찾아 현재 값을 조회한다. " +
                                      "사용자가 특정 태그 이름을 말하며 '값 알려줘/얼마야/몇이야' 라고 물으면 " +
                                      "list_folder_tags로 전체 목록을 뒤지지 말고 항상 이 도구를 먼저 쓴다 — " +
                                      "list_folder_tags는 태그가 많은 폴더에서는 그 태그가 목록 앞부분에 없으면 놓칠 수 있다.",
            new
            {
                type = "object",
                properties = new { name = new { type = "string", description = "태그 이름(정확히 일치해야 함)" } },
                required = new[] { "name" }
            }),

        Tool("find_folder_tag_by_address", "모니터링(폴더) 태그를 이름이 아니라 PLC 주소(D101, M10 등)로 찾는다 " +
                                            "— DB에 등록된 정의만 조회하며 PLC와 통신하지 않는다(값이 실시간으로 " +
                                            "필요하면 이 도구로 태그를 먼저 찾은 뒤 get_folder_tag_value를 쓴다). " +
                                            "'이 주소로 등록된 태그 있어?' 같은 질문에 read_plc_address(실제 " +
                                            "PLC에 접속을 시도함)를 쓰면 안 되고 반드시 이 도구를 쓴다.",
            new
            {
                type = "object",
                properties = new
                {
                    address = new { type = "string", description = "PLC 주소(예: D101)" },
                    plcId = new { type = "string", description = "특정 PLC로 좁히고 싶을 때만 지정(선택, 생략하면 전체 PLC에서 찾음)" }
                },
                required = new[] { "address" }
            }),

        Tool("count_folder_tags", "모니터링(폴더) 태그의 전체 개수만 가볍게 조회한다. '태그 몇 개야?/전체 몇 " +
                                   "개야?' 처럼 개수만 궁금한 질문엔 list_folder_tags(태그 데이터까지 같이 옴) " +
                                   "대신 이 도구를 쓴다.",
            new
            {
                type = "object",
                properties = new { folderId = new { type = "integer", description = "특정 폴더 ID로 좁히고 싶을 때만 지정(선택)" } }
            }),

        Tool("write_folder_tag", "이미 등록되어 있는 모니터링 태그를 이름으로 찾아 실제 PLC에 값을 쓴다(새 태그를 만들지 않는다). " +
                                  "'~태그에 …써줘/변경해줘' 요청은 항상 이 도구를 쓴다. 실제 설비에 영향을 주는 동작이다.",
            new
            {
                type = "object",
                properties = new
                {
                    name = new { type = "string", description = "태그 이름(정확히 일치해야 함)" },
                    value = new { type = "integer", description = "쓸 값" },
                    folderId = new { type = "integer", description = "같은 이름이 여러 폴더에 있을 때만 지정(선택)" }
                },
                required = new[] { "name", "value" }
            }),

        Tool("list_alarm_tags", "알람 태그 목록과 현재 ON/OFF 상태를 조회한다. 전체 알람 태그가 매우 많을 수 있어 " +
                                 "(수백 개) 결과는 앞부분 일부만 보여준다 — 목록을 훑어볼 때만 쓰고, 특정 알람 " +
                                 "태그 하나의 상태가 궁금할 땐 get_alarm_tag_status를, 지금 켜져있는 알람이 " +
                                 "있는지 궁금할 땐 list_active_alarms를 대신 사용한다.",
            new
            {
                type = "object",
                properties = new { equipId = new { type = "string", description = "특정 설비(BCF1 등)로 좁히고 싶을 때만 지정(선택)" } }
            }),

        Tool("get_alarm_tag_status", "알람 태그 하나의 현재 ON/OFF 상태를 조회한다. name에는 태그 이름(ALARM_102 " +
                                      "같은 내부 코드)뿐 아니라 사용자가 말하는 알람 문구(예: '본실 온도 과열', " +
                                      "'비상정지')를 그대로 넣어도 찾아진다 — 사용자는 보통 코드가 아니라 알람 " +
                                      "문구나 증상으로 말한다. 사용자가 특정 알람을 말하며 '켜져있어?/꺼져있어?/" +
                                      "상태 알려줘' 라고 물으면 list_alarm_tags로 전체 목록을 뒤지지 말고 항상 " +
                                      "이 도구를 먼저 쓴다. 같은 알람 문구가 여러 설비에 등록돼 있어 결과가 " +
                                      "여러 건이면, 어느 설비(BCF1/BCF2 등)인지 사용자에게 되물어 equipId로 " +
                                      "다시 좁혀 조회한다.",
            new
            {
                type = "object",
                properties = new
                {
                    name = new { type = "string", description = "알람 태그 이름 또는 알람 문구(부분 일치 가능)" },
                    equipId = new { type = "string", description = "같은 알람 문구가 여러 설비에 있을 때 설비명(BCF1 등)으로 좁힐 때만 지정(선택)" }
                },
                required = new[] { "name" }
            }),

        Tool("list_active_alarms", "지금 이 순간 ON(발생) 상태인 알람 태그만 조회한다. '지금 켜져있는 알람 있어?', " +
                                    "'문제/이상 있는 알람 있어?' 같은 질문엔 list_alarm_tags(전체 목록, 앞부분만 " +
                                    "보여줘서 뒤쪽에 켜진 알람이 있어도 놓칠 수 있음) 대신 반드시 이 도구를 쓴다.",
            new { type = "object", properties = new { } }),

        Tool("write_alarm_tag", "이미 등록되어 있는 알람 태그를 찾아 실제 PLC에 값을 쓴다(끄기/켜기 포함, " +
                                 "0=OFF·1=ON). name에는 태그 이름(ALARM_102)뿐 아니라 사용자가 말하는 알람 " +
                                 "문구(예: '본실 온도 과열')를 그대로 넣어도 된다. 알람 태그는 folders_tags가 " +
                                 "아니라 tb_alarm_tag에 등록돼 있어서 write_folder_tag로는 절대 못 찾는다 — " +
                                 "알람에 값을 쓰거나 끄라는/켜라는 요청엔 반드시 이 도구를 쓴다. 같은 알람 문구가 " +
                                 "여러 설비에 걸쳐 있어 특정할 수 없다는 결과가 오면, 절대 임의로 하나를 골라 " +
                                 "실행하지 말고 어느 설비(BCF1/BCF2 등)인지 사용자에게 반드시 되물어 equipId로 " +
                                 "다시 지정한다. 실제 설비에 영향을 주는 동작이다.",
            new
            {
                type = "object",
                properties = new
                {
                    name = new { type = "string", description = "알람 태그 이름 또는 알람 문구(부분 일치 가능)" },
                    value = new { type = "integer", description = "쓸 값 (끄기=0, 켜기=1)" },
                    equipId = new { type = "string", description = "같은 알람 문구가 여러 설비에 있을 때만 지정(선택) — 설비명(BCF1 등)" }
                },
                required = new[] { "name", "value" }
            }),

        Tool("list_temp_tags", "온도 태그 목록과 각 태그의 현재 값을 조회한다(그래프용 시계열 이력은 포함하지 않는다).",
            new
            {
                type = "object",
                properties = new { equipId = new { type = "string", description = "설비명(BCF1 등) 또는 존 이름(1존 등)으로 좁히고 싶을 때만 지정(선택)" } }
            }),

        Tool("list_equip_ids", "온도 태그에 등록되어 있는 설비(equip_id) 목록을 조회한다. 온도 태그를 추가하기 전, " +
                                "이미 쓰이고 있는 설비명을 확인할 때 사용한다.",
            new { type = "object", properties = new { } }),

        Tool("add_temp_tag", "완전히 새로운 온도 태그를 DB에 등록(생성)한다 — 기존 태그에 값을 쓰는 것이 아니다. " +
                              "'태그 추가/등록/새로 만들어줘' 요청에만 사용한다. plcId는 반드시 list_plcs로 확인한 " +
                              "실제 PLC ID를 사용해야 한다. colName은 영문/숫자/밑줄만 가능한 내부 컬럼명이며, " +
                              "tagName/address/plcId/colName 중 사용자가 알려주지 않은 값이 있으면 지어내지 말고 먼저 물어봐야 한다.",
            new
            {
                type = "object",
                properties = new
                {
                    tagName = new { type = "string", description = "태그 이름(화면 표시용)" },
                    address = new { type = "string", description = "PLC 주소(예: D100)" },
                    plcId = new { type = "string", description = "PLC ID(list_plcs 결과 중 하나)" },
                    colName = new { type = "string", description = "DB 컬럼명(영문/숫자/밑줄만)" },
                    trendName = new { type = "string", description = "그래프 표시용 이름(선택, 생략 시 tagName 사용)" },
                    scale = new { type = "string", description = "값 보정 배율(선택)" },
                    equipId = new { type = "string", description = "소속 설비(선택)" }
                },
                required = new[] { "tagName", "address", "plcId", "colName" }
            }),

        Tool("read_plc_address", "등록된 태그 이름과 상관없이, 지정한 PLC의 번지(주소)를 직접 읽는다. " +
                                  "사용자가 'D100', 'M10'처럼 번지 자체를 말하며 읽어달라고 할 때 사용한다.",
            new
            {
                type = "object",
                properties = new
                {
                    plcId = new { type = "string", description = "PLC ID(list_plcs 결과 중 하나)" },
                    address = new { type = "string", description = "PLC 번지(예: D100, M10)" },
                    count = new { type = "integer", description = "연속으로 몇 개를 읽을지(기본 1, 선택)" }
                },
                required = new[] { "plcId", "address" }
            }),

        Tool("write_plc_address", "등록된 태그 이름과 상관없이, 지정한 PLC의 번지(주소)에 직접 값을 쓴다. " +
                                   "사용자가 'D100', 'M10'처럼 번지 자체를 말하며 값을 쓰라고 할 때 사용한다. " +
                                   "실제 설비에 영향을 주는 동작이다.",
            new
            {
                type = "object",
                properties = new
                {
                    plcId = new { type = "string", description = "PLC ID(list_plcs 결과 중 하나)" },
                    address = new { type = "string", description = "PLC 번지(예: D100, M10)" },
                    value = new { type = "integer", description = "쓸 값" }
                },
                required = new[] { "plcId", "address", "value" }
            }),
    };
}
