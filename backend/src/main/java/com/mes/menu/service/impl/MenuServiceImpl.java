package com.mes.menu.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;

import com.mes.menu.domain.MenuGroup;
import com.mes.menu.domain.MenuItem;
import com.mes.menu.service.MenuService;

/**
 * 1단계: 메뉴 트리를 코드에 고정 리스트로 반환한다.
 * 2단계에서 tb_menu 테이블 연동으로 교체할 때는 이 클래스 내부만 DAO 호출로 바꾸면 되고,
 * MenuController/MenuService 계약은 그대로 유지된다.
 */
@Service
public class MenuServiceImpl implements MenuService {

    @Override
    public List<MenuGroup> getMenuTree() {
        return List.of(
                new MenuGroup("기준정보", "/base", List.of(
                        new MenuItem("사용자관리", "/base/user"),
                        new MenuItem("거래처관리", "/base/vendor"),
                        new MenuItem("제품관리", "/base/product"),
                        new MenuItem("패턴관리", "/base/pattern"),
                        new MenuItem("설비관리", "/base/equipment"),
                        new MenuItem("비가동관리", "/base/downtime"),
                        new MenuItem("사용자권한", "/base/auth"),
                        new MenuItem("로그인이력", "/base/loginHist"))),
                new MenuGroup("모니터링", "/monitoring", List.of(
                        new MenuItem("종합생산현황", "/monitoring/prodStatus"),
                        new MenuItem("통합모니터링", "/monitoring/integrated"),
                        new MenuItem("경보모니터링", "/monitoring/alarm"),
                        new MenuItem("경보랭킹", "/monitoring/alarmRank"),
                        new MenuItem("TREND", "/monitoring/trend"),
                        new MenuItem("LOT 현황", "/monitoring/lotStatus"),
                        new MenuItem("LOT 트래킹", "/monitoring/lotTracking"))),
                new MenuGroup("생산관리", "/production", List.of(
                        new MenuItem("작업지시관리", "/production/workOrder"),
                        new MenuItem("제품별작업관리", "/production/byItem"),
                        new MenuItem("설비효율현황", "/production/equipEff"),
                        new MenuItem("작업일보", "/production/dailyReport"),
                        new MenuItem("LOT 보고서", "/production/lotReport"))),
                new MenuGroup("조건관리", "/condition", List.of(
                        new MenuItem("열전대/센서 관리", "/condition/sensor"),
                        new MenuItem("조절계 관리", "/condition/controller"),
                        new MenuItem("열처리유성상분석", "/condition/oilAnalysis"),
                        new MenuItem("일상점검일지", "/condition/dailyCheck"),
                        new MenuItem("관리계획서 및 작업표준서", "/condition/standard"))),
                new MenuGroup("품질관리", "/quality", List.of(
                        new MenuItem("CPK 분석", "/quality/cpk"),
                        new MenuItem("PPK 분석", "/quality/ppk"),
                        new MenuItem("F/PROOF SAVE", "/quality/fproofSave"),
                        new MenuItem("F/PROOF LIST", "/quality/fproofList"),
                        new MenuItem("온도균일성보고서", "/quality/tempUniform"),
                        new MenuItem("경도관리", "/quality/hardness"),
                        new MenuItem("부적합품관리", "/quality/nonconform"))),
                new MenuGroup("설비관리", "/equipment", List.of(
                        new MenuItem("설비비가동현황", "/equipment/downStatus"),
                        new MenuItem("설비가동률분석", "/equipment/utilRate"),
                        new MenuItem("전력량", "/equipment/powerUsage"),
                        new MenuItem("설비이력관리", "/equipment/history"),
                        new MenuItem("수리이력관리", "/equipment/repairHist"),
                        new MenuItem("SPARE 부품관리", "/equipment/sparePart"))));
    }
}
