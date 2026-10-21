package com.mes.service.impl;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.mes.common.exception.BusinessException;
import com.mes.common.exception.ErrorCode;
import com.mes.common.response.PageResponse;
import com.mes.common.util.Paging;
import com.mes.dao.BaseDao;
import com.mes.domain.base.Auth;
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
import com.mes.menu.domain.MenuGroup;
import com.mes.menu.domain.MenuItem;
import com.mes.menu.service.MenuService;
import com.mes.service.BaseService;

@Service
@Transactional(readOnly = true)
public class BaseServiceImpl implements BaseService {

    private static final Set<String> VENDOR_TYPES = Set.of("매출처", "매입처", "외주처", "겸용");
    private static final Set<String> EQUIP_STATUSES = Set.of("가동", "정지", "고장", "점검", "유지보수");
    private static final Set<String> DOWNTIME_TYPES = Set.of("계획정지", "고장정지", "대기", "기타");
    private static final String IPV4 = "^((25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1?\\d?\\d)$";
    private static final Set<String> PRICE_UNITS = Set.of("KG", "EA");
    private static final Set<String> HARDNESS_UNITS = Set.of("HRC", "HV", "HB", "HRB");
    private static final Set<String> IMAGE_EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp", "gif");
    private static final int MAX_PRODUCT_IMAGES = 5;
    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;
    private static final Set<String> SPEED_UNITS = Set.of("Hz", "mm/min", "m/h");
    private static final BigDecimal MAX_FURNACE_TEMP = new BigDecimal("1500");
    private static final BigDecimal MAX_CP = new BigDecimal("3");

    @Value("${app.product-image-dir}")
    private String productImageRoot;

    private final BaseDao baseDao;
    private final MenuService menuService;
    private final PasswordEncoder passwordEncoder;

    public BaseServiceImpl(BaseDao baseDao, MenuService menuService, PasswordEncoder passwordEncoder) {
        this.baseDao = baseDao;
        this.menuService = menuService;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public PageResponse<User> getUserList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<User> content = baseDao.selectUserList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        content.forEach(u -> u.setPassword(null));
        long totalElements = baseDao.selectUserCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    @Transactional
    public User createUser(User user) {
        if (user.getLoginId() == null || user.getLoginId().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "아이디를 입력해주세요.");
        }
        if (user.getPassword() == null || user.getPassword().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "비밀번호를 입력해주세요.");
        }
        if (user.getUserName() == null || user.getUserName().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이름을 입력해주세요.");
        }
        if (baseDao.selectUserByLoginId(user.getLoginId()) != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 사용 중인 아이디입니다.");
        }
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        if (user.getUseYn() == null || user.getUseYn().isBlank()) {
            user.setUseYn("Y");
        }
        baseDao.insertUser(user);
        User created = baseDao.selectUserById(user.getUserId());
        created.setPassword(null);
        return created;
    }

    @Override
    @Transactional
    public User updateUser(Long userId, User user) {
        User existing = baseDao.selectUserById(userId);
        if (existing == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 사용자입니다.");
        }
        if (user.getUserName() == null || user.getUserName().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이름을 입력해주세요.");
        }
        user.setUserId(userId);
        if (user.getPassword() != null && !user.getPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(user.getPassword()));
        } else {
            user.setPassword(null);
        }
        baseDao.updateUser(user);
        User updated = baseDao.selectUserById(userId);
        updated.setPassword(null);
        return updated;
    }

    @Override
    @Transactional
    public void deleteUser(Long userId) {
        if (baseDao.selectUserById(userId) == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 사용자입니다.");
        }
        baseDao.deleteAuthByUserId(userId);
        baseDao.deleteUser(userId);
    }

    // ===================== 거래처관리 (base_vendor) =====================

    @Override
    public List<Vendor> getVendorList(String vendorType, String useYn, String keyword) {
        return baseDao.selectVendorList(vendorType, useYn, keyword);
    }

    @Override
    public Vendor getVendorById(Long vendorId) {
        Vendor vendor = baseDao.selectVendorById(vendorId);
        if (vendor == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 거래처입니다.");
        }
        return vendor;
    }

    @Override
    @Transactional
    public Vendor createVendor(Vendor vendor) {
        normalizeVendor(vendor);
        validateVendor(vendor, null);

        if (vendor.getVendorCode().isEmpty()) {
            vendor.setVendorCode(String.format("V%04d", baseDao.selectVendorMaxAutoCodeNo() + 1));
        } else if (baseDao.selectVendorByCode(vendor.getVendorCode()) != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 사용 중인 거래처코드입니다.");
        }
        if (vendor.getUseYn().isEmpty()) {
            vendor.setUseYn("Y");
        }
        baseDao.insertVendor(vendor);
        return baseDao.selectVendorById(vendor.getVendorId());
    }

    @Override
    @Transactional
    public Vendor updateVendor(Long vendorId, Vendor vendor) {
        getVendorById(vendorId);
        vendor.setVendorId(vendorId);
        normalizeVendor(vendor);
        validateVendor(vendor, vendorId);
        if (vendor.getUseYn().isEmpty()) {
            vendor.setUseYn("Y");
        }
        baseDao.updateVendor(vendor);
        return baseDao.selectVendorById(vendorId);
    }

    @Override
    @Transactional
    public void deleteVendors(List<Long> vendorIds) {
        if (vendorIds == null || vendorIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "삭제할 거래처를 선택해주세요.");
        }
        if (baseDao.countProductsByVendorIds(vendorIds) > 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    "제품이 등록된 거래처는 삭제할 수 없습니다. 사용여부를 '미사용'으로 바꿔주세요.");
        }
        vendorIds.forEach(baseDao::deleteVendor);
    }

    /** 컬럼이 전부 NOT NULL DEFAULT '' 라서 null을 빈 문자열로 맞추고 앞뒤 공백을 지운다. */
    private void normalizeVendor(Vendor v) {
        v.setVendorCode(trim(v.getVendorCode()).toUpperCase());
        v.setVendorName(trim(v.getVendorName()));
        v.setVendorType(trim(v.getVendorType()));
        v.setCeoName(trim(v.getCeoName()));
        v.setBizNo(formatBizNo(trim(v.getBizNo())));
        v.setBizType(trim(v.getBizType()));
        v.setBizItem(trim(v.getBizItem()));
        v.setTel(trim(v.getTel()));
        v.setFax(trim(v.getFax()));
        v.setZipCode(trim(v.getZipCode()));
        v.setAddress(trim(v.getAddress()));
        v.setAddressDetail(trim(v.getAddressDetail()));
        v.setManagerName(trim(v.getManagerName()));
        v.setManagerPhone(trim(v.getManagerPhone()));
        v.setManagerEmail(trim(v.getManagerEmail()));
        v.setRemark(trim(v.getRemark()));
        v.setUseYn(trim(v.getUseYn()).toUpperCase());
        v.setRegUserName(trim(v.getRegUserName()));
    }

    private void validateVendor(Vendor v, Long excludeId) {
        if (v.getVendorName().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "거래처명을 입력해주세요.");
        }
        if (v.getVendorType().isEmpty()) {
            v.setVendorType("매출처");
        } else if (!VENDOR_TYPES.contains(v.getVendorType())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "구분은 매출처/매입처/외주처/겸용 중 하나여야 합니다.");
        }
        if (!v.getBizNo().isEmpty()) {
            if (!v.getBizNo().matches("\\d{3}-\\d{2}-\\d{5}")) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "사업자번호는 숫자 10자리로 입력해주세요.");
            }
            Vendor dup = baseDao.selectVendorByBizNo(v.getBizNo(), excludeId);
            if (dup != null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                        "이미 등록된 사업자번호입니다. (" + dup.getVendorCode() + " " + dup.getVendorName() + ")");
            }
        }
        if (!v.getUseYn().isEmpty() && !"Y".equals(v.getUseYn()) && !"N".equals(v.getUseYn())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "사용여부는 Y 또는 N이어야 합니다.");
        }
    }

    /** 숫자 10자리면 000-00-00000 으로 맞춘다. 그 외 형식은 그대로 두고 검증에서 걸러낸다. */
    private static String formatBizNo(String raw) {
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() == 10) {
            return digits.substring(0, 3) + "-" + digits.substring(3, 5) + "-" + digits.substring(5);
        }
        return raw;
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    // ===================== 제품관리 (base_product / base_product_image) =====================

    @Override
    public List<Product> getProductList(Long vendorId, String useYn, String keyword) {
        List<Product> products = baseDao.selectProductList(vendorId, useYn, keyword);
        attachImages(products);
        return products;
    }

    @Override
    public Product getProductById(Long productId) {
        Product product = baseDao.selectProductById(productId);
        if (product == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 제품입니다.");
        }
        attachImages(List.of(product));
        return product;
    }

    @Override
    @Transactional
    public Product createProduct(Product product) {
        normalizeProduct(product);
        validateProduct(product, null);

        if (product.getProductCode().isEmpty()) {
            product.setProductCode(String.format("P%04d", baseDao.selectProductMaxAutoCodeNo() + 1));
        } else if (baseDao.selectProductByCode(product.getProductCode()) != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 사용 중인 제품코드입니다.");
        }
        baseDao.insertProduct(product);
        return getProductById(product.getProductId());
    }

    @Override
    @Transactional
    public Product updateProduct(Long productId, Product product) {
        Product old = getProductById(productId);
        product.setProductId(productId);
        normalizeProduct(product);
        validateProduct(product, productId);
        // 경도 규격·CHECK SHEET·측정 기록이 품번으로 이어져 있어 품번은 바꾸지 않는다
        if (!old.getPartNo().equals(product.getPartNo()) && baseDao.countHardnessSpecsByProductIds(List.of(productId)) > 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    "경도 규격이 등록된 제품은 품번을 바꿀 수 없습니다. 새 제품으로 등록해주세요.");
        }
        baseDao.updateProduct(product);
        return getProductById(productId);
    }

    @Override
    @Transactional
    public void deleteProducts(List<Long> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "삭제할 제품을 선택해주세요.");
        }
        if (baseDao.countPatternsByProductIds(productIds) > 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    "패턴이 등록된 제품은 삭제할 수 없습니다. 사용여부를 '미사용'으로 바꿔주세요.");
        }
        if (baseDao.countHardnessSpecsByProductIds(productIds) > 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    "경도 규격이 등록된 제품은 삭제할 수 없습니다. 사용여부를 '미사용'으로 바꿔주세요.");
        }
        for (Long id : productIds) {
            baseDao.deleteProduct(id); // 이미지 행은 FK ON DELETE CASCADE로 같이 지워진다
            deleteDirectoryQuietly(productImageDir(id));
        }
    }

    @Override
    @Transactional
    public ProductImage uploadProductImage(Long productId, int slot, MultipartFile file, MultipartFile thumb) {
        getProductById(productId);
        if (slot < 1 || slot > MAX_PRODUCT_IMAGES) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미지 칸은 1~" + MAX_PRODUCT_IMAGES + "번입니다.");
        }
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미지 파일이 없습니다.");
        }
        String original = file.getOriginalFilename() == null ? "image" : file.getOriginalFilename();
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.') + 1).toLowerCase() : "";
        if (!IMAGE_EXTENSIONS.contains(ext)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미지는 jpg, png, webp, gif 파일만 올릴 수 있습니다.");
        }
        if (file.getSize() > MAX_IMAGE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미지는 한 장에 10MB까지 올릴 수 있습니다.");
        }

        Path dir = productImageDir(productId);
        String base = UUID.randomUUID().toString().replace("-", "");
        String fileName = base + "." + ext;
        String thumbName = (thumb != null && !thumb.isEmpty()) ? base + "_t.jpg" : "";
        try {
            Files.createDirectories(dir);
            file.transferTo(dir.resolve(fileName));
            if (!thumbName.isEmpty()) {
                thumb.transferTo(dir.resolve(thumbName));
            }
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "이미지 저장에 실패했습니다.");
        }

        // 같은 칸에 이미 있던 이미지는 교체 — 행을 지운 뒤 새로 넣고, 옛 파일은 마지막에 지운다
        ProductImage old = baseDao.selectProductImageBySlot(productId, slot);
        if (old != null) {
            baseDao.deleteProductImage(old.getImageId());
        }
        ProductImage image = new ProductImage();
        image.setProductId(productId);
        image.setSlot(slot);
        image.setOrigFileName(original);
        image.setFileName(fileName);
        image.setThumbFileName(thumbName);
        image.setFileSize(file.getSize());
        baseDao.insertProductImage(image);
        if (old != null) {
            deleteImageFilesQuietly(old);
        }
        return baseDao.selectProductImageById(image.getImageId());
    }

    @Override
    @Transactional
    public void deleteProductImage(Long productId, Long imageId) {
        ProductImage image = baseDao.selectProductImageById(imageId);
        if (image == null || !image.getProductId().equals(productId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 이미지입니다.");
        }
        baseDao.deleteProductImage(imageId);
        deleteImageFilesQuietly(image);
    }

    @Override
    @Transactional
    public void reorderProductImages(Long productId, List<ProductImage> slots) {
        if (slots == null || slots.isEmpty()) {
            return;
        }
        Set<Integer> used = new HashSet<>();
        for (ProductImage s : slots) {
            ProductImage image = baseDao.selectProductImageById(s.getImageId());
            if (image == null || !image.getProductId().equals(productId)) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 이미지입니다.");
            }
            if (s.getSlot() == null || s.getSlot() < 1 || s.getSlot() > MAX_PRODUCT_IMAGES || !used.add(s.getSlot())) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미지 칸 번호가 올바르지 않습니다.");
            }
        }
        // (product_id, slot) 유니크라 서로 칸을 맞바꾸면 중간에 충돌한다 — 먼저 음수 임시 칸으로 비켜놓고 다시 넣는다
        for (ProductImage s : slots) {
            baseDao.updateProductImageSlot(s.getImageId(), -s.getSlot());
        }
        for (ProductImage s : slots) {
            baseDao.updateProductImageSlot(s.getImageId(), s.getSlot());
        }
    }

    @Override
    public ProductImage getProductImage(Long imageId) {
        ProductImage image = baseDao.selectProductImageById(imageId);
        if (image == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 이미지입니다.");
        }
        return image;
    }

    @Override
    public Path getProductImagePath(ProductImage image, boolean thumb) {
        String name = thumb && !image.getThumbFileName().isEmpty() ? image.getThumbFileName() : image.getFileName();
        // DB 값만 쓰지만 혹시 모를 경로 조작(../)은 파일명만 남겨 막는다
        Path path = productImageDir(image.getProductId()).resolve(Paths.get(name).getFileName());
        if (!Files.exists(path)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "이미지 파일을 찾을 수 없습니다.");
        }
        return path;
    }

    private void attachImages(List<Product> products) {
        if (products.isEmpty()) {
            return;
        }
        Map<Long, List<ProductImage>> byProduct = new HashMap<>();
        List<Long> ids = products.stream().map(Product::getProductId).toList();
        for (ProductImage image : baseDao.selectProductImagesByProductIds(ids)) {
            byProduct.computeIfAbsent(image.getProductId(), k -> new ArrayList<>()).add(image);
        }
        products.forEach(p -> p.setImages(byProduct.getOrDefault(p.getProductId(), List.of())));
    }

    private void normalizeProduct(Product p) {
        p.setProductCode(trim(p.getProductCode()).toUpperCase());
        p.setPartNo(trim(p.getPartNo()));
        p.setProductName(trim(p.getProductName()));
        p.setMaterial(trim(p.getMaterial()).toUpperCase());
        p.setSpec(trim(p.getSpec()));
        p.setPriceUnit(trim(p.getPriceUnit()).toUpperCase());
        p.setSurfaceHardUnit(trim(p.getSurfaceHardUnit()).toUpperCase());
        p.setCoreHardUnit(trim(p.getCoreHardUnit()).toUpperCase());
        p.setRemark(trim(p.getRemark()));
        p.setUseYn(trim(p.getUseYn()).toUpperCase());
        p.setRegUserName(trim(p.getRegUserName()));
        if (p.getPriceUnit().isEmpty()) {
            p.setPriceUnit("KG");
        }
        if (p.getSurfaceHardUnit().isEmpty()) {
            p.setSurfaceHardUnit("HRC");
        }
        if (p.getCoreHardUnit().isEmpty()) {
            p.setCoreHardUnit("HRC");
        }
        if (p.getUseYn().isEmpty()) {
            p.setUseYn("Y");
        }
    }

    private void validateProduct(Product p, Long excludeId) {
        if (p.getVendorId() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "거래처를 선택해주세요.");
        }
        if (baseDao.selectVendorById(p.getVendorId()) == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "존재하지 않는 거래처입니다.");
        }
        if (p.getPartNo().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "품번을 입력해주세요.");
        }
        if (p.getProductName().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "품명을 입력해주세요.");
        }
        Product dup = baseDao.selectProductByVendorPart(p.getVendorId(), p.getPartNo(), excludeId);
        if (dup != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    "같은 거래처에 이미 등록된 품번입니다. (" + dup.getProductCode() + " " + dup.getProductName() + ")");
        }
        if (!PRICE_UNITS.contains(p.getPriceUnit())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "단가 기준은 kg당 또는 개당이어야 합니다.");
        }
        if (!HARDNESS_UNITS.contains(p.getSurfaceHardUnit()) || !HARDNESS_UNITS.contains(p.getCoreHardUnit())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "경도 단위는 HRC/HV/HB/HRB 중 하나여야 합니다.");
        }
        if (!"Y".equals(p.getUseYn()) && !"N".equals(p.getUseYn())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "사용여부는 Y 또는 N이어야 합니다.");
        }
        requireNonNegative(p.getChargeWeightKg(), "장입량");
        requireNonNegative(p.getUnitWeightG(), "중량");
        requireNonNegative(p.getUnitPrice(), "단가");
        requireRange(p.getSurfaceHardMin(), p.getSurfaceHardMax(), "표면경도");
        requireRange(p.getCoreHardMin(), p.getCoreHardMax(), "심부경도");
    }

    private static void requireNonNegative(BigDecimal v, String label) {
        if (v != null && v.signum() < 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, label + "에는 0 이상의 값을 입력해주세요.");
        }
    }

    private static void requireRange(BigDecimal min, BigDecimal max, String label) {
        requireNonNegative(min, label + " 하한");
        requireNonNegative(max, label + " 상한");
        if (min != null && max != null && min.compareTo(max) > 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, label + " 하한이 상한보다 큽니다.");
        }
    }

    private Path productImageDir(Long productId) {
        return Paths.get(productImageRoot, "product", String.valueOf(productId));
    }

    private void deleteImageFilesQuietly(ProductImage image) {
        Path dir = productImageDir(image.getProductId());
        try {
            Files.deleteIfExists(dir.resolve(image.getFileName()));
            if (image.getThumbFileName() != null && !image.getThumbFileName().isEmpty()) {
                Files.deleteIfExists(dir.resolve(image.getThumbFileName()));
            }
        } catch (IOException ignored) {
            // 파일 정리 실패는 DB 처리를 되돌릴 이유가 아니다 — 남은 파일은 디스크에만 남는다
        }
    }

    private static void deleteDirectoryQuietly(Path dir) {
        if (!Files.exists(dir)) {
            return;
        }
        try (var paths = Files.walk(dir)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // 위와 같은 이유로 무시
                }
            });
        } catch (IOException ignored) {
            // 위와 같은 이유로 무시
        }
    }

    // ===================== 패턴관리 (base_pattern / base_pattern_hist) =====================

    /** 변경 이력에 남길 항목: 화면에 보이는 이름 → 값. 순서대로 이력 줄이 쌓인다. */
    private static final List<Map.Entry<String, Function<Pattern, Object>>> PATTERN_HIST_FIELDS = List.of(
            Map.entry("패턴명", Pattern::getPatternName),
            Map.entry("제품", pt -> pt.getPartNo() == null ? null : pt.getPartNo() + " " + pt.getProductName()),
            Map.entry("장입량(kg)", Pattern::getChargeWeightKg),
            Map.entry("퀜칭로 1존", Pattern::getQ1Zone),
            Map.entry("퀜칭로 2존", Pattern::getQ2Zone),
            Map.entry("퀜칭로 3존", Pattern::getQ3Zone),
            Map.entry("퀜칭로 4존", Pattern::getQ4Zone),
            Map.entry("퀜칭로 5존", Pattern::getQ5Zone),
            Map.entry("퀜칭로 속도", Pattern::getQuenchSpeed),
            Map.entry("CP(%)", Pattern::getCp),
            Map.entry("템퍼링로 1존", Pattern::getT1Zone),
            Map.entry("템퍼링로 2존", Pattern::getT2Zone),
            Map.entry("템퍼링로 3존", Pattern::getT3Zone),
            Map.entry("템퍼링로 4존", Pattern::getT4Zone),
            Map.entry("템퍼링로 5존", Pattern::getT5Zone),
            Map.entry("템퍼링로 속도", Pattern::getTemperSpeed),
            Map.entry("속도 단위", Pattern::getSpeedUnit),
            Map.entry("사용여부", pt -> "N".equals(pt.getUseYn()) ? "미사용" : "사용"),
            Map.entry("비고", Pattern::getRemark));

    @Override
    public List<Pattern> getPatternList(Long vendorId, Long productId, String useYn, String keyword) {
        return baseDao.selectPatternList(vendorId, productId, useYn, keyword);
    }

    @Override
    public Pattern getPatternById(Long patternId) {
        Pattern pattern = baseDao.selectPatternById(patternId);
        if (pattern == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 패턴입니다.");
        }
        return pattern;
    }

    @Override
    @Transactional
    public Pattern createPattern(Pattern pattern) {
        normalizePattern(pattern);
        validatePattern(pattern);
        if (pattern.getPatternCode().isEmpty()) {
            pattern.setPatternCode(String.format("PT%04d", baseDao.selectPatternMaxAutoCodeNo() + 1));
        } else if (baseDao.selectPatternByCode(pattern.getPatternCode()) != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 사용 중인 패턴코드입니다.");
        }
        baseDao.insertPattern(pattern);
        Pattern created = getPatternById(pattern.getPatternId());
        writePatternHist(created, "등록", "", "", "", pattern.getRegUserName());
        return created;
    }

    @Override
    @Transactional
    public Pattern updatePattern(Long patternId, Pattern pattern) {
        Pattern before = getPatternById(patternId);
        pattern.setPatternId(patternId);
        normalizePattern(pattern);
        validatePattern(pattern);
        baseDao.updatePattern(pattern);
        Pattern after = getPatternById(patternId);

        // 바뀐 칸만 한 줄씩 남긴다 (값을 같은 형식의 문자열로 바꿔 비교 — 860 과 860.0 을 같은 값으로)
        for (Map.Entry<String, Function<Pattern, Object>> f : PATTERN_HIST_FIELDS) {
            String b = histValue(f.getValue().apply(before));
            String a = histValue(f.getValue().apply(after));
            if (!b.equals(a)) {
                writePatternHist(after, "수정", f.getKey(), b, a, pattern.getUpdUserName());
            }
        }
        return after;
    }

    @Override
    @Transactional
    public void deletePatterns(List<Long> patternIds, String userName) {
        if (patternIds == null || patternIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "삭제할 패턴을 선택해주세요.");
        }
        for (Long id : patternIds) {
            Pattern pattern = getPatternById(id);
            baseDao.deletePattern(id);
            // 지운 패턴도 무엇이었는지 알 수 있게 요약을 남긴다
            writePatternHist(pattern, "삭제", "", pattern.getPartNo() + " " + pattern.getPatternName(), "", trim(userName));
        }
    }

    @Override
    public List<PatternHist> getPatternHistory(Long patternId) {
        return baseDao.selectPatternHist(patternId);
    }

    private void writePatternHist(Pattern pattern, String action, String label, String before, String after, String userName) {
        PatternHist h = new PatternHist();
        h.setPatternId(pattern.getPatternId());
        h.setPatternCode(pattern.getPatternCode());
        h.setAction(action);
        h.setFieldLabel(label);
        h.setBeforeValue(cut(before, 200));
        h.setAfterValue(cut(after, 200));
        h.setUserName(trim(userName));
        baseDao.insertPatternHist(h);
    }

    private static String histValue(Object v) {
        if (v == null) {
            return "";
        }
        if (v instanceof BigDecimal d) {
            return d.stripTrailingZeros().toPlainString();
        }
        return v.toString().trim();
    }

    private static String cut(String s, int max) {
        return s == null ? "" : (s.length() > max ? s.substring(0, max) : s);
    }

    private void normalizePattern(Pattern p) {
        p.setPatternCode(trim(p.getPatternCode()).toUpperCase());
        p.setPatternName(trim(p.getPatternName()));
        p.setSpeedUnit(trim(p.getSpeedUnit()));
        p.setRemark(trim(p.getRemark()));
        p.setUseYn(trim(p.getUseYn()).toUpperCase());
        p.setRegUserName(trim(p.getRegUserName()));
        p.setUpdUserName(trim(p.getUpdUserName()));
        if (p.getSpeedUnit().isEmpty()) {
            p.setSpeedUnit("Hz");
        }
        if (p.getUseYn().isEmpty()) {
            p.setUseYn("Y");
        }
    }

    private void validatePattern(Pattern p) {
        if (p.getProductId() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "제품을 선택해주세요.");
        }
        if (baseDao.selectProductById(p.getProductId()) == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "존재하지 않는 제품입니다.");
        }
        if (!SPEED_UNITS.contains(p.getSpeedUnit())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "속도 단위는 Hz, mm/min, m/h 중 하나여야 합니다.");
        }
        if (!"Y".equals(p.getUseYn()) && !"N".equals(p.getUseYn())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "사용여부는 Y 또는 N이어야 합니다.");
        }
        requireNonNegative(p.getChargeWeightKg(), "장입량");
        BigDecimal[] temps = {p.getQ1Zone(), p.getQ2Zone(), p.getQ3Zone(), p.getQ4Zone(), p.getQ5Zone(),
                p.getT1Zone(), p.getT2Zone(), p.getT3Zone(), p.getT4Zone(), p.getT5Zone()};
        for (BigDecimal t : temps) {
            if (t != null && (t.signum() < 0 || t.compareTo(MAX_FURNACE_TEMP) > 0)) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "존 온도는 0~1,500℃ 사이로 입력해주세요.");
            }
        }
        if (p.getCp() != null && (p.getCp().signum() < 0 || p.getCp().compareTo(MAX_CP) > 0)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "CP는 0~3% 사이로 입력해주세요.");
        }
        requireNonNegative(p.getQuenchSpeed(), "퀜칭로 속도");
        requireNonNegative(p.getTemperSpeed(), "템퍼링로 속도");
    }

    @Override
    public List<AuthMenuItem> getAuthMenuItems(Long userId) {
        if (baseDao.selectUserById(userId) == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 사용자입니다.");
        }
        Map<String, Auth> grantByPath = new HashMap<>();
        for (Auth auth : baseDao.selectAuthByUserId(userId)) {
            grantByPath.put(auth.getMenuPath(), auth);
        }

        List<AuthMenuItem> items = new ArrayList<>();
        for (MenuGroup group : menuService.getMenuTree()) {
            for (MenuItem menu : group.getMenus()) {
                AuthMenuItem item = new AuthMenuItem(group.getCategory(), menu.getName(), menu.getPath());
                Auth grant = grantByPath.get(menu.getPath());
                if (grant != null) {
                    item.setCanCreate(grant.isCanCreate());
                    item.setCanRead(grant.isCanRead());
                    item.setCanUpdate(grant.isCanUpdate());
                    item.setCanDelete(grant.isCanDelete());
                }
                items.add(item);
            }
        }
        return items;
    }

    @Override
    @Transactional
    public void saveAuthMenuItems(Long userId, List<AuthMenuItem> items) {
        if (baseDao.selectUserById(userId) == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 사용자입니다.");
        }
        baseDao.deleteAuthByUserId(userId);
        baseDao.insertAuthList(userId, items);
    }

    @Override
    public PageResponse<LoginHist> getLoginHistList(int page, int size, String keyword) {
        int pageNum = Paging.normalizePage(page);
        int pageSize = Paging.normalizeSize(size);
        List<LoginHist> content = baseDao.selectLoginHistList(Paging.offset(pageNum, pageSize), pageSize, keyword);
        long totalElements = baseDao.selectLoginHistCount(keyword);
        return PageResponse.of(content, pageNum, pageSize, totalElements);
    }

    @Override
    @Transactional(noRollbackFor = BusinessException.class)
    public User login(LoginRequest request, String clientIp) {
        User user = baseDao.selectUserByLoginId(request.getLoginId());

        String failReason = null;
        if (user == null) {
            failReason = "존재하지 않는 아이디";
        } else if (!"Y".equals(user.getUseYn())) {
            failReason = "비활성화된 계정";
        } else if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            failReason = "비밀번호 불일치";
        }
        boolean success = failReason == null;

        LoginHist hist = new LoginHist();
        hist.setLoginId(request.getLoginId());
        hist.setUserName(user != null ? user.getUserName() : null);
        hist.setLoginIp(clientIp);
        hist.setSuccessYn(success ? "Y" : "N");
        hist.setFailReason(failReason);
        baseDao.insertLoginHist(hist);

        if (!success) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "아이디 또는 비밀번호가 일치하지 않습니다.");
        }
        user.setPassword(null);
        return user;
    }

    // ===================== 설비관리 (base_equipment) =====================

    @Override
    public List<Equipment> getEquipmentList(String equipStatus, String useYn, String keyword) {
        return baseDao.selectEquipmentList(equipStatus, useYn, keyword);
    }

    @Override
    public Equipment getEquipmentById(Long equipId) {
        Equipment equipment = baseDao.selectEquipmentById(equipId);
        if (equipment == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 설비입니다.");
        }
        return equipment;
    }

    @Override
    @Transactional
    public Equipment createEquipment(Equipment equipment) {
        normalizeEquipment(equipment);
        if (equipment.getEquipCode().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비코드를 입력해주세요.");
        }
        if (baseDao.selectEquipmentByCode(equipment.getEquipCode()) != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 사용 중인 설비코드입니다.");
        }
        validateEquipment(equipment);
        baseDao.insertEquipment(equipment);
        return baseDao.selectEquipmentById(equipment.getEquipId());
    }

    @Override
    @Transactional
    public Equipment updateEquipment(Long equipId, Equipment equipment) {
        getEquipmentById(equipId);
        equipment.setEquipId(equipId);
        normalizeEquipment(equipment);
        validateEquipment(equipment);
        baseDao.updateEquipment(equipment);
        return baseDao.selectEquipmentById(equipId);
    }

    @Override
    @Transactional
    public void deleteEquipments(List<Long> equipIds) {
        if (equipIds == null || equipIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "삭제할 설비를 선택해주세요.");
        }
        if (baseDao.countDowntimeByEquipIds(equipIds) > 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    "비가동 내역이 있는 설비는 삭제할 수 없습니다. 사용여부를 '미사용'으로 바꿔주세요.");
        }
        equipIds.forEach(baseDao::deleteEquipment);
    }

    private void normalizeEquipment(Equipment e) {
        e.setEquipCode(trim(e.getEquipCode()).toUpperCase());
        e.setEquipName(trim(e.getEquipName()));
        e.setEquipType(trim(e.getEquipType()));
        e.setMaker(trim(e.getMaker()));
        e.setModelName(trim(e.getModelName()));
        e.setManagerName(trim(e.getManagerName()));
        e.setEquipStatus(trim(e.getEquipStatus()));
        e.setPlcModel(trim(e.getPlcModel()));
        e.setPlcIp(trim(e.getPlcIp()));
        e.setPlcProtocol(trim(e.getPlcProtocol()));
        e.setRemark(trim(e.getRemark()));
        e.setUseYn(trim(e.getUseYn()).toUpperCase());
        e.setRegUserName(trim(e.getRegUserName()));
        if (e.getEquipStatus().isEmpty()) {
            e.setEquipStatus("가동");
        }
        if (e.getUseYn().isEmpty()) {
            e.setUseYn("Y");
        }
    }

    private void validateEquipment(Equipment e) {
        if (e.getEquipName().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비명을 입력해주세요.");
        }
        if (!EQUIP_STATUSES.contains(e.getEquipStatus())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비상태는 가동/정지/고장/점검/유지보수 중 하나여야 합니다.");
        }
        if (!e.getPlcIp().isEmpty() && !e.getPlcIp().matches(IPV4)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "PLC IP 형식이 올바르지 않습니다. (예: 192.168.10.11)");
        }
        if (e.getInstallDate() != null && e.getStartDate() != null && e.getStartDate().isBefore(e.getInstallDate())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "가동 개시일은 설치일보다 빠를 수 없습니다.");
        }
        if (!"Y".equals(e.getUseYn()) && !"N".equals(e.getUseYn())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "사용여부는 Y 또는 N이어야 합니다.");
        }
    }

    // ===================== 비가동 사유 기준정보 (base_downtime_reason) =====================

    @Override
    public List<DowntimeReason> getDowntimeReasonList(String reasonType, String useYn) {
        return baseDao.selectDowntimeReasonList(reasonType, useYn);
    }

    @Override
    @Transactional
    public DowntimeReason createDowntimeReason(DowntimeReason reason) {
        normalizeReason(reason);
        String[] who = resolveUser(reason.getRegUserId(), reason.getRegUserName());
        reason.setRegUserId(who[0]);
        reason.setRegUserName(who[1]);
        validateReason(reason);
        if (reason.getReasonCode().isEmpty()) {
            reason.setReasonCode(String.format("DR%03d", baseDao.selectDowntimeReasonMaxAutoCodeNo() + 1));
        } else if (baseDao.selectDowntimeReasonByCode(reason.getReasonCode()) != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 사용 중인 사유코드입니다.");
        }
        baseDao.insertDowntimeReason(reason);
        return baseDao.selectDowntimeReasonById(reason.getReasonId());
    }

    @Override
    @Transactional
    public DowntimeReason updateDowntimeReason(Long reasonId, DowntimeReason reason) {
        if (baseDao.selectDowntimeReasonById(reasonId) == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 비가동 사유입니다.");
        }
        reason.setReasonId(reasonId);
        normalizeReason(reason);
        validateReason(reason);
        String[] who = resolveUser(reason.getUpdUserId(), reason.getUpdUserName());
        reason.setUpdUserId(who[0]);
        reason.setUpdUserName(who[1]);
        baseDao.updateDowntimeReason(reason);
        return baseDao.selectDowntimeReasonById(reasonId);
    }

    @Override
    @Transactional
    public void deleteDowntimeReasons(List<Long> reasonIds) {
        if (reasonIds == null || reasonIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "삭제할 사유를 선택해주세요.");
        }
        if (baseDao.countDowntimeByReasonIds(reasonIds) > 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    "비가동 내역에 쓰인 사유는 삭제할 수 없습니다. 사용여부를 '미사용'으로 바꿔주세요.");
        }
        reasonIds.forEach(baseDao::deleteDowntimeReason);
    }

    private void normalizeReason(DowntimeReason r) {
        r.setReasonCode(trim(r.getReasonCode()).toUpperCase());
        r.setReasonName(trim(r.getReasonName()));
        r.setReasonType(trim(r.getReasonType()));
        String g = trim(r.getReasonGroup());
        r.setReasonGroup(g.isEmpty() ? null : (g.length() > 30 ? g.substring(0, 30) : g));
        r.setRemark(trim(r.getRemark()));
        r.setUseYn(trim(r.getUseYn()).toUpperCase());
        r.setRegUserName(trim(r.getRegUserName()));
        r.setRegUserId(trim(r.getRegUserId()));
        r.setUpdUserId(trim(r.getUpdUserId()));
        r.setUpdUserName(trim(r.getUpdUserName()));
        if (r.getReasonType().isEmpty()) {
            r.setReasonType("계획정지");
        }
        if (r.getUseYn().isEmpty()) {
            r.setUseYn("Y");
        }
        if (r.getSortOrder() == null) {
            r.setSortOrder(0);
        }
    }

    private void validateReason(DowntimeReason r) {
        if (r.getReasonName().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "사유명을 입력해주세요.");
        }
        if (!DOWNTIME_TYPES.contains(r.getReasonType())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "구분은 계획정지/고장정지/대기/기타 중 하나여야 합니다.");
        }
        if (!"Y".equals(r.getUseYn()) && !"N".equals(r.getUseYn())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "사용여부는 Y 또는 N이어야 합니다.");
        }
    }

    // ===================== 비가동 내역 (base_downtime) =====================

    @Override
    public List<Downtime> getDowntimeList(LocalDateTime from, LocalDateTime to, Long equipId, String reasonType, String keyword) {
        return baseDao.selectDowntimeList(from, to, equipId, trim(reasonType), trim(keyword));
    }

    /** 고른 설비마다 같은 내용으로 1건씩 등록한다. 한 대라도 시간이 겹치면 전부 등록하지 않는다. */
    @Override
    @Transactional
    public List<Downtime> createDowntimes(DowntimeRequest request) {
        List<Long> equipIds = request.getEquipIds() == null ? List.of()
                : request.getEquipIds().stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (equipIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "설비를 하나 이상 선택해주세요.");
        }
        Downtime base = new Downtime();
        base.setReasonId(request.getReasonId());
        base.setStartDt(request.getStartDt());
        base.setEndDt(request.getEndDt());
        base.setMemo(trim(request.getMemo()));
        validateDowntime(base);

        String[] who = resolveUser(request.getRegUserId(), request.getRegUserName());
        List<Downtime> created = new java.util.ArrayList<>();
        for (Long equipId : equipIds) {
            Equipment equipment = getEquipmentById(equipId);
            if (baseDao.countDowntimeOverlap(equipId, base.getStartDt(), base.getEndDt(), null) > 0) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                        equipment.getEquipCode() + "에 같은 시간대의 비가동이 이미 등록되어 있습니다.");
            }
            Downtime d = new Downtime();
            d.setEquipId(equipId);
            d.setReasonId(base.getReasonId());
            d.setStartDt(base.getStartDt());
            d.setEndDt(base.getEndDt());
            d.setMemo(base.getMemo());
            d.setSource("MANUAL");
            d.setRegUserId(who[0]);
            d.setRegUserName(who[1]);
            baseDao.insertDowntime(d);
            created.add(baseDao.selectDowntimeById(d.getDowntimeId()));
        }
        return created;
    }

    @Override
    @Transactional
    public Downtime updateDowntime(Long downtimeId, Downtime downtime) {
        Downtime current = baseDao.selectDowntimeById(downtimeId);
        if (current == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "존재하지 않는 비가동 내역입니다.");
        }
        requireNotSheet(current);
        downtime.setDowntimeId(downtimeId);
        downtime.setMemo(trim(downtime.getMemo()));
        String[] who = resolveUser(downtime.getUpdUserId(), downtime.getUpdUserName());
        downtime.setUpdUserId(who[0]);
        downtime.setUpdUserName(who[1]);
        if (downtime.getEquipId() == null) {
            downtime.setEquipId(current.getEquipId());
        }
        Equipment equipment = getEquipmentById(downtime.getEquipId());
        validateDowntime(downtime);
        if (baseDao.countDowntimeOverlap(downtime.getEquipId(), downtime.getStartDt(), downtime.getEndDt(), downtimeId) > 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    equipment.getEquipCode() + "에 같은 시간대의 비가동이 이미 등록되어 있습니다.");
        }
        baseDao.updateDowntime(downtime);
        return baseDao.selectDowntimeById(downtimeId);
    }

    @Override
    @Transactional
    public void deleteDowntimes(List<Long> downtimeIds) {
        if (downtimeIds == null || downtimeIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "삭제할 비가동 내역을 선택해주세요.");
        }
        for (Long id : downtimeIds) {
            Downtime d = baseDao.selectDowntimeById(id);
            if (d != null) {
                requireNotSheet(d);
            }
        }
        downtimeIds.forEach(baseDao::deleteDowntime);
    }

    /** CHECK SHEET에서 생긴 비가동은 CHECK SHEET 행에서만 고친다(한쪽만 바뀌지 않게) */
    private static void requireNotSheet(Downtime d) {
        if ("SHEET".equals(d.getSource())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER,
                    "CHECK SHEET에서 입력한 비가동입니다. CHECK SHEET 행에서 고쳐주세요.");
        }
    }

    /**
     * 등록·수정한 사람 — 로그인 ID로 사용자를 찾아 이름은 DB 값을 쓴다(화면이 보낸 이름은 ID로 못 찾을 때만).
     * @return [로그인 ID, 이름]
     */
    private String[] resolveUser(String loginId, String fallbackName) {
        String id = trim(loginId);
        String name = trim(fallbackName);
        if (!id.isEmpty()) {
            User u = baseDao.selectUserByLoginId(id);
            if (u != null && u.getUserName() != null && !u.getUserName().isBlank()) {
                name = u.getUserName();
            }
        }
        return new String[] { id, name };
    }

    private void validateDowntime(Downtime d) {
        if (d.getReasonId() == null || baseDao.selectDowntimeReasonById(d.getReasonId()) == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "비가동 사유를 선택해주세요.");
        }
        if (d.getStartDt() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "시작 시각을 입력해주세요.");
        }
        if (d.getEndDt() != null && !d.getEndDt().isAfter(d.getStartDt())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "종료 시각은 시작 시각보다 뒤여야 합니다.");
        }
        if (d.getStartDt().isAfter(LocalDateTime.now().plusMinutes(1))) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "시작 시각이 현재보다 뒤일 수 없습니다.");
        }
    }

}
