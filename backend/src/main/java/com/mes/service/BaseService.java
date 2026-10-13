package com.mes.service;

import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.web.multipart.MultipartFile;

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

public interface BaseService {

    PageResponse<User> getUserList(int page, int size, String keyword);

    User createUser(User user);

    User updateUser(Long userId, User user);

    void deleteUser(Long userId);

    List<Vendor> getVendorList(String vendorType, String useYn, String keyword);

    Vendor getVendorById(Long vendorId);

    Vendor createVendor(Vendor vendor);

    Vendor updateVendor(Long vendorId, Vendor vendor);

    void deleteVendors(List<Long> vendorIds);

    List<Product> getProductList(Long vendorId, String useYn, String keyword);

    Product getProductById(Long productId);

    Product createProduct(Product product);

    Product updateProduct(Long productId, Product product);

    void deleteProducts(List<Long> productIds);

    /** slot(1~5)에 이미지를 올린다. 이미 있으면 교체. thumb는 브라우저에서 만든 썸네일(선택). */
    ProductImage uploadProductImage(Long productId, int slot, MultipartFile file, MultipartFile thumb);

    void deleteProductImage(Long productId, Long imageId);

    /** 남겨둘 이미지들의 slot을 한 번에 다시 매긴다 (대표 이미지 변경 등). */
    void reorderProductImages(Long productId, List<ProductImage> slots);

    ProductImage getProductImage(Long imageId);

    Path getProductImagePath(ProductImage image, boolean thumb);

    List<Pattern> getPatternList(Long vendorId, Long productId, String useYn, String keyword);

    Pattern getPatternById(Long patternId);

    Pattern createPattern(Pattern pattern);

    Pattern updatePattern(Long patternId, Pattern pattern);

    void deletePatterns(List<Long> patternIds, String userName);

    List<PatternHist> getPatternHistory(Long patternId);

    List<AuthMenuItem> getAuthMenuItems(Long userId);

    void saveAuthMenuItems(Long userId, List<AuthMenuItem> items);

    PageResponse<LoginHist> getLoginHistList(int page, int size, String keyword);

    User login(LoginRequest request, String clientIp);

    // 설비관리
    List<Equipment> getEquipmentList(String equipStatus, String useYn, String keyword);

    Equipment getEquipmentById(Long equipId);

    Equipment createEquipment(Equipment equipment);

    Equipment updateEquipment(Long equipId, Equipment equipment);

    void deleteEquipments(List<Long> equipIds);

    // 비가동 사유 기준정보
    List<DowntimeReason> getDowntimeReasonList(String reasonType, String useYn);

    DowntimeReason createDowntimeReason(DowntimeReason reason);

    DowntimeReason updateDowntimeReason(Long reasonId, DowntimeReason reason);

    void deleteDowntimeReasons(List<Long> reasonIds);

    // 비가동 내역
    List<Downtime> getDowntimeList(LocalDateTime from, LocalDateTime to, Long equipId, String reasonType, String keyword);

    List<Downtime> createDowntimes(DowntimeRequest request);

    Downtime updateDowntime(Long downtimeId, Downtime downtime);

    void deleteDowntimes(List<Long> downtimeIds);

}
