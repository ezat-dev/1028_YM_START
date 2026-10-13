// ============================================================================
// PlcService.Mitsubishi.cs  (partial class — 미쓰비시 Q시리즈, MC Protocol 3E Binary 구현)
// ============================================================================
// [파일 역할]
//   PlcService의 PlcType == "MITSUBISHI" 일 때 실제로 패킷을 만들고 파싱하는 부분.
//   MC Protocol 3E Binary는 워드 디바이스(D/W/R)와 비트 디바이스(M/L/X/Y/B/S)를 구분해서
//   서로 다른 서브커맨드(0x0000 워드, 0x0001 비트)로 요청한다.
//
// [처리 흐름 — 웹 요청이 여기까지 오는 경로]
//   웹 → 5050 → Program.cs 핸들러 → PlcService.ReadWordsAsync/WriteWordAsync/ReadBitsAsync/
//     WriteBitAsync (PlcService.cs) → PlcType이 "MITSUBISHI"이면 이 파일의 메서드 호출
//     → device 문자열(D/W/R/M/L/X/Y/B 등)을 GetMitsubishiDeviceCode로 실제 디바이스 코드(byte)로
//       변환하고, IsMitsubishiBitDevice로 워드/비트 여부를 판단해 알맞은 메서드로 분기
//     → PlcService.cs의 공용 WithConnectionAsync가 연결을 확보하고 BuildMcReadPacket/
//       BuildMcWritePacket/BuildMcBitReadPacket/BuildMcBitWritePacket으로 조립한 패킷을 전송
//     → PLC 응답을 ReadFullAsync(PlcService.cs)로 읽고 워드/비트 값을 파싱해 반환
//     → 결과가 그대로 PlcService.cs → Program.cs로 돌아가 JSON 응답이 된다.
//   ※ 여기서 DB(MariaDB)는 전혀 관여하지 않는다. 순수하게 TCP 바이트 스트림 조립/파싱만 한다.
//   ※ 지원 디바이스는 아래 MitsubishiDevices 테이블 참고(SM/SD, 타이머 TS/TC/TN, 카운터 CS/CC/CN 등).
//     래더 표기 T/C는 접점·현재값 두 디바이스로 나뉘어서, 어느 쪽을 읽을지는 호출부가 정한다.
//
// [LS/Modbus와 같은 연결 방식으로 통일 — 예전엔 매 요청마다 새로 연결했었음]
//   Mitsubishi Ethernet 카드(QJ71E71 등)는 동시 접속 슬롯이 8~16개로 제한돼 있어서, 예전엔
//   그 슬롯을 낭비하지 않으려고 "매 요청마다 연결 → 요청 → 응답 → 즉시 해제" 방식을 따로 썼다.
//   근데 실제로는 그 반대 문제가 생겼다 — 2초 폴링 주기로 계속 새 연결을 맺고 끊다 보니, 이전
//   연결이 카드에서 완전히 정리되기 전에 다음 연결 요청이 들어가는 경우가 있었고, 그러면 카드가
//   응답을 보내다 말고 연결을 끊어버렸다(PLC 연결 종료). 그래서 지금은 LS/Modbus와 똑같이
//   PlcService.cs의 WithConnectionAsync로 연결을 계속 재사용하고, 문제가 생겼을 때만 끊고
//   재연결한다. 다만 이 카드의 슬롯 제약은 여전히 유효해서, WithConnectionAsync의 서킷브레이커
//   (연속 10회 실패하면 재시도 간격을 3초 → 30초로 늘림)가 짧은 간격으로 계속 재연결을 시도해서
//   슬롯을 좀비 상태로 쌓는 것을 막아주는 안전장치 역할을 한다.
// ============================================================================

using System.Net.Sockets;
using PlcApiServer.Logging;

namespace PlcApiServer.Services;

public partial class PlcService
{
    //  미쓰비시 — 디바이스 종류에 따라 워드/비트 읽기 분기
    private Task<ushort[]> MitsubishiReadAsync(int start, int count, string device)
    {
        byte deviceCode = GetMitsubishiDeviceCode(device);
        return IsMitsubishiBitDevice(device)
            ? MitsubishiReadBitsAsWordsAsync(start, count, deviceCode)
            : MitsubishiReadWordsAsync(start, count, deviceCode);
    }

    //  미쓰비시 Q시리즈 — 워드 읽기 (MC Protocol 3E Binary, 서브커맨드 0x0000)
    private async Task<ushort[]> MitsubishiReadWordsAsync(int startD, int count, byte deviceCode = 0xA8)
    {
        return await WithConnectionAsync(ns => ReadWordsOverConnectionAsync(ns, startD, count, deviceCode), MitsubishiReadTimeoutMs);
    }

    //  이미 열려 있는 연결(ns) 위에서 워드 읽기 1회 수행. MitsubishiReadWordsAsync(단발)와
    //  MitsubishiReadWordsBatchAsync(여러 구간을 한 연결에서 순서대로 처리) 양쪽에서 공용으로 쓴다.
    private static async Task<ushort[]> ReadWordsOverConnectionAsync(NetworkStream ns, int startD, int count, byte deviceCode)
    {
        byte[] packet = BuildMcReadPacket(startD, count, deviceCode);
        await ns.WriteAsync(packet);

        // 응답 헤더 11바이트 고정 (서브헤더 2 + 네트워크번호 등 7 + 종료코드 2)
        byte[] respHdr = new byte[11];
        await ReadFullAsync(ns, respHdr);

        ushort endCode = BitConverter.ToUInt16(respHdr, 9);   // 9~10 오프셋 = 종료 코드 (0이면 정상)
        ushort dataLen = BitConverter.ToUInt16(respHdr, 7);   // 7~8  오프셋 = 이후 데이터 길이(종료코드 2바이트 포함)
        int bodyLen = dataLen - 2;                            // 종료코드 2바이트를 뺀 실제 값 데이터 길이

        if (endCode != 0)
            throw new Exception($"미쓰비시 READ 에러코드: 0x{endCode:X4}");

        if (bodyLen <= 0)
            return new ushort[0];

        byte[] data = new byte[bodyLen];
        await ReadFullAsync(ns, data);

        var result = new List<ushort>();
        for (int i = 0; i + 1 < data.Length && result.Count < count; i += 2)
            result.Add(BitConverter.ToUInt16(data, i));

        return result.ToArray();
    }

    //  MC Protocol 3E는 한 번의 요청으로 읽을 수 있는 점수(워드/비트 개수)에 상한이 있다 — 정확한
    //  값은 기종/네트워크 모듈 설정마다 달라 매뉴얼에 안 나오는 경우도 많은데, 실제로 이 PLC한테
    //  100점을 요청하니 "0xC056(요구 데이터 길이 오류)"로 거부당하고 80점은 성공하는 걸 확인했다.
    //  정확한 상한(80~99 사이)을 더 좁히는 대신, 확인된 성공 지점(80)보다 여유 있게 낮춰서 64점
    //  단위로 쪼갠다 — 폴더 태그처럼 한 폴더에 태그가 많이 몰리면(예: 100개) 한 청크로 뭉쳐서
    //  이 상한을 넘기기 쉽기 때문에, 상위(LiveTagMonitorService)의 청크 크기(ChunkSize 설정)와
    //  무관하게 여기서 한 번 더 강제로 쪼갠다.
    private const int MitsubishiMaxPointsPerRequest = 64;

    private static List<(int Start, int Count)> SplitForMitsubishiLimit(List<(int Start, int Count)> ranges)
    {
        var result = new List<(int, int)>();
        foreach (var (start, count) in ranges)
        {
            int remaining = count;
            int s = start;
            while (remaining > 0)
            {
                int take = Math.Min(remaining, MitsubishiMaxPointsPerRequest);
                result.Add((s, take));
                s += take;
                remaining -= take;
            }
        }
        return result;
    }

    //  여러 (start,count) 구간을 "TCP 연결 1개"로 순서대로 읽어 하나의 값 맵(주소→값)으로 합친다.
    //  AlarmMonitorService/TempMonitorService가 한 폴링 주기에서 같은 PLC를 여러 청크로 나눠 읽을 때,
    //  청크마다 새 연결을 맺으면(기존 방식) FX5UC처럼 내장 이더넷 포트의 동시 접속 슬롯이 적은 PLC에서
    //  연결이 자주 끊기는 문제가 있었다 — 이 메서드로 청크 수만큼의 연결을 1개로 줄인다.
    //  구간 하나가 실패해도(예외) 나머지 구간은 계속 진행한다(기존 per-chunk try/catch와 동일한 내성).
    //  타임아웃(WithConnectionAsync)은 구간 개수에 비례해서 늘려준다 — 태그가 계속 늘어서 한 배치
    //  안의 구간 수가 많아지면 고정 4초로는 다 못 끝내고 타임아웃이 날 수 있기 때문(구간 1개=기존과
    //  동일한 4초, 구간이 늘 때마다 1초씩 여유 추가). 연결 실패로 재시도가 걸리면 1차 시도에서 이미
    //  성공한 구간은 2차 시도 때 다시 읽지 않는다(아래 foreach의 Enumerable.Range 스킵 체크).
    private async Task<Dictionary<int, int>> MitsubishiReadWordsBatchAsync(
        List<(int Start, int Count)> ranges, byte deviceCode, bool isBitDevice,
        Action<int, int, Exception>? onRangeError = null)
    {
        var result = new Dictionary<int, int>();
        var safeRanges = SplitForMitsubishiLimit(ranges);

        // WithConnectionAsync는 실패하면 이 action 전체를 처음부터 다시 실행한다(연결 재시도).
        // result는 이 메서드 바깥(재시도 전체에 걸쳐)에서 살아있으니, 1차 시도에서 이미 성공한
        // 구간은 2차 시도에서 다시 PLC에 물어보지 않고 건너뛴다 — 구간 3개 중 3번째만 실패해도
        // 재시도 때 1~2번까지 또 읽는 낭비를 없앤다.
        int effectiveTimeoutMs = MitsubishiReadTimeoutMs + Math.Max(0, safeRanges.Count - 1) * 1000;

        await WithConnectionAsync<bool>(async ns =>
        {
            foreach (var (start, count) in safeRanges)
            {
                if (Enumerable.Range(start, count).All(a => result.ContainsKey(a)))
                    continue;   // 이전 시도에서 이미 다 읽은 구간

                try
                {
                    ushort[] values = isBitDevice
                        ? await ReadBitsOverConnectionAsync(ns, start, count, deviceCode)
                        : await ReadWordsOverConnectionAsync(ns, start, count, deviceCode);
                    for (int i = 0; i < values.Length; i++)
                        result[start + i] = values[i];
                }
                catch (Exception ex) when (ex is IOException or System.Net.Sockets.SocketException or ObjectDisposedException)
                {
                    onRangeError?.Invoke(start, count, ex);
                    throw;   // 연결(스트림) 자체가 끊긴 경우 — 이후 구간도 이 연결로는 못 읽으므로 상위(WithConnectionAsync)의 재연결/로그 처리로 넘긴다
                }
                catch (Exception ex)
                {
                    // PLC가 명시적으로 거부 응답(에러코드)을 보낸 경우 — 요청/응답을 끝까지 정상적으로
                    // 주고받았으므로 스트림 자체는 깨끗하다. 존재하지 않는 번지 하나 때문에 같은 배치의
                    // 나머지 정상 구간(예: D1~D100)까지 통째로 버리지 않도록, 이 구간만 건너뛰고 같은
                    // 연결로 계속 읽는다.
                    onRangeError?.Invoke(start, count, ex);
                }
            }
            return true;
        }, effectiveTimeoutMs);

        return result;
    }

    //  미쓰비시 Q시리즈 — 워드 쓰기 (MC Protocol 3E Binary)
    //  deviceCode 기본값 0xA8(D) — 기존 호출부(파라미터 생략)와 호환되도록 유지.
    private async Task MitsubishiWriteWordAsync(int dAddress, int value, byte deviceCode = 0xA8)
    {
        await WithConnectionAsync<bool>(async ns =>
        {
            byte[] packet = BuildMcWritePacket(dAddress, (ushort)value, deviceCode);
            await ns.WriteAsync(packet);

            byte[] respHdr = new byte[11];
            await ReadFullAsync(ns, respHdr);

            ushort endCode = BitConverter.ToUInt16(respHdr, 9);
            if (endCode != 0)
                throw new Exception($"미쓰비시 WRITE 에러코드: 0x{endCode:X4}");
            return true;
        }, MitsubishiReadTimeoutMs);
    }

    //  미쓰비시 Q시리즈 — 비트 쓰기 (MC Protocol 3E Binary, 서브커맨드 0x0001)
    //  1점만 쓰므로 니블 데이터 1바이트에서 상위 니블만 사용 (읽기 쪽 파싱 규칙과 대칭).
    private async Task MitsubishiWriteBitAsync(int address, byte deviceCode, bool value)
    {
        await WithConnectionAsync<bool>(async ns =>
        {
            byte[] packet = BuildMcBitWritePacket(address, deviceCode, value);
            await ns.WriteAsync(packet);

            byte[] respHdr = new byte[11];
            await ReadFullAsync(ns, respHdr);

            ushort endCode = BitConverter.ToUInt16(respHdr, 9);
            if (endCode != 0)
                throw new Exception($"미쓰비시 BIT WRITE 에러코드: 0x{endCode:X4}");
            return true;
        }, MitsubishiReadTimeoutMs);
    }

    //  미쓰비시 Q시리즈 — 비트 읽기 (bool[] 버전)
    //  PlcService.cs의 공개 ReadBitsAsync/WriteBitAsync 검증 단계가 쓰는 bool[] 형태로,
    //  MitsubishiReadBitsAsWordsAsync(ushort 0/1)의 결과를 bool로 변환만 해서 돌려준다.
    private async Task<bool[]> MitsubishiReadBitsAsync(int start, int count, byte deviceCode)
    {
        ushort[] raw = await MitsubishiReadBitsAsWordsAsync(start, count, deviceCode);
        var result = new bool[raw.Length];
        for (int i = 0; i < raw.Length; i++)
            result[i] = raw[i] != 0;
        return result;
    }

    //  미쓰비시 Q시리즈 — 비트 읽기 (MC Protocol 3E Binary, 서브커맨드 0x0001)
    //  반환값: ushort[] 각 요소가 0(OFF) 또는 1(ON) → treatNonZeroAsOn 로직과 호환
    private async Task<ushort[]> MitsubishiReadBitsAsWordsAsync(int start, int count, byte deviceCode)
    {
        return await WithConnectionAsync(ns => ReadBitsOverConnectionAsync(ns, start, count, deviceCode), MitsubishiReadTimeoutMs);
    }

    //  이미 열려 있는 연결(ns) 위에서 비트 읽기 1회 수행 — ReadWordsOverConnectionAsync의 비트 버전.
    private static async Task<ushort[]> ReadBitsOverConnectionAsync(NetworkStream ns, int start, int count, byte deviceCode)
    {
        byte[] packet = BuildMcBitReadPacket(start, count, deviceCode);
        await ns.WriteAsync(packet);

        byte[] respHdr = new byte[11];
        await ReadFullAsync(ns, respHdr);

        ushort endCode = BitConverter.ToUInt16(respHdr, 9);
        ushort dataLen = BitConverter.ToUInt16(respHdr, 7);
        int bodyLen = dataLen - 2;

        if (endCode != 0)
            throw new Exception($"미쓰비시 BIT READ 에러코드: 0x{endCode:X4}");

        if (bodyLen <= 0)
            return new ushort[count];

        byte[] data = new byte[bodyLen];
        await ReadFullAsync(ns, data);

        // MC Protocol 비트 응답: 2비트가 1바이트에 니블(nibble) 단위로 패킹
        //   상위 nibble = 짝수 인덱스 (0, 2, 4 …) ← 첫 번째 포인트
        //   하위 nibble = 홀수 인덱스 (1, 3, 5 …) ← 두 번째 포인트
        var result = new ushort[count];
        for (int i = 0; i < count; i++)
        {
            int byteIdx = i / 2;
            if (byteIdx >= data.Length) break;
            int nibble = (i % 2 == 0)
                ? ((data[byteIdx] >> 4) & 0x0F)
                : (data[byteIdx] & 0x0F);
            result[i] = (ushort)(nibble != 0 ? 1 : 0);
        }
        return result;
    }

    //  예전엔 X/Y(입출력) 디바이스를 "PLC 화면 표기는 8진수" 관례로 보고 여기서 8진수→10진수
    //  변환을 했었다(X20(8진 라벨)→10진수 16 등, MELSEC FX5 매뉴얼 CGI Object 규칙 근거).
    //  근데 실제 태그 주소가 X04A/Y15A처럼 8진수엔 없는 문자(8,9,A~F)를 쓰는 16진수 블록으로
    //  들어오게 되면서, LiveTagMonitorService.ParseAddressFull 쪽에서 X/Y 주소 문자열을 아예
    //  16진수로 직접 해석해 "프레임에 넣을 최종 값"까지 이미 확정해서 넘겨주도록 바꿨다 —
    //  그래서 여기서는 X/Y도 더 이상 손댈 게 없어 다른 디바이스와 동일하게 그대로 통과시킨다.
    private static int ResolveMitsubishiAddress(int address, byte deviceCode) => address;

    //  미쓰비시 패킷 빌더 — 워드 읽기 (서브커맨드 0x0000)
    private static byte[] BuildMcReadPacket(int startD, int count, byte deviceCode = 0xA8)
    {
        startD = ResolveMitsubishiAddress(startD, deviceCode);
        var commandData = new List<byte>();
        commandData.AddRange(new byte[] { 0x01, 0x04 });  // Command 0x0401 (디바이스 일괄 읽기)
        commandData.AddRange(new byte[] { 0x00, 0x00 });  // Subcommand 0x0000 (워드 단위)
        commandData.Add((byte)(startD & 0xFF));            // 시작 주소 (3바이트, 리틀엔디안)
        commandData.Add((byte)((startD >> 8) & 0xFF));
        commandData.Add((byte)((startD >> 16) & 0xFF));
        commandData.Add(deviceCode);                        // 디바이스 코드 (D=0xA8 등)
        commandData.AddRange(BitConverter.GetBytes((ushort)count));  // 읽을 점수(워드 개수)

        return BuildMcHeader(commandData.ToArray());
    }

    //  미쓰비시 패킷 빌더 — 비트 읽기 (서브커맨드 0x0001)
    private static byte[] BuildMcBitReadPacket(int start, int count, byte deviceCode)
    {
        start = ResolveMitsubishiAddress(start, deviceCode);
        var commandData = new List<byte>();
        commandData.AddRange(new byte[] { 0x01, 0x04 });  // Command 0x0401
        commandData.AddRange(new byte[] { 0x01, 0x00 });  // Subcommand 0x0001 (비트 단위)
        commandData.Add((byte)(start & 0xFF));
        commandData.Add((byte)((start >> 8) & 0xFF));
        commandData.Add((byte)((start >> 16) & 0xFF));
        commandData.Add(deviceCode);
        commandData.AddRange(BitConverter.GetBytes((ushort)count));

        return BuildMcHeader(commandData.ToArray());
    }

    //  미쓰비시 디바이스 코드 테이블 (MC Protocol 3E Binary 기준, Q/iQ-R)
    //  device 문자열(예: "D", "M")을 실제 프로토콜상의 1바이트 디바이스 코드로 변환한다.
    //  타이머/카운터는 래더의 "T10"/"C190" 하나가 프로토콜상으론 접점(TS/CS)·코일(TC/CC)·현재값(TN/CN)
    //  세 디바이스로 나뉜다 — 어느 걸 읽을지는 호출부(EzatBotEndpoints 등)가 정해서 넘긴다.
    private static readonly Dictionary<string, (byte Code, bool IsBit)> MitsubishiDevices = new()
    {
        ["D"]  = (0xA8, false),  // 데이터 레지스터
        ["W"]  = (0xB4, false),  // 링크 레지스터
        ["R"]  = (0xAF, false),  // 파일 레지스터
        ["ZR"] = (0xB0, false),  // 파일 레지스터(연번)
        ["SD"] = (0xA9, false),  // 특수 레지스터
        ["SW"] = (0xB5, false),  // 링크 특수 레지스터
        ["Z"]  = (0xCC, false),  // 인덱스 레지스터
        ["TN"] = (0xC2, false),  // 타이머 현재값
        ["SN"] = (0xC8, false),  // 적산 타이머 현재값 (GX 표기 STN)
        ["CN"] = (0xC5, false),  // 카운터 현재값
        ["M"]  = (0x90, true),   // 내부 릴레이
        ["L"]  = (0x92, true),   // 래치 릴레이
        ["F"]  = (0x93, true),   // 어넌시에이터
        ["V"]  = (0x94, true),   // 에지 릴레이
        ["X"]  = (0x9C, true),   // 입력
        ["Y"]  = (0x9D, true),   // 출력
        ["B"]  = (0xA0, true),   // 링크 릴레이
        ["S"]  = (0x98, true),   // 스텝 릴레이
        ["SM"] = (0x91, true),   // 특수 릴레이
        ["SB"] = (0xA1, true),   // 링크 특수 릴레이
        ["DX"] = (0xA2, true),   // 다이렉트 입력
        ["DY"] = (0xA3, true),   // 다이렉트 출력
        ["TS"] = (0xC1, true),   // 타이머 접점
        ["TC"] = (0xC0, true),   // 타이머 코일
        ["SS"] = (0xC7, true),   // 적산 타이머 접점 (GX 표기 STS)
        ["SC"] = (0xC6, true),   // 적산 타이머 코일 (GX 표기 STC)
        ["CS"] = (0xC4, true),   // 카운터 접점
        ["CC"] = (0xC3, true),   // 카운터 코일
    };

    //  테이블에 없는 디바이스는 기존 동작 그대로 D로 간주한다 — 이미 등록된 태그의 폴링 동작을 바꾸지
    //  않기 위해서다. 새 코드는 IsSupportedMitsubishiDevice로 먼저 걸러서 엉뚱한 D 값을 읽지 않게 한다.
    private static byte GetMitsubishiDeviceCode(string device) =>
        MitsubishiDevices.TryGetValue(device.ToUpperInvariant(), out var d) ? d.Code : (byte)0xA8;

    //  비트 단위 디바이스 여부 (워드 읽기 vs 비트 읽기 분기용) — MitsubishiReadAsync에서 사용
    internal static bool IsMitsubishiBitDevice(string device) =>
        MitsubishiDevices.TryGetValue(device.ToUpperInvariant(), out var d) && d.IsBit;

    internal static bool IsSupportedMitsubishiDevice(string device) =>
        MitsubishiDevices.ContainsKey(device.ToUpperInvariant());

    //  미쓰비시 패킷 빌더 — 워드 쓰기 (서브커맨드 0x0000). deviceCode로 D/W/R 등 임의 워드 디바이스 지정.
    private static byte[] BuildMcWritePacket(int dAddress, ushort value, byte deviceCode = 0xA8)
    {
        dAddress = ResolveMitsubishiAddress(dAddress, deviceCode);
        var commandData = new List<byte>();
        commandData.AddRange(new byte[] { 0x01, 0x14 });  // Command 0x1401 (디바이스 일괄 쓰기)
        commandData.AddRange(new byte[] { 0x00, 0x00 });  // Subcommand 0x0000 (워드 단위)
        commandData.Add((byte)(dAddress & 0xFF));
        commandData.Add((byte)((dAddress >> 8) & 0xFF));
        commandData.Add((byte)((dAddress >> 16) & 0xFF));
        commandData.Add(deviceCode);                        // 디바이스 코드 (D/W/R 등)
        commandData.AddRange(new byte[] { 0x01, 0x00 });  // 쓸 점수: 1워드
        commandData.AddRange(BitConverter.GetBytes(value));

        return BuildMcHeader(commandData.ToArray());
    }

    //  미쓰비시 패킷 빌더 — 비트 쓰기 (서브커맨드 0x0001)
    //  데이터부는 읽기 응답과 같은 니블 패킹 규칙: 짝수 인덱스(첫 포인트)는 상위 니블.
    //  여기서는 항상 1점만 쓰므로 데이터 1바이트의 상위 니블에 ON=0x1/OFF=0x0을 넣는다.
    private static byte[] BuildMcBitWritePacket(int address, byte deviceCode, bool value)
    {
        address = ResolveMitsubishiAddress(address, deviceCode);
        var commandData = new List<byte>();
        commandData.AddRange(new byte[] { 0x01, 0x14 });  // Command 0x1401 (디바이스 일괄 쓰기)
        commandData.AddRange(new byte[] { 0x01, 0x00 });  // Subcommand 0x0001 (비트 단위)
        commandData.Add((byte)(address & 0xFF));
        commandData.Add((byte)((address >> 8) & 0xFF));
        commandData.Add((byte)((address >> 16) & 0xFF));
        commandData.Add(deviceCode);                        // 디바이스 코드 (M/L/X/Y/B 등)
        commandData.AddRange(new byte[] { 0x01, 0x00 });  // 쓸 점수: 1비트
        commandData.Add(value ? (byte)0x10 : (byte)0x00); // 니블 패킹: 1점째 = 상위 니블

        return BuildMcHeader(commandData.ToArray());
    }

    // MC Protocol 3E Binary 공통 헤더 조립 — 서브헤더 + 네트워크/스테이션 번호 + 명령 바디 길이 + 바디
    private static byte[] BuildMcHeader(byte[] commandData)
    {
        ushort dataLength = (ushort)(2 + commandData.Length);   // 감시 타이머(2바이트) + 명령 바디 길이

        var pkt = new List<byte>();
        pkt.AddRange(new byte[] { 0x50, 0x00 });   // 서브헤더 0x0050 (3E프레임)
        pkt.Add(0x00);                              // 네트워크 번호
        pkt.Add(0xFF);                               // PC 번호 (0xFF = 자국)
        pkt.AddRange(new byte[] { 0xFF, 0x03 });   // 요구 대상 모듈 I/O 번호
        pkt.Add(0x00);                              // 요구 대상 모듈국 번호
        pkt.AddRange(BitConverter.GetBytes(dataLength)); // 이후 데이터 길이
        pkt.AddRange(new byte[] { 0x10, 0x00 });   // 감시 타이머 (기본값)
        pkt.AddRange(commandData);                  // 실제 명령 바디 (Command+Subcommand+주소+디바이스+개수)

        return pkt.ToArray();
    }
}
