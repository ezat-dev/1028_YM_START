package com.mes.controller;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.mes.common.response.ApiResponse;
import com.mes.common.response.PageResponse;
import com.mes.domain.base.AuthMenuItem;
import com.mes.domain.base.Downtime;
import com.mes.domain.base.DowntimeReason;
import com.mes.domain.base.DowntimeRequest;
import com.mes.domain.base.Equipment;
import com.mes.domain.base.LoginHist;
import com.mes.domain.base.LoginRequest;
import com.mes.domain.base.Pattern;
import com.mes.domain.base.PatternHist;
import com.mes.domain.base.Product;
import com.mes.domain.base.ProductImage;
import com.mes.domain.base.User;
import com.mes.domain.base.Vendor;
import com.mes.service.BaseService;

/**
 * 기준정보(base) 중분류 REST 엔드포인트.
 *
 * <p>이 프로젝트는 "중분류 1개당 컨트롤러 1개" 구조를 쓰기 때문에, 사용자관리 / 거래처관리 /
 * 제품관리 / 패턴관리 / 사용자권한 / 로그인이력 / 로그인 6개 메뉴·기능이 전부 이 클래스 하나에 모여 있다.
 * 실제 비즈니스 로직은 여기서 처리하지 않고 {@link BaseService}에 위임만 한다(Controller는 얇게 유지).</p>
 *
 * <p>사용자관리 / 거래처관리 / 제품관리 / 패턴관리 / 사용자권한 / 로그인이력 / 로그인 모두 DB까지 붙어 동작한다.</p>
 */
@RestController
@RequestMapping("/api/base")
public class BaseController {

    private final BaseService baseService;

    public BaseController(BaseService baseService) {
        this.baseService = baseService;
    }

    // ===================== 사용자관리 (base_user) =====================

    /**
     * 사용자 목록을 페이지 단위로 조회한다.
     *
     * @param page    조회할 페이지 번호(1부터 시작). 생략 시 1페이지.
     * @param size    페이지당 건수. 생략 시 10건.
     * @param keyword 아이디/이름 부분 검색어. 생략하면 전체 조회.
     * @return 비밀번호는 항상 null로 마스킹된 사용자 목록 + 페이징 정보.
     */
    @GetMapping("/user")
    public ApiResponse<PageResponse<User>> getUserList(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(baseService.getUserList(page, size, keyword));
    }

    /**
     * 사용자를 신규 등록한다.
     *
     * <p>요청 바디의 password는 평문으로 받아 서버에서 BCrypt로 해시한 뒤 저장한다.
     * loginId 중복, 필수값 누락 시 {@link com.mes.common.exception.BusinessException}이 발생하며
     * {@link com.mes.common.exception.GlobalExceptionHandler}가 400 응답으로 변환한다.</p>
     *
     * @param user loginId, password, userName은 필수. deptName/phone/email/useYn은 선택.
     * @return 생성된 사용자(비밀번호 마스킹, 생성된 userId 포함).
     */
    @PostMapping("/user")
    public ApiResponse<User> createUser(@RequestBody User user) {
        return ApiResponse.success(baseService.createUser(user));
    }

    /**
     * 사용자 정보를 수정한다.
     *
     * <p>password 필드를 비워서 보내면(null 또는 빈 문자열) 기존 비밀번호를 그대로 유지하고,
     * 값이 있으면 새 비밀번호로 재해시하여 교체한다.</p>
     *
     * @param userId 수정 대상 사용자 PK (경로 변수)
     * @param user   변경할 값. userId는 경로 값으로 덮어써지므로 바디에 넣어도 무시된다.
     * @return 수정된 사용자(비밀번호 마스킹).
     */
    @PutMapping("/user/{userId}")
    public ApiResponse<User> updateUser(@PathVariable Long userId, @RequestBody User user) {
        return ApiResponse.success(baseService.updateUser(userId, user));
    }

    /**
     * 사용자를 삭제한다. 연결된 권한 부여 이력(base_auth)도 함께 정리한다.
     *
     * @param userId 삭제 대상 사용자 PK
     */
    @DeleteMapping("/user/{userId}")
    public ApiResponse<Void> deleteUser(@PathVariable Long userId) {
        baseService.deleteUser(userId);
        return ApiResponse.success();
    }

    // ===================== 거래처관리 (base_vendor) =====================

    /**
     * 거래처 목록. 많아야 수백 건이라 페이징 없이 전부 내려준다.
     *
     * @param vendorType 매출처/매입처/외주처/겸용. 생략하면 전체.
     * @param useYn      Y/N. 생략하면 전체.
     * @param keyword    거래처명·거래처코드·사업자번호(하이픈 무시) 부분 검색.
     */
    @GetMapping("/vendor")
    public ApiResponse<List<Vendor>> getVendorList(
            @RequestParam(required = false) String vendorType,
            @RequestParam(required = false) String useYn,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(baseService.getVendorList(vendorType, useYn, keyword));
    }

    @GetMapping("/vendor/{vendorId}")
    public ApiResponse<Vendor> getVendor(@PathVariable Long vendorId) {
        return ApiResponse.success(baseService.getVendorById(vendorId));
    }

    /**
     * 거래처 등록. vendorCode를 비워서 보내면 V0001 형식으로 자동 채번한다.
     * 거래처명 누락, 구분 값 오류, 코드·사업자번호 중복이면 400.
     */
    @PostMapping("/vendor")
    public ApiResponse<Vendor> createVendor(@RequestBody Vendor vendor) {
        return ApiResponse.success(baseService.createVendor(vendor));
    }

    /** 거래처 수정. 거래처코드와 등록자는 바뀌지 않는다. */
    @PutMapping("/vendor/{vendorId}")
    public ApiResponse<Vendor> updateVendor(@PathVariable Long vendorId, @RequestBody Vendor vendor) {
        return ApiResponse.success(baseService.updateVendor(vendorId, vendor));
    }

    /** 선택한 거래처들을 삭제한다. 거래가 끊긴 업체는 삭제 대신 사용여부를 N으로 돌리는 것을 권장. */
    @PostMapping("/vendor/delete")
    public ApiResponse<Void> deleteVendors(@RequestBody List<Long> vendorIds) {
        baseService.deleteVendors(vendorIds);
        return ApiResponse.success();
    }

    // ===================== 설비관리 (base_equipment) =====================

    /**
     * 설비 목록.
     *
     * @param equipStatus 가동/정지/고장/점검/유지보수. 생략하면 전체.
     * @param useYn       Y/N. 생략하면 전체.
     * @param keyword     설비코드·설비명·모델명·PLC IP 부분 검색.
     */
    @GetMapping("/equipment")
    public ApiResponse<List<Equipment>> getEquipmentList(
            @RequestParam(required = false) String equipStatus,
            @RequestParam(required = false) String useYn,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(baseService.getEquipmentList(equipStatus, useYn, keyword));
    }

    @GetMapping("/equipment/{equipId}")
    public ApiResponse<Equipment> getEquipment(@PathVariable Long equipId) {
        return ApiResponse.success(baseService.getEquipmentById(equipId));
    }

    /** 설비 등록. 설비코드 필수(중복 불가), 설비명 필수, PLC IP는 IPv4 형식. */
    @PostMapping("/equipment")
    public ApiResponse<Equipment> createEquipment(@RequestBody Equipment equipment) {
        return ApiResponse.success(baseService.createEquipment(equipment));
    }

    /** 설비 수정. 설비코드와 등록자는 바뀌지 않는다. */
    @PutMapping("/equipment/{equipId}")
    public ApiResponse<Equipment> updateEquipment(@PathVariable Long equipId, @RequestBody Equipment equipment) {
        return ApiResponse.success(baseService.updateEquipment(equipId, equipment));
    }

    /** 선택한 설비 삭제. 비가동 내역이 있는 설비는 삭제 대신 사용여부를 N으로. */
    @PostMapping("/equipment/delete")
    public ApiResponse<Void> deleteEquipments(@RequestBody List<Long> equipIds) {
        baseService.deleteEquipments(equipIds);
        return ApiResponse.success();
    }

    // ===================== 비가동관리 (base_downtime_reason / base_downtime) =====================

    /** 비가동 사유 기준정보 목록 (정렬 순서대로). 각 사유가 쓰인 건수(useCount)를 같이 준다. */
    @GetMapping("/downtime-reason")
    public ApiResponse<List<DowntimeReason>> getDowntimeReasonList(
            @RequestParam(required = false) String reasonType,
            @RequestParam(required = false) String useYn) {
        return ApiResponse.success(baseService.getDowntimeReasonList(reasonType, useYn));
    }

    /** 사유 등록. reasonCode를 비우면 DR001 형식으로 자동 채번. */
    @PostMapping("/downtime-reason")
    public ApiResponse<DowntimeReason> createDowntimeReason(@RequestBody DowntimeReason reason) {
        return ApiResponse.success(baseService.createDowntimeReason(reason));
    }

    @PutMapping("/downtime-reason/{reasonId}")
    public ApiResponse<DowntimeReason> updateDowntimeReason(@PathVariable Long reasonId, @RequestBody DowntimeReason reason) {
        return ApiResponse.success(baseService.updateDowntimeReason(reasonId, reason));
    }

    /** 사유 삭제. 비가동 내역에 쓰인 사유는 삭제 대신 사용여부를 N으로. */
    @PostMapping("/downtime-reason/delete")
    public ApiResponse<Void> deleteDowntimeReasons(@RequestBody List<Long> reasonIds) {
        baseService.deleteDowntimeReasons(reasonIds);
        return ApiResponse.success();
    }

    /**
     * 비가동 내역 — 기간과 겹치는 것(진행 중 포함), 최근 시작 순.
     *
     * @param from       기간 시작(포함), 예: 2026-10-01T00:00:00
     * @param to         기간 끝(미포함)
     * @param equipId    설비. 생략하면 전체.
     * @param reasonType 계획정지/고장정지/대기/기타. 생략하면 전체.
     * @param keyword    사유명·메모·등록자 부분 검색.
     */
    @GetMapping("/downtime")
    public ApiResponse<List<Downtime>> getDowntimeList(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(required = false) Long equipId,
            @RequestParam(required = false) String reasonType,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(baseService.getDowntimeList(from, to, equipId, reasonType, keyword));
    }

    /** 비가동 수동 등록 — 설비를 여러 대 고르면 설비마다 1건씩 같은 내용으로 저장한다. */
    @PostMapping("/downtime")
    public ApiResponse<List<Downtime>> createDowntimes(@RequestBody DowntimeRequest request) {
        return ApiResponse.success(baseService.createDowntimes(request));
    }

    /** 비가동 1건 수정(설비·사유·시간·메모). */
    @PutMapping("/downtime/{downtimeId}")
    public ApiResponse<Downtime> updateDowntime(@PathVariable Long downtimeId, @RequestBody Downtime downtime) {
        return ApiResponse.success(baseService.updateDowntime(downtimeId, downtime));
    }

    @PostMapping("/downtime/delete")
    public ApiResponse<Void> deleteDowntimes(@RequestBody List<Long> downtimeIds) {
        baseService.deleteDowntimes(downtimeIds);
        return ApiResponse.success();
    }

    // ===================== 제품관리 (base_product) =====================

    /**
     * 제품 목록. 각 제품의 images(slot 순)까지 함께 내려준다.
     *
     * @param vendorId 거래처. 생략하면 전체.
     * @param useYn    Y/N. 생략하면 전체.
     * @param keyword  품번·품명·제품코드 부분 검색.
     */
    @GetMapping("/product")
    public ApiResponse<List<Product>> getProductList(
            @RequestParam(required = false) Long vendorId,
            @RequestParam(required = false) String useYn,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(baseService.getProductList(vendorId, useYn, keyword));
    }

    @GetMapping("/product/{productId}")
    public ApiResponse<Product> getProduct(@PathVariable Long productId) {
        return ApiResponse.success(baseService.getProductById(productId));
    }

    /** 제품 등록. productCode를 비우면 P0001 형식으로 자동 채번. 같은 거래처의 품번 중복이면 400. */
    @PostMapping("/product")
    public ApiResponse<Product> createProduct(@RequestBody Product product) {
        return ApiResponse.success(baseService.createProduct(product));
    }

    /** 제품 수정. 제품코드와 등록자는 바뀌지 않는다. 이미지는 아래 이미지 API로 따로 다룬다. */
    @PutMapping("/product/{productId}")
    public ApiResponse<Product> updateProduct(@PathVariable Long productId, @RequestBody Product product) {
        return ApiResponse.success(baseService.updateProduct(productId, product));
    }

    /** 선택한 제품 삭제. 이미지 행과 D:/ym_img/product/{id} 폴더도 같이 지운다. */
    @PostMapping("/product/delete")
    public ApiResponse<Void> deleteProducts(@RequestBody List<Long> productIds) {
        baseService.deleteProducts(productIds);
        return ApiResponse.success();
    }

    /** slot(1~5)에 이미지 업로드(있으면 교체). thumb는 브라우저에서 만든 JPEG 썸네일. */
    @PostMapping("/product/{productId}/images")
    public ApiResponse<ProductImage> uploadProductImage(
            @PathVariable Long productId,
            @RequestParam int slot,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "thumb", required = false) MultipartFile thumb) {
        return ApiResponse.success(baseService.uploadProductImage(productId, slot, file, thumb));
    }

    @DeleteMapping("/product/{productId}/images/{imageId}")
    public ApiResponse<Void> deleteProductImage(@PathVariable Long productId, @PathVariable Long imageId) {
        baseService.deleteProductImage(productId, imageId);
        return ApiResponse.success();
    }

    /** 이미지 칸 다시 매기기. body: [{imageId, slot}, ...] */
    @PutMapping("/product/{productId}/images/order")
    public ApiResponse<Void> reorderProductImages(@PathVariable Long productId, @RequestBody List<ProductImage> slots) {
        baseService.reorderProductImages(productId, slots);
        return ApiResponse.success();
    }

    /**
     * 이미지 파일. thumb=true면 썸네일(없으면 원본), mode=download면 원래 파일명으로 내려받기.
     * 교체하면 imageId가 새로 생기므로 같은 주소의 내용은 바뀌지 않는다 — 브라우저 캐시를 길게 둔다.
     */
    @GetMapping("/product/image/{imageId}")
    public ResponseEntity<Resource> getProductImage(
            @PathVariable Long imageId,
            @RequestParam(defaultValue = "false") boolean thumb,
            @RequestParam(defaultValue = "preview") String mode) throws IOException {
        ProductImage image = baseService.getProductImage(imageId);
        Path path = baseService.getProductImagePath(image, thumb);
        String contentType = Files.probeContentType(path);
        ContentDisposition disposition = "download".equals(mode)
                ? ContentDisposition.attachment().filename(image.getOrigFileName(), StandardCharsets.UTF_8).build()
                : ContentDisposition.inline().build();
        return ResponseEntity.ok()
                .contentType(contentType != null ? MediaType.parseMediaType(contentType) : MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePrivate())
                .body(new FileSystemResource(path));
    }

    // ===================== 패턴관리 (base_pattern) =====================

    /**
     * 패턴 목록. 제품·거래처 정보(품번, 품명, 규격, 재질, 경도 기준)는 조인해서 같이 내려준다.
     *
     * @param vendorId  거래처. 생략하면 전체.
     * @param productId 제품. 생략하면 전체.
     * @param useYn     Y/N. 생략하면 전체.
     * @param keyword   품번·품명·패턴코드·패턴명 부분 검색.
     */
    @GetMapping("/pattern")
    public ApiResponse<List<Pattern>> getPatternList(
            @RequestParam(required = false) Long vendorId,
            @RequestParam(required = false) Long productId,
            @RequestParam(required = false) String useYn,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(baseService.getPatternList(vendorId, productId, useYn, keyword));
    }

    @GetMapping("/pattern/{patternId}")
    public ApiResponse<Pattern> getPattern(@PathVariable Long patternId) {
        return ApiResponse.success(baseService.getPatternById(patternId));
    }

    /** 패턴 등록. patternCode를 비우면 PT0001 형식으로 자동 채번. 등록 이력이 남는다. */
    @PostMapping("/pattern")
    public ApiResponse<Pattern> createPattern(@RequestBody Pattern pattern) {
        return ApiResponse.success(baseService.createPattern(pattern));
    }

    /** 패턴 수정. 바뀐 항목마다 변경 이력(전 값 → 후 값, updUserName)이 남는다. */
    @PutMapping("/pattern/{patternId}")
    public ApiResponse<Pattern> updatePattern(@PathVariable Long patternId, @RequestBody Pattern pattern) {
        return ApiResponse.success(baseService.updatePattern(patternId, pattern));
    }

    /** 선택한 패턴 삭제. 이력은 지우지 않고 '삭제' 줄을 하나 더 남긴다. */
    @PostMapping("/pattern/delete")
    public ApiResponse<Void> deletePatterns(
            @RequestBody List<Long> patternIds,
            @RequestParam(required = false) String userName) {
        baseService.deletePatterns(patternIds, userName);
        return ApiResponse.success();
    }

    /** 패턴 변경 이력 (최신 순). */
    @GetMapping("/pattern/{patternId}/history")
    public ApiResponse<List<PatternHist>> getPatternHistory(@PathVariable Long patternId) {
        return ApiResponse.success(baseService.getPatternHistory(patternId));
    }

    // ===================== 사용자권한 (base_auth) =====================

    /**
     * 특정 사용자의 "메뉴별 CRUD 권한부여" 전체 그리드를 조회한다.
     *
     * <p>메뉴 목록 자체는 DB가 아니라 {@code menu} 모듈의 하드코딩된 트리(35개 메뉴)에서 가져오고,
     * 여기에 base_auth에 저장된 실제 권한값을 병합해서 돌려준다. 즉 응답은 항상 35행이며,
     * 한 번도 권한을 부여받은 적 없는 메뉴는 4개 플래그가 모두 false로 채워진다.</p>
     *
     * @param userId 권한을 조회할 사용자 PK
     * @return 카테고리/메뉴명/경로 + C·R·U·D 4개 boolean 플래그로 구성된 35행 리스트
     */
    @GetMapping("/auth/{userId}")
    public ApiResponse<List<AuthMenuItem>> getAuthMenuItems(@PathVariable Long userId) {
        return ApiResponse.success(baseService.getAuthMenuItems(userId));
    }

    /**
     * 특정 사용자의 메뉴별 권한 그리드를 통째로 저장한다.
     *
     * <p>부분 업데이트가 아니라 "해당 사용자의 기존 권한 전부 삭제 후 전달받은 리스트로 재삽입"하는
     * 방식이라, 화면에서 편집한 35행 전체를 그대로 보내야 한다(체크 안 한 항목도 포함해서 전송).</p>
     *
     * @param userId 권한을 저장할 사용자 PK
     * @param items  저장할 권한 그리드 전체(보통 {@link #getAuthMenuItems}로 받은 걸 수정해서 그대로 재전송)
     */
    @PutMapping("/auth/{userId}")
    public ApiResponse<Void> saveAuthMenuItems(@PathVariable Long userId, @RequestBody List<AuthMenuItem> items) {
        baseService.saveAuthMenuItems(userId, items);
        return ApiResponse.success();
    }

    // ===================== 로그인이력 (base_login_hist) =====================

    /**
     * 로그인 시도 이력을 페이지 단위로 조회한다(성공/실패 모두 포함).
     * 이력 row 자체는 이 API가 아니라 {@link #login} 호출 시 서버에서 자동으로 쌓인다.
     */
    @GetMapping("/loginHist")
    public ApiResponse<PageResponse<LoginHist>> getLoginHistList(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(baseService.getLoginHistList(page, size, keyword));
    }

    // ===================== 로그인 =====================

    /**
     * 로그인 화면에서 호출하는 로그인 처리 API.
     *
     * <p>아이디 존재 여부 → 계정 사용 여부(useYn) → 비밀번호 일치 여부 순서로 검증하고,
     * 성공/실패와 무관하게 매 시도마다 {@code base_login_hist}에 이력을 1건 남긴다.
     * 실패 시 {@link com.mes.common.exception.BusinessException}으로 400 응답이 나가며,
     * 어떤 항목이 틀렸는지는 보안상 응답 메시지에 노출하지 않고(이력 테이블의 failReason에만 기록)
     * 클라이언트에는 공통 문구("아이디 또는 비밀번호가 일치하지 않습니다.")만 내려준다.</p>
     *
     * <p>세션/토큰 발급은 아직 없다(1단계 범위 밖). 로그인 성공 시 사용자 정보만 반환하고,
     * 프론트엔드가 이를 브라우저에 보관해 "로그인한 것처럼" 화면을 유지하는 수준이다.</p>
     *
     * @param request       loginId, password
     * @param servletRequest 클라이언트 IP 추출용(로그인 이력에 기록)
     * @return 로그인 성공한 사용자 정보(비밀번호 마스킹)
     */
    @PostMapping("/login")
    public ApiResponse<User> login(@RequestBody LoginRequest request, HttpServletRequest servletRequest) {
        String clientIp = servletRequest.getRemoteAddr();
        return ApiResponse.success(baseService.login(request, clientIp));
    }

}
