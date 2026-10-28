import {
  IconActivity, IconChevronsRight, IconDroplet, IconElevator, IconEngine, IconFilter, IconFlame,
  IconPropeller, IconRotateClockwise2, IconSpray, IconTemperature, IconWaveSine, IconWind,
} from '@tabler/icons-react';

// 램프 상태 이름
export const STATE_LABEL = { run: '운전', stop: '정지', alarm: '알람' };

/** 램프 아이콘 — 설비 종류별(팬 · 블로워 · 버너 · 펌프 · 스프레이 · 컨베이어 …). 2호기 · 3호기 그림이 같이 쓴다 */
export function iconOf(l) {
  if (l.fan) return IconPropeller;
  if (l.agitator) return IconRotateClockwise2;
  if (l.burner) return IconFlame;
  if (l.conv || l.label.includes('컨베이어')) return IconChevronsRight;
  const f = l.full;
  if (f.includes('SPRAY')) return IconSpray;
  if (f.includes('열교환')) return IconTemperature;
  if (f.includes('유압')) return IconEngine;
  if (f.includes('PUMP')) return IconDroplet;
  if (f.includes('BLOWER')) return IconWind;
  if (f.includes('SKIMMER')) return IconFilter;
  if (f.includes('승강기')) return IconElevator;
  if (f.includes('진동')) return IconWaveSine;
  return IconActivity;
}
