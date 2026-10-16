package com.mes.dao;

import java.util.List;
import java.util.Map;

import com.mes.domain.quality.Cpk;
import com.mes.domain.quality.Ppk;
import com.mes.domain.quality.TempUniform;
import com.mes.domain.quality.Hardness;
import com.mes.domain.quality.Nonconform;

/**
 * 품질관리 전체 메뉴의 데이터 접근 계약.
 */
public interface QualityDao {

    List<Cpk> selectCpkList(int offset, int size, String keyword);

    long selectCpkCount(String keyword);

    List<Ppk> selectPpkList(int offset, int size, String keyword);

    long selectPpkCount(String keyword);

    // ── F/PROOF (ez_scada) ──

    List<Map<String, Object>> selectFproofEquips();

    List<Map<String, Object>> selectFproofEquipTags();

    List<Integer> selectFproofSelectedTagIds(int folderId);

    Integer selectFproofTagFolderId(int tagId);

    void insertFproofSelected(int tagId, int folderId);

    void deleteFproofSelected(int tagId);

    void upsertFproofTrigger(int folderId, int startTagId, int endTagId);

    void deleteFproofTrigger(int folderId);

    /** 시작 트리거 태그들의 발생 이력(기간 내). */
    List<Map<String, Object>> selectFproofStartEvents(List<Integer> tagIds, String from, String to);

    /** 종료 트리거 태그들의 발생 이력(from 이후 전부). */
    List<Map<String, Object>> selectFproofEndEvents(List<Integer> tagIds, String from);

    /** F/PROOF 대상으로 지정된 알람의 발생 이력(from ~ to). */
    List<Map<String, Object>> selectFproofDesignatedEvents(String from, String to);

    List<Map<String, Object>> selectFproofDetail(int folderId, String start, String end);

    List<TempUniform> selectTempUniformList(String equipName, String judgment, String from, String to);

    List<String> selectTempUniformEquipNames();

    TempUniform selectTempUniformById(Long id);

    void insertTempUniform(TempUniform tempUniform);

    void updateTempUniform(TempUniform tempUniform);

    void updateTempUniformFile(Long id, String fileName, String origFileName, long fileSize);

    void softDeleteTempUniform(Long id);

    List<Hardness> selectHardnessList(int offset, int size, String keyword);

    long selectHardnessCount(String keyword);

    List<Nonconform> selectNonconformList(int offset, int size, String keyword);

    long selectNonconformCount(String keyword);

}
