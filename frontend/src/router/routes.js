import HomePage from '../pages/HomePage';
import UserPage from '../pages/base/UserPage';
import VendorPage from '../pages/base/VendorPage';
import ProductPage from '../pages/base/ProductPage';
import PatternPage from '../pages/base/PatternPage';
import EquipmentPage from '../pages/base/EquipmentPage';
import DowntimePage from '../pages/base/DowntimePage';
import AuthPage from '../pages/base/AuthPage';
import LoginHistPage from '../pages/base/LoginHistPage';
import ProdStatusPage from '../pages/monitoring/ProdStatusPage';
import IntegratedPage from '../pages/monitoring/IntegratedPage';
import AlarmPage from '../pages/monitoring/AlarmPage';
import AlarmRankPage from '../pages/monitoring/AlarmRankPage';
import TrendPage from '../pages/monitoring/TrendPage';
import TrendSettingsPage from '../pages/monitoring/TrendSettingsPage';
import LotStatusPage from '../pages/monitoring/LotStatusPage';
import LotTrackingPage from '../pages/monitoring/LotTrackingPage';
import WorkOrderPage from '../pages/production/WorkOrderPage';
import ByItemPage from '../pages/production/ByItemPage';
import EquipEffPage from '../pages/production/EquipEffPage';
import DailyReportPage from '../pages/production/DailyReportPage';
import LotReportPage from '../pages/production/LotReportPage';
import SensorPage from '../pages/condition/SensorPage';
import ControllerPage from '../pages/condition/ControllerPage';
import OilAnalysisPage from '../pages/condition/OilAnalysisPage';
import DailyCheckPage from '../pages/condition/DailyCheckPage';
import StandardPage from '../pages/condition/StandardPage';
import CpkPage from '../pages/quality/CpkPage';
import PpkPage from '../pages/quality/PpkPage';
import FproofSavePage from '../pages/quality/FproofSavePage';
import FproofListPage from '../pages/quality/FproofListPage';
import TempUniformPage from '../pages/quality/TempUniformPage';
import HardnessPage from '../pages/quality/HardnessPage';
import NonconformPage from '../pages/quality/NonconformPage';
import DownStatusPage from '../pages/equipment/DownStatusPage';
import UtilRatePage from '../pages/equipment/UtilRatePage';
import PowerUsagePage from '../pages/equipment/PowerUsagePage';
import HistoryPage from '../pages/equipment/HistoryPage';
import RepairHistPage from '../pages/equipment/RepairHistPage';
import SparePartPage from '../pages/equipment/SparePartPage';

// MainLayout(사이드바) 하위에서 렌더링되는 메뉴 라우트 목록.
// '/'와 MainLayout, 로그인 가드는 App.jsx에서 감싼다.
const menuRoutes = [
  { index: true, element: HomePage },
  { path: 'base/user', element: UserPage },
  { path: 'base/vendor', element: VendorPage },
  { path: 'base/product', element: ProductPage },
  { path: 'base/pattern', element: PatternPage },
  { path: 'base/equipment', element: EquipmentPage },
  { path: 'base/downtime', element: DowntimePage },
  { path: 'base/auth', element: AuthPage },
  { path: 'base/loginHist', element: LoginHistPage },
  { path: 'monitoring/prodStatus', element: ProdStatusPage },
  { path: 'monitoring/integrated', element: IntegratedPage },
  { path: 'monitoring/alarm', element: AlarmPage },
  { path: 'monitoring/alarmRank', element: AlarmRankPage },
  { path: 'monitoring/trend', element: TrendPage },
  { path: 'monitoring/trendSettings', element: TrendSettingsPage },
  { path: 'monitoring/lotStatus', element: LotStatusPage },
  { path: 'monitoring/lotTracking', element: LotTrackingPage },
  { path: 'production/workOrder', element: WorkOrderPage },
  { path: 'production/byItem', element: ByItemPage },
  { path: 'production/equipEff', element: EquipEffPage },
  { path: 'production/dailyReport', element: DailyReportPage },
  { path: 'production/lotReport', element: LotReportPage },
  { path: 'condition/sensor', element: SensorPage },
  { path: 'condition/controller', element: ControllerPage },
  { path: 'condition/oilAnalysis', element: OilAnalysisPage },
  { path: 'condition/dailyCheck', element: DailyCheckPage },
  { path: 'condition/standard', element: StandardPage },
  { path: 'quality/cpk', element: CpkPage },
  { path: 'quality/ppk', element: PpkPage },
  { path: 'quality/fproofSave', element: FproofSavePage },
  { path: 'quality/fproofList', element: FproofListPage },
  { path: 'quality/tempUniform', element: TempUniformPage },
  { path: 'quality/hardness', element: HardnessPage },
  { path: 'quality/nonconform', element: NonconformPage },
  { path: 'equipment/downStatus', element: DownStatusPage },
  { path: 'equipment/utilRate', element: UtilRatePage },
  { path: 'equipment/powerUsage', element: PowerUsagePage },
  { path: 'equipment/history', element: HistoryPage },
  { path: 'equipment/repairHist', element: RepairHistPage },
  { path: 'equipment/sparePart', element: SparePartPage },
];

export default menuRoutes;
