// 1단계: 하드코딩 데이터. 이후 menuApi.getMenuTree() 응답으로 교체.
// 백엔드 MenuServiceImpl.getMenuTree()와 동일한 구조/내용을 유지해야 한다.
const MENU_DATA = [
  { category: '기준정보', path: '/base', menus: [
    { name: '사용자관리', path: '/base/user' },
    { name: '거래처관리', path: '/base/vendor' },
    { name: '제품관리', path: '/base/product' },
    { name: '패턴관리', path: '/base/pattern' },
    { name: '설비관리', path: '/base/equipment' },
    { name: '비가동관리', path: '/base/downtime' },
    { name: '사용자권한', path: '/base/auth' },
    { name: '로그인이력', path: '/base/loginHist' },
  ]},
  { category: '모니터링', path: '/monitoring', menus: [
    { name: '종합생산현황', path: '/monitoring/prodStatus' },
    { name: '통합모니터링', path: '/monitoring/integrated' },
    { name: '경보모니터링', path: '/monitoring/alarm' },
    { name: '경보랭킹', path: '/monitoring/alarmRank' },
    { name: 'TREND', path: '/monitoring/trend' },
    { name: 'LOT 현황', path: '/monitoring/lotStatus' },
    { name: 'LOT 트래킹', path: '/monitoring/lotTracking' },
  ]},
  { category: '생산관리', path: '/production', menus: [
    { name: '작업지시관리', path: '/production/workOrder' },
    { name: '제품별작업관리', path: '/production/byItem' },
    { name: '설비효율현황', path: '/production/equipEff' },
    { name: '작업일보', path: '/production/dailyReport' },
    { name: 'LOT 보고서', path: '/production/lotReport' },
  ]},
  { category: '조건관리', path: '/condition', menus: [
    { name: '열전대/센서 관리', path: '/condition/sensor' },
    { name: '조절계 관리', path: '/condition/controller' },
    { name: '열처리유성상분석', path: '/condition/oilAnalysis' },
    { name: '일상점검일지', path: '/condition/dailyCheck' },
    { name: '관리계획서 및 작업표준서', path: '/condition/standard' },
  ]},
  { category: '품질관리', path: '/quality', menus: [
    { name: 'CPK 분석', path: '/quality/cpk' },
    { name: 'PPK 분석', path: '/quality/ppk' },
    { name: 'F/PROOF SAVE', path: '/quality/fproofSave' },
    { name: 'F/PROOF LIST', path: '/quality/fproofList' },
    { name: '온도균일성보고서', path: '/quality/tempUniform' },
    { name: '경도관리', path: '/quality/hardness' },
    { name: '부적합품관리', path: '/quality/nonconform' },
  ]},
  { category: '설비관리', path: '/equipment', menus: [
    { name: '설비비가동현황', path: '/equipment/downStatus' },
    { name: '설비가동률분석', path: '/equipment/utilRate' },
    { name: '전력량', path: '/equipment/powerUsage' },
    { name: '설비이력관리', path: '/equipment/history' },
    { name: '수리이력관리', path: '/equipment/repairHist' },
    { name: 'SPARE 부품관리', path: '/equipment/sparePart' },
  ]},
];

export default MENU_DATA;
