package com.mes.service;

import java.util.List;
import java.util.Map;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import com.mes.common.response.PageResponse;
import com.mes.domain.quality.Cpk;
import com.mes.domain.quality.Ppk;
import com.mes.domain.quality.TempUniform;
import com.mes.domain.quality.Hardness;
import com.mes.domain.quality.Nonconform;

public interface QualityService {

    PageResponse<Cpk> getCpkList(int page, int size, String keyword);

    PageResponse<Ppk> getPpkList(int page, int size, String keyword);

    // ── F/PROOF SAVE / LIST ──

    /** 설비(알람 폴더)별 최종 트리거·알람 태그 목록. */
    List<Map<String, Object>> getFproofEquips();

    /** 설비에서 F/PROOF 대상으로 지정된 알람 태그 ID 목록. */
    List<Integer> getFproofSelected(Integer folderId);

    void selectFproofTag(Integer tagId, Integer folderId);

    void deselectFproofTag(Integer tagId, Integer folderId);

    /** 설비의 시작/종료 트리거를 지정한다(둘 다 그 설비의 서로 다른 알람 태그여야 함). */
    void saveFproofTrigger(Integer folderId, Integer startTagId, Integer endTagId);

    /** 설비의 트리거 지정을 지워 기본값('Fool Proof 시작/종료' 문구)으로 되돌린다. */
    void resetFproofTrigger(Integer folderId);

    List<Map<String, Object>> getFproofSessions(String from, String to);

    List<Map<String, Object>> getFproofDetail(Integer folderId, String start, String end);

    List<Map<String, Object>> getFproofExport(String from, String to);

    List<TempUniform> getTempUniformList(String equipName, String judgment, String from, String to);

    List<String> getTempUniformEquipNames();

    TempUniform getTempUniformById(Long id);

    TempUniform createTempUniform(TempUniform tempUniform, MultipartFile file);

    TempUniform updateTempUniform(Long id, TempUniform tempUniform, MultipartFile file);

    void deleteTempUniform(Long id);

    Resource loadTempUniformFile(String fileName);

    PageResponse<Hardness> getHardnessList(int page, int size, String keyword);

    PageResponse<Nonconform> getNonconformList(int page, int size, String keyword);

}
