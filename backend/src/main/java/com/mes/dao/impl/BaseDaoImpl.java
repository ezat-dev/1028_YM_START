package com.mes.dao.impl;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.stereotype.Repository;

import com.mes.dao.BaseDao;
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

@Repository
public class BaseDaoImpl implements BaseDao {

    private final SqlSessionTemplate sqlSession;

    public BaseDaoImpl(SqlSessionTemplate sqlSession) {
        this.sqlSession = sqlSession;
    }

    @Override
    public List<User> selectUserList(int offset, int size, String keyword) {
        return sqlSession.selectList("UserMapper.selectList", params(offset, size, keyword));
    }

    @Override
    public long selectUserCount(String keyword) {
        Long count = sqlSession.selectOne("UserMapper.selectCount", params(0, 0, keyword));
        return count == null ? 0L : count;
    }

    @Override
    public User selectUserById(Long userId) {
        return sqlSession.selectOne("UserMapper.selectById", userId);
    }

    @Override
    public User selectUserByLoginId(String loginId) {
        return sqlSession.selectOne("UserMapper.selectByLoginId", loginId);
    }

    @Override
    public void insertUser(User user) {
        sqlSession.insert("UserMapper.insert", user);
    }

    @Override
    public void updateUser(User user) {
        sqlSession.update("UserMapper.update", user);
    }

    @Override
    public void deleteUser(Long userId) {
        sqlSession.delete("UserMapper.delete", userId);
    }

    @Override
    public List<Vendor> selectVendorList(String vendorType, String useYn, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("vendorType", vendorType);
        p.put("useYn", useYn);
        p.put("keyword", keyword);
        return sqlSession.selectList("VendorMapper.selectList", p);
    }

    @Override
    public Vendor selectVendorById(Long vendorId) {
        return sqlSession.selectOne("VendorMapper.selectById", vendorId);
    }

    @Override
    public Vendor selectVendorByCode(String vendorCode) {
        return sqlSession.selectOne("VendorMapper.selectByCode", vendorCode);
    }

    @Override
    public Vendor selectVendorByBizNo(String bizNo, Long excludeId) {
        Map<String, Object> p = new HashMap<>();
        p.put("bizNo", bizNo);
        p.put("excludeId", excludeId);
        return sqlSession.selectOne("VendorMapper.selectByBizNo", p);
    }

    @Override
    public int selectVendorMaxAutoCodeNo() {
        Integer max = sqlSession.selectOne("VendorMapper.selectMaxAutoCodeNo");
        return max == null ? 0 : max;
    }

    @Override
    public void insertVendor(Vendor vendor) {
        sqlSession.insert("VendorMapper.insert", vendor);
    }

    @Override
    public void updateVendor(Vendor vendor) {
        sqlSession.update("VendorMapper.update", vendor);
    }

    @Override
    public void deleteVendor(Long vendorId) {
        sqlSession.delete("VendorMapper.delete", vendorId);
    }

    @Override
    public List<Product> selectProductList(Long vendorId, String useYn, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("vendorId", vendorId);
        p.put("useYn", useYn);
        p.put("keyword", keyword);
        return sqlSession.selectList("ProductMapper.selectList", p);
    }

    @Override
    public Product selectProductById(Long productId) {
        return sqlSession.selectOne("ProductMapper.selectById", productId);
    }

    @Override
    public Product selectProductByCode(String productCode) {
        return sqlSession.selectOne("ProductMapper.selectByCode", productCode);
    }

    @Override
    public Product selectProductByVendorPart(Long vendorId, String partNo, Long excludeId) {
        Map<String, Object> p = new HashMap<>();
        p.put("vendorId", vendorId);
        p.put("partNo", partNo);
        p.put("excludeId", excludeId);
        return sqlSession.selectOne("ProductMapper.selectByVendorPart", p);
    }

    @Override
    public int selectProductMaxAutoCodeNo() {
        Integer max = sqlSession.selectOne("ProductMapper.selectMaxAutoCodeNo");
        return max == null ? 0 : max;
    }

    @Override
    public long countProductsByVendorIds(List<Long> vendorIds) {
        Long count = sqlSession.selectOne("ProductMapper.countByVendorIds", vendorIds);
        return count == null ? 0L : count;
    }

    @Override
    public void insertProduct(Product product) {
        sqlSession.insert("ProductMapper.insert", product);
    }

    @Override
    public void updateProduct(Product product) {
        sqlSession.update("ProductMapper.update", product);
    }

    @Override
    public void deleteProduct(Long productId) {
        sqlSession.delete("ProductMapper.delete", productId);
    }

    @Override
    public List<ProductImage> selectProductImagesByProductIds(List<Long> productIds) {
        return sqlSession.selectList("ProductMapper.selectImagesByProductIds", productIds);
    }

    @Override
    public ProductImage selectProductImageById(Long imageId) {
        return sqlSession.selectOne("ProductMapper.selectImageById", imageId);
    }

    @Override
    public ProductImage selectProductImageBySlot(Long productId, int slot) {
        Map<String, Object> p = new HashMap<>();
        p.put("productId", productId);
        p.put("slot", slot);
        return sqlSession.selectOne("ProductMapper.selectImageBySlot", p);
    }

    @Override
    public void insertProductImage(ProductImage image) {
        sqlSession.insert("ProductMapper.insertImage", image);
    }

    @Override
    public void updateProductImageSlot(Long imageId, int slot) {
        Map<String, Object> p = new HashMap<>();
        p.put("imageId", imageId);
        p.put("slot", slot);
        sqlSession.update("ProductMapper.updateImageSlot", p);
    }

    @Override
    public void deleteProductImage(Long imageId) {
        sqlSession.delete("ProductMapper.deleteImage", imageId);
    }

    @Override
    public List<Pattern> selectPatternList(Long vendorId, Long productId, String useYn, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("vendorId", vendorId);
        p.put("productId", productId);
        p.put("useYn", useYn);
        p.put("keyword", keyword);
        return sqlSession.selectList("PatternMapper.selectList", p);
    }

    @Override
    public Pattern selectPatternById(Long patternId) {
        return sqlSession.selectOne("PatternMapper.selectById", patternId);
    }

    @Override
    public Pattern selectPatternByCode(String patternCode) {
        return sqlSession.selectOne("PatternMapper.selectByCode", patternCode);
    }

    @Override
    public int selectPatternMaxAutoCodeNo() {
        Integer max = sqlSession.selectOne("PatternMapper.selectMaxAutoCodeNo");
        return max == null ? 0 : max;
    }

    @Override
    public long countPatternsByProductIds(List<Long> productIds) {
        Long count = sqlSession.selectOne("PatternMapper.countByProductIds", productIds);
        return count == null ? 0L : count;
    }

    @Override
    public void insertPattern(Pattern pattern) {
        sqlSession.insert("PatternMapper.insert", pattern);
    }

    @Override
    public void updatePattern(Pattern pattern) {
        sqlSession.update("PatternMapper.update", pattern);
    }

    @Override
    public void deletePattern(Long patternId) {
        sqlSession.delete("PatternMapper.delete", patternId);
    }

    @Override
    public void insertPatternHist(PatternHist hist) {
        sqlSession.insert("PatternMapper.insertHist", hist);
    }

    @Override
    public List<PatternHist> selectPatternHist(Long patternId) {
        return sqlSession.selectList("PatternMapper.selectHistByPatternId", patternId);
    }

    @Override
    public List<Auth> selectAuthByUserId(Long userId) {
        return sqlSession.selectList("AuthMapper.selectByUserId", userId);
    }

    @Override
    public void deleteAuthByUserId(Long userId) {
        sqlSession.delete("AuthMapper.deleteByUserId", userId);
    }

    @Override
    public void insertAuthList(Long userId, List<AuthMenuItem> items) {
        if (items == null || items.isEmpty()) {
            return;
        }
        Map<String, Object> p = new HashMap<>();
        p.put("userId", userId);
        p.put("items", items);
        sqlSession.insert("AuthMapper.insertBatch", p);
    }

    @Override
    public List<LoginHist> selectLoginHistList(int offset, int size, String keyword) {
        return sqlSession.selectList("LoginHistMapper.selectList", params(offset, size, keyword));
    }

    @Override
    public long selectLoginHistCount(String keyword) {
        Long count = sqlSession.selectOne("LoginHistMapper.selectCount", params(0, 0, keyword));
        return count == null ? 0L : count;
    }

    @Override
    public void insertLoginHist(LoginHist loginHist) {
        sqlSession.insert("LoginHistMapper.insert", loginHist);
    }

    // ===================== 설비관리 (base_equipment) =====================

    @Override
    public List<Equipment> selectEquipmentList(String equipStatus, String useYn, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("equipStatus", equipStatus);
        p.put("useYn", useYn);
        p.put("keyword", keyword);
        return sqlSession.selectList("EquipmentMapper.selectList", p);
    }

    @Override
    public Equipment selectEquipmentById(Long equipId) {
        return sqlSession.selectOne("EquipmentMapper.selectById", equipId);
    }

    @Override
    public Equipment selectEquipmentByCode(String equipCode) {
        return sqlSession.selectOne("EquipmentMapper.selectByCode", equipCode);
    }

    @Override
    public void insertEquipment(Equipment equipment) {
        sqlSession.insert("EquipmentMapper.insert", equipment);
    }

    @Override
    public void updateEquipment(Equipment equipment) {
        sqlSession.update("EquipmentMapper.update", equipment);
    }

    @Override
    public void deleteEquipment(Long equipId) {
        sqlSession.delete("EquipmentMapper.delete", equipId);
    }

    // ===================== 비가동 사유 (base_downtime_reason) =====================

    @Override
    public List<DowntimeReason> selectDowntimeReasonList(String reasonType, String useYn) {
        Map<String, Object> p = new HashMap<>();
        p.put("reasonType", reasonType);
        p.put("useYn", useYn);
        return sqlSession.selectList("DowntimeMapper.selectReasonList", p);
    }

    @Override
    public DowntimeReason selectDowntimeReasonById(Long reasonId) {
        return sqlSession.selectOne("DowntimeMapper.selectReasonById", reasonId);
    }

    @Override
    public DowntimeReason selectDowntimeReasonByCode(String reasonCode) {
        return sqlSession.selectOne("DowntimeMapper.selectReasonByCode", reasonCode);
    }

    @Override
    public int selectDowntimeReasonMaxAutoCodeNo() {
        Integer max = sqlSession.selectOne("DowntimeMapper.selectReasonMaxAutoCodeNo");
        return max == null ? 0 : max;
    }

    @Override
    public void insertDowntimeReason(DowntimeReason reason) {
        sqlSession.insert("DowntimeMapper.insertReason", reason);
    }

    @Override
    public void updateDowntimeReason(DowntimeReason reason) {
        sqlSession.update("DowntimeMapper.updateReason", reason);
    }

    @Override
    public void deleteDowntimeReason(Long reasonId) {
        sqlSession.delete("DowntimeMapper.deleteReason", reasonId);
    }

    // ===================== 비가동 내역 (base_downtime) =====================

    @Override
    public List<Downtime> selectDowntimeList(LocalDateTime from, LocalDateTime to, Long equipId, String reasonType, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("from", from);
        p.put("to", to);
        p.put("equipId", equipId);
        p.put("reasonType", reasonType);
        p.put("keyword", keyword);
        return sqlSession.selectList("DowntimeMapper.selectList", p);
    }

    @Override
    public Downtime selectDowntimeById(Long downtimeId) {
        return sqlSession.selectOne("DowntimeMapper.selectById", downtimeId);
    }

    @Override
    public long countDowntimeOverlap(Long equipId, LocalDateTime startDt, LocalDateTime endDt, Long excludeId) {
        Map<String, Object> p = new HashMap<>();
        p.put("equipId", equipId);
        p.put("startDt", startDt);
        p.put("endDt", endDt);
        p.put("excludeId", excludeId);
        Long n = sqlSession.selectOne("DowntimeMapper.countOverlap", p);
        return n == null ? 0 : n;
    }

    @Override
    public long countDowntimeByEquipIds(List<Long> equipIds) {
        Long n = sqlSession.selectOne("DowntimeMapper.countByEquipIds", equipIds);
        return n == null ? 0 : n;
    }

    @Override
    public long countDowntimeByReasonIds(List<Long> reasonIds) {
        Long n = sqlSession.selectOne("DowntimeMapper.countByReasonIds", reasonIds);
        return n == null ? 0 : n;
    }

    @Override
    public void insertDowntime(Downtime downtime) {
        sqlSession.insert("DowntimeMapper.insert", downtime);
    }

    @Override
    public void updateDowntime(Downtime downtime) {
        sqlSession.update("DowntimeMapper.update", downtime);
    }

    @Override
    public void deleteDowntime(Long downtimeId) {
        sqlSession.delete("DowntimeMapper.delete", downtimeId);
    }

    private Map<String, Object> params(int offset, int size, String keyword) {
        Map<String, Object> p = new HashMap<>();
        p.put("offset", offset);
        p.put("size", size);
        p.put("keyword", keyword);
        return p;
    }
}
