package com.mes.dao;

import java.time.LocalDateTime;
import java.util.List;

import com.mes.domain.base.Auth;
import com.mes.domain.base.AuthMenuItem;
import com.mes.domain.base.Downtime;
import com.mes.domain.base.DowntimeReason;
import com.mes.domain.base.Equipment;
import com.mes.domain.base.LoginHist;
import com.mes.domain.base.Pattern;
import com.mes.domain.base.PatternHist;
import com.mes.domain.base.Product;
import com.mes.domain.base.ProductImage;
import com.mes.domain.base.User;
import com.mes.domain.base.Vendor;

/**
 * 기준정보 전체 메뉴의 데이터 접근 계약.
 */
public interface BaseDao {

    List<User> selectUserList(int offset, int size, String keyword);

    long selectUserCount(String keyword);

    User selectUserById(Long userId);

    User selectUserByLoginId(String loginId);

    void insertUser(User user);

    void updateUser(User user);

    void deleteUser(Long userId);

    List<Vendor> selectVendorList(String vendorType, String useYn, String keyword);

    Vendor selectVendorById(Long vendorId);

    Vendor selectVendorByCode(String vendorCode);

    /** 같은 사업자번호를 쓰는 다른 거래처(없으면 null). excludeId는 수정 중인 자기 자신. */
    Vendor selectVendorByBizNo(String bizNo, Long excludeId);

    int selectVendorMaxAutoCodeNo();

    void insertVendor(Vendor vendor);

    void updateVendor(Vendor vendor);

    void deleteVendor(Long vendorId);

    List<Product> selectProductList(Long vendorId, String useYn, String keyword);

    Product selectProductById(Long productId);

    Product selectProductByCode(String productCode);

    /** 같은 거래처에 같은 품번을 쓰는 다른 제품(없으면 null). excludeId는 수정 중인 자기 자신. */
    Product selectProductByVendorPart(Long vendorId, String partNo, Long excludeId);

    int selectProductMaxAutoCodeNo();

    long countProductsByVendorIds(List<Long> vendorIds);

    void insertProduct(Product product);

    void updateProduct(Product product);

    void deleteProduct(Long productId);

    List<ProductImage> selectProductImagesByProductIds(List<Long> productIds);

    ProductImage selectProductImageById(Long imageId);

    ProductImage selectProductImageBySlot(Long productId, int slot);

    void insertProductImage(ProductImage image);

    void updateProductImageSlot(Long imageId, int slot);

    void deleteProductImage(Long imageId);

    List<Pattern> selectPatternList(Long vendorId, Long productId, String useYn, String keyword);

    Pattern selectPatternById(Long patternId);

    Pattern selectPatternByCode(String patternCode);

    int selectPatternMaxAutoCodeNo();

    long countPatternsByProductIds(List<Long> productIds);

    long countHardnessSpecsByProductIds(List<Long> productIds);

    void insertPattern(Pattern pattern);

    void updatePattern(Pattern pattern);

    void deletePattern(Long patternId);

    void insertPatternHist(PatternHist hist);

    List<PatternHist> selectPatternHist(Long patternId);

    List<Auth> selectAuthByUserId(Long userId);

    void deleteAuthByUserId(Long userId);

    void insertAuthList(Long userId, List<AuthMenuItem> items);

    List<LoginHist> selectLoginHistList(int offset, int size, String keyword);

    long selectLoginHistCount(String keyword);

    void insertLoginHist(LoginHist loginHist);

    // 설비관리
    List<Equipment> selectEquipmentList(String equipStatus, String useYn, String keyword);

    Equipment selectEquipmentById(Long equipId);

    Equipment selectEquipmentByCode(String equipCode);

    void insertEquipment(Equipment equipment);

    void updateEquipment(Equipment equipment);

    void deleteEquipment(Long equipId);

    // 비가동 사유 기준정보
    List<DowntimeReason> selectDowntimeReasonList(String reasonType, String useYn);

    DowntimeReason selectDowntimeReasonById(Long reasonId);

    DowntimeReason selectDowntimeReasonByCode(String reasonCode);

    int selectDowntimeReasonMaxAutoCodeNo();

    void insertDowntimeReason(DowntimeReason reason);

    void updateDowntimeReason(DowntimeReason reason);

    void deleteDowntimeReason(Long reasonId);

    // 비가동 내역
    List<Downtime> selectDowntimeList(LocalDateTime from, LocalDateTime to, Long equipId, String reasonType, String keyword);

    Downtime selectDowntimeById(Long downtimeId);

    long countDowntimeOverlap(Long equipId, LocalDateTime startDt, LocalDateTime endDt, Long excludeId);

    long countDowntimeByEquipIds(List<Long> equipIds);

    long countDowntimeByReasonIds(List<Long> reasonIds);

    void insertDowntime(Downtime downtime);

    void updateDowntime(Downtime downtime);

    void deleteDowntime(Long downtimeId);
}
