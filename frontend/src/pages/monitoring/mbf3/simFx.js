import * as THREE from 'three';

/*
 * 시뮬레이션 레이어(SimLayer) 효과 — 연기 · 불티 · 폭발. 모두 부드러운 빛 텍스처(캔버스로 그린 방사형 그라데이션)를 쓴
 * 카메라를 보는 판(빌보드)이라 공 모양이 아니라 실제 불 · 연기처럼 번진다.
 *  - 연기 · 불티: InstancedMesh 하나씩(조각 수백 개를 그리기 한 번) — update(d, camQuat)에 카메라 방향을 넘겨 판을 돌린다
 *  - 폭발: 미리 만든 자리(슬롯)를 돌려 씀 — 섬광 · 불덩이(여러 장) · 바닥 충격파 고리 · 그을음 + 불티 · 연기
 * dispose()로 지오메트리 · 재질을 정리한다(텍스처는 모듈에서 같이 씀).
 */

const makeTex = (draw) => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const radial = (g, stops) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([at, a]) => r.addColorStop(at, `rgba(255,255,255,${a})`));
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
};
/** 빛 — 가운데 하얗고 가장자리로 부드럽게 사라짐 */
export const GLOW_TEX = makeTex((g) => radial(g, [[0, 1], [0.18, 0.85], [0.45, 0.28], [0.75, 0.06], [1, 0]]));
/** 연기 — 몽글몽글한 덩어리 몇 개를 겹친 부드러운 뭉치 */
export const PUFF_TEX = makeTex((g) => {
  for (let k = 0; k < 7; k += 1) {
    const a = (k / 7) * Math.PI * 2;
    const cx = 64 + Math.cos(a) * 18 * (k % 2 ? 1 : 0.6);
    const cy = 64 + Math.sin(a) * 18 * (k % 2 ? 1 : 0.6);
    const r = g.createRadialGradient(cx, cy, 0, cx, cy, 36);
    r.addColorStop(0, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
});

const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const PLANE = new THREE.PlaneGeometry(1, 1);
const lerp3 = (a, b, c, u, out) => (u < 0.5 ? out.copy(a).lerp(b, u * 2) : out.copy(b).lerp(c, (u - 0.5) * 2));

/** 빌보드 조각 무리 — 연기 · 불티가 같이 쓰는 바탕(자리 돌려쓰기 · 색 세 단계) */
class Billboards {
  constructor(n, material) {
    this.mat = material;
    this.mesh = new THREE.InstancedMesh(PLANE, material, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.parts = Array.from({ length: n }, () => ({ age: 1, life: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s0: 0.1, c: [new THREE.Color(), new THREE.Color(), new THREE.Color()] }));
    for (let i = 0; i < n; i += 1) this.mesh.setMatrixAt(i, ZERO);
    this.next = 0;
  }

  take() {
    const q = this.parts[this.next];
    this.next = (this.next + 1) % this.parts.length;
    return q;
  }

  dispose() { this.mat.dispose(); this.mesh.dispose(); }
}

/** 연기 — 부드러운 뭉치가 커지며 떠오르다 옅어져 사라진다. 색은 조각마다 [처음 → 중간 → 끝] */
export class Smoke extends Billboards {
  constructor(n = 260) {
    super(n, new THREE.MeshBasicMaterial({ map: PUFF_TEX, transparent: true, opacity: 0.8, depthWrite: false }));
  }

  emit(at, vel, size, life, colors) {
    const q = this.take();
    q.age = 0;
    q.life = life;
    q.p.copy(at);
    q.v.copy(vel);
    q.s0 = size;
    colors.forEach((c, i) => q.c[i].set(c));
  }

  update(d, camQuat) {
    this.parts.forEach((q, i) => {
      if (q.age >= q.life) return;
      q.age += d;
      const u = Math.min(1, q.age / q.life);
      if (u >= 1) { this.mesh.setMatrixAt(i, ZERO); return; }
      q.v.multiplyScalar(1 - d * 2.2);
      q.v.y += d * 0.7; // 뜨거운 연기는 떠오름
      q.p.addScaledVector(q.v, d);
      const s = q.s0 * (1 + u * 3.2) * (u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3 * 0.6);
      this.mesh.setMatrixAt(i, tmpM.compose(q.p, camQuat, tmpS.set(s, s, s)));
      // 끝으로 갈수록 바탕(밝은 바닥색)에 가까워져 옅어 보이게
      this.mesh.setColorAt(i, lerp3(q.c[0], q.c[1], q.c[2], u, tmpC));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

/** 불티 — 빛나는 작은 점이 튀어 나가 중력에 떨어지며 식는다(더하기 섞기라 검게 식으면 사라짐, 바닥에서 한 번 튐) */
export class Sparks extends Billboards {
  constructor(n = 200) {
    super(n, new THREE.MeshBasicMaterial({ map: GLOW_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.hot = new THREE.Color('#fff6c8');
    this.warm = new THREE.Color('#ff8a1e');
    this.cold = new THREE.Color('#000000');
  }

  burst(at, count, power, hot, lifeMul = 1) {
    for (let k = 0; k < count; k += 1) {
      const q = this.take();
      const a = Math.random() * Math.PI * 2;
      const up = 0.25 + Math.random() * 0.9;
      const sp = power * (0.4 + Math.random() * 0.9);
      q.age = 0;
      q.life = (0.45 + Math.random() * 0.7) * lifeMul;
      q.p.copy(at);
      q.v.set(Math.cos(a) * sp, up * sp, Math.sin(a) * sp);
      q.s0 = 0.1 + Math.random() * 0.12;
      q.c[0].copy(hot ? tmpC.set(hot) : this.hot);
    }
  }

  update(d, camQuat) {
    this.parts.forEach((q, i) => {
      if (q.age >= q.life) return;
      q.age += d;
      const u = Math.min(1, q.age / q.life);
      if (u >= 1) { this.mesh.setMatrixAt(i, ZERO); return; }
      q.v.y -= 12 * d;
      q.p.addScaledVector(q.v, d);
      if (q.p.y < 0.03) { q.p.y = 0.03; q.v.y = Math.abs(q.v.y) * 0.3; q.v.x *= 0.6; q.v.z *= 0.6; }
      const s = q.s0 * (1 - u * 0.4);
      this.mesh.setMatrixAt(i, tmpM.compose(q.p, camQuat, tmpS.set(s, s, s)));
      this.mesh.setColorAt(i, lerp3(q.c[0], this.warm, this.cold, u, tmpC));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

/** 빛 자국 — 중력 없이 그 자리에서 빠르게 줄며 식는 빛(더하기 섞기). 미사일 꼬리 바로 뒤 빛줄기용 */
export class Glows extends Billboards {
  constructor(n = 400) {
    super(n, new THREE.MeshBasicMaterial({ map: GLOW_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.black = new THREE.Color('#000000');
  }

  emit(at, size, life, color) {
    const q = this.take();
    q.age = 0;
    q.life = life;
    q.p.copy(at);
    q.s0 = size;
    q.c[0].set(color);
  }

  update(d, camQuat) {
    this.parts.forEach((q, i) => {
      if (q.age >= q.life) return;
      q.age += d;
      const u = Math.min(1, q.age / q.life);
      if (u >= 1) { this.mesh.setMatrixAt(i, ZERO); return; }
      const sc = q.s0 * (1 - u * 0.7);
      this.mesh.setMatrixAt(i, tmpM.compose(q.p, camQuat, tmpS.set(sc, sc, sc)));
      this.mesh.setColorAt(i, tmpC.copy(q.c[0]).lerp(this.black, u));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

/** 불길 — 빠르게 뻗어 나가며(점점 느려지고 떠오름) 커지고, 흰 → 주황 → 어둡게 식는 뭉치(더하기 섞기). 화염방사 · 불붙은 좀비용 */
export class Fire extends Billboards {
  constructor(n = 800) {
    super(n, new THREE.MeshBasicMaterial({ map: PUFF_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.c0 = new THREE.Color('#fff4c8');
    this.c1 = new THREE.Color('#ff7a18');
    this.c2 = new THREE.Color('#1a0400');
  }

  emit(at, vel, size, life) {
    const q = this.take();
    q.age = 0;
    q.life = life;
    q.p.copy(at);
    q.v.copy(vel);
    q.s0 = size;
  }

  update(d, camQuat) {
    this.parts.forEach((q, i) => {
      if (q.age >= q.life) return;
      q.age += d;
      const u = Math.min(1, q.age / q.life);
      if (u >= 1) { this.mesh.setMatrixAt(i, ZERO); return; }
      q.v.multiplyScalar(1 - d * 0.9);
      q.v.y += d * 2.2;
      q.p.addScaledVector(q.v, d);
      if (q.p.y < 0.1) { q.p.y = 0.1; q.v.y = Math.abs(q.v.y) * 0.2; }
      const sc = q.s0 * (1 + u * 3);
      this.mesh.setMatrixAt(i, tmpM.compose(q.p, camQuat, tmpS.set(sc, sc, sc)));
      this.mesh.setColorAt(i, lerp3(this.c0, this.c1, this.c2, u, tmpC));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

/** 파편 — 검은 조각이 튀어 돌며 떨어져 바닥에서 튕기고 굴러가다 작아져 사라짐(실제 3D 상자, 그림자 없음) */
export class Debris {
  constructor(n = 90) {
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mat = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.8, metalness: 0.2 });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, n);
    this.mesh.frustumCulled = false;
    this.parts = Array.from({ length: n }, () => ({ age: 1, life: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: new THREE.Vector3() }));
    for (let i = 0; i < n; i += 1) this.mesh.setMatrixAt(i, ZERO);
    this.next = 0;
    this.q = new THREE.Quaternion();
  }

  burst(at, count, power) {
    for (let k = 0; k < count; k += 1) {
      const q = this.parts[this.next];
      this.next = (this.next + 1) % this.parts.length;
      const a = Math.random() * Math.PI * 2;
      const sp = power * (0.4 + Math.random() * 0.8);
      q.age = 0;
      q.life = 1.4 + Math.random() * 1.2;
      q.p.copy(at);
      q.v.set(Math.cos(a) * sp, power * (0.5 + Math.random() * 0.9), Math.sin(a) * sp);
      q.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      q.w.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
      const b = 0.05 + Math.random() * 0.1;
      q.s.set(b * (0.6 + Math.random()), b * (0.4 + Math.random() * 0.6), b * (0.6 + Math.random()));
    }
  }

  update(d) {
    this.parts.forEach((q, i) => {
      if (q.age >= q.life) return;
      q.age += d;
      const u = Math.min(1, q.age / q.life);
      if (u >= 1) { this.mesh.setMatrixAt(i, ZERO); return; }
      q.v.y -= 16 * d;
      q.p.addScaledVector(q.v, d);
      if (q.p.y < q.s.y / 2) {
        q.p.y = q.s.y / 2;
        q.v.y = Math.abs(q.v.y) * 0.35;
        q.v.x *= 0.55;
        q.v.z *= 0.55;
        q.w.multiplyScalar(0.6);
      }
      q.r.x += q.w.x * d;
      q.r.y += q.w.y * d;
      q.r.z += q.w.z * d;
      const shrink = u < 0.8 ? 1 : (1 - u) / 0.2;
      this.mesh.setMatrixAt(i, tmpM.compose(q.p, this.q.setFromEuler(q.r), tmpS.copy(q.s).multiplyScalar(shrink)));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); this.mesh.dispose(); }
}

const FIREBALLS = 7;
const BOOM_S = 0.85;

/**
 * 폭발 — 슬롯마다 [섬광 빛 · 불덩이 빛 여러 장 · 바닥 충격파 고리 · 그을음]. 불티 · 연기는 같이 쓰는 Sparks · Smoke로.
 * light: 늘 장면에 있는 pointLight 하나(빛 개수가 바뀌면 셰이더를 다시 만들어 끊기므로 세기만 바꿈)
 */
export class Booms {
  constructor(slots, smoke, sparks, debris = null, bus = null) {
    this.smoke = smoke;
    this.sparks = sparks;
    this.debris = debris;
    this.bus = bus; // { shake, flash, flashColor } — 화면 흔들림 · 번쩍임 신호(장면 · HUD가 읽음)
    this.group = new THREE.Group();
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 56);
    this.domeGeo = new THREE.SphereGeometry(1, 28, 18);
    this.slots = Array.from({ length: slots }, () => {
      const g = new THREE.Group();
      const flashMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: '#fff3c8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const fireMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: '#ff6a14', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const coreMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: '#ffd45a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const scorchMat = new THREE.MeshBasicMaterial({ map: GLOW_TEX, color: '#000000', transparent: true, opacity: 0, depthWrite: false });
      const domeMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
      const flash = new THREE.Sprite(flashMat);
      const dome = new THREE.Mesh(this.domeGeo, domeMat);
      const fires = Array.from({ length: FIREBALLS }, (_, i) => new THREE.Sprite(i < 2 ? coreMat : fireMat));
      const ring = new THREE.Mesh(this.ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      const scorch = new THREE.Mesh(PLANE, scorchMat);
      scorch.rotation.x = -Math.PI / 2;
      g.add(scorch, ring, dome, ...fires, flash);
      g.visible = false;
      this.group.add(g);
      return { g, flash, fires, ring, scorch, dome, mats: { flashMat, fireMat, coreMat, ringMat, scorchMat, domeMat }, age: 99, size: 1, offs: fires.map(() => new THREE.Vector3()) };
    });
    this.light = null;
    this.lightAge = 99;
    this.lightPeak = 0;
  }

  /** x, y, z 자리에 size 크기 폭발(작은 것은 발사 섬광 · 빗나간 미사일) */
  trigger(x, y, z, size) {
    const sl = this.slots.reduce((a, c) => (c.age > a.age ? c : a), this.slots[0]);
    sl.age = 0;
    sl.size = size;
    sl.g.position.set(x, y, z);
    sl.offs.forEach((o, i) => o.set((Math.random() - 0.5) * 1.1, Math.random() * 0.6 + (i < 2 ? 0 : 0.15), (Math.random() - 0.5) * 1.1));
    sl.g.visible = true;
    this.sparks.burst(tmpP.set(x, y, z), Math.round(10 + size * 22), 3 + size * 4.5);
    // 불씨 — 느리게 오래 떠다니다 사그라짐
    if (size >= 0.8) this.sparks.burst(tmpP.set(x, y + 0.3, z), Math.round(size * 10), 1.6 + size, '#ffb347', 2.6);
    // 파편 · 흔들림 · 번쩍임 신호
    if (this.debris && size >= 0.8) this.debris.burst(tmpP.set(x, y, z), Math.round(size * 7), 3 + size * 2.5);
    if (this.bus) {
      this.bus.shake = Math.max(this.bus.shake, size >= 2 ? 0.9 : size >= 1.2 ? 0.45 : size >= 0.7 ? 0.18 : 0.05);
      if (size >= 2) { this.bus.flash = Math.max(this.bus.flash, 0.55); this.bus.flashColor = '255, 214, 160'; }
    }
    for (let k = 0; k < Math.round(3 + size * 6); k += 1) {
      this.smoke.emit(
        tmpP.set(x + (Math.random() - 0.5) * size * 0.7, y + Math.random() * 0.3, z + (Math.random() - 0.5) * size * 0.7),
        new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.8 + Math.random() * 1.4, (Math.random() - 0.5) * 1.4),
        0.22 + size * 0.22, 1.2 + Math.random() * 0.9, ['#ff9a3c', '#3f3a36', '#cfcbc6'],
      );
    }
    if (this.light) { this.light.position.set(x, y + 0.8, z); this.lightAge = 0; this.lightPeak = 4 + size * 12; }
  }

  update(d) {
    this.slots.forEach((sl) => {
      if (sl.age > 6) { sl.g.visible = false; return; }
      sl.age += d;
      const s = sl.size;
      const u = Math.min(1, sl.age / BOOM_S);
      const { flashMat, fireMat, coreMat, ringMat, scorchMat, domeMat } = sl.mats;
      // 폭발 돔 — 큰 폭발만, 0.25초에 둥글게 부풀었다 사라짐
      const du = Math.min(1, sl.age / 0.25);
      sl.dome.scale.setScalar(s * (0.4 + (1 - (1 - du) ** 2) * 2.4));
      domeMat.opacity = s >= 1.2 && du < 1 ? 0.55 * (1 - du) : 0;
      // 섬광 — 0.1초 안에 확 커졌다 빠르게 사라짐
      const f = Math.min(1, sl.age / 0.1);
      sl.flash.scale.setScalar(s * (1.2 + f * 3.2));
      flashMat.opacity = sl.age < 0.1 ? 1 : Math.max(0, 1 - (sl.age - 0.1) * 4);
      // 불덩이 — 부풀며 떠오르고 옅어짐(가운데 둘은 노란 심)
      const grow = 1 - (1 - u) ** 3;
      sl.fires.forEach((m, i) => {
        m.position.copy(sl.offs[i]).multiplyScalar(s * (0.4 + grow * 0.9)).add(tmpP.set(0, grow * 0.5 * s, 0));
        m.scale.setScalar(s * (i < 2 ? 1.1 : 1.5) * (0.5 + grow * 0.9));
      });
      fireMat.opacity = u < 1 ? (1 - u) ** 1.2 : 0;
      coreMat.opacity = u < 1 ? (1 - u) ** 2 : 0;
      // 바닥 충격파 고리 — 빠르게 퍼지며 옅어짐(바닥 높이에)
      const r = Math.min(1, sl.age / 0.4);
      sl.ring.position.set(0, -sl.g.position.y + 0.05, 0);
      sl.ring.scale.setScalar(s * (0.3 + r * 3.2));
      ringMat.opacity = r < 1 ? 0.8 * (1 - r) : 0;
      // 그을음 — 큰 폭발만, 천천히 사라짐
      sl.scorch.position.set(0, -sl.g.position.y + 0.03, 0);
      sl.scorch.scale.setScalar(s * 2.2);
      scorchMat.opacity = s >= 1 ? Math.max(0, 0.6 * (1 - sl.age / 6)) : 0;
    });
    if (this.light) {
      this.lightAge += d;
      this.light.intensity = this.lightAge < 0.45 ? this.lightPeak * (1 - this.lightAge / 0.45) : 0;
    }
  }

  dispose() {
    this.ringGeo.dispose();
    this.domeGeo.dispose();
    this.slots.forEach((sl) => Object.values(sl.mats).forEach((m) => m.dispose()));
  }
}

const NUKE_RING_R = 24; // 충격파가 퍼지는 끝 반지름
const NUKE_RING_S = 1.6; // 충격파가 끝까지 퍼지는 시간(초)

/**
 * 핵폭발 — 하늘을 덮는 섬광 · 땅에서 솟는 불덩이 · 버섯구름(기둥 + 머리, Smoke로) · 바닥 먼지 고리 · 충격파 고리 · 큰 빛.
 * ringR(): 지금 충격파 반지름 — 그 안에 든 것이 쓰러짐(SimLayer가 판단). light: 늘 있는 pointLight(세기 · 거리만 바꿈)
 */
export class NukeBlast {
  constructor(smoke, sparks) {
    this.smoke = smoke;
    this.sparks = sparks;
    this.group = new THREE.Group();
    this.flashMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: '#fffbe8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.fireMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: '#ff7a1a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.coreMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: '#ffe48a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffe2b0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.groundMat = new THREE.MeshBasicMaterial({ map: GLOW_TEX, color: '#ff8a2a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.scorchMat = new THREE.MeshBasicMaterial({ map: GLOW_TEX, color: '#000000', transparent: true, opacity: 0, depthWrite: false });
    this.ringGeo = new THREE.RingGeometry(0.93, 1, 96);
    this.flash = new THREE.Sprite(this.flashMat);
    this.fire = new THREE.Sprite(this.fireMat);
    this.core = new THREE.Sprite(this.coreMat);
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ground = new THREE.Mesh(PLANE, this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.scorch = new THREE.Mesh(PLANE, this.scorchMat);
    this.scorch.rotation.x = -Math.PI / 2;
    this.group.add(this.scorch, this.ground, this.ring, this.fire, this.core, this.flash);
    this.group.visible = false;
    this.age = 99;
    this.x = 0;
    this.z = 0;
    this.light = null;
    this.bus = null;
    this.emitT = 0;
  }

  trigger(x, z) {
    this.age = 0;
    this.x = x;
    this.z = z;
    this.emitT = 0;
    if (this.bus) { this.bus.shake = 1.8; this.bus.flash = 1; this.bus.flashColor = '255, 246, 220'; }
    this.group.position.set(x, 0, z);
    this.group.visible = true;
    // 바닥 먼지 고리 — 사방으로 밀려 나가는 흙먼지
    for (let k = 0; k < 40; k += 1) {
      const a = (k / 40) * Math.PI * 2 + Math.random() * 0.1;
      const sp = 9 + Math.random() * 4;
      this.smoke.emit(tmpP.set(x + Math.cos(a) * 0.8, 0.3, z + Math.sin(a) * 0.8), new THREE.Vector3(Math.cos(a) * sp, 0.4 + Math.random() * 0.6, Math.sin(a) * sp),
        0.5 + Math.random() * 0.3, 2.2 + Math.random() * 1.2, ['#c79a6a', '#8a7f74', '#dedad4']);
    }
    this.sparks.burst(tmpP.set(x, 0.5, z), 70, 11);
  }

  ringR() { return this.age < NUKE_RING_S ? NUKE_RING_R * (1 - (1 - this.age / NUKE_RING_S) ** 2) : this.age < 99 ? NUKE_RING_R : 0; }

  update(d) {
    if (this.age > 12) { this.group.visible = false; return; }
    this.age += d;
    const t = this.age;
    // 섬광 — 하늘을 덮을 만큼 커졌다 0.7초에 사그라짐
    this.flash.position.set(0, 3, 0);
    this.flash.scale.setScalar(10 + Math.min(1, t / 0.15) * 45);
    this.flashMat.opacity = t < 0.15 ? 1 : Math.max(0, 1 - (t - 0.15) / 0.55);
    // 불덩이 — 땅에서 부풀며 버섯구름 머리 높이까지 솟고 서서히 꺼짐
    const rise = Math.min(1, t / 3.2);
    const fy = 0.8 + (1 - (1 - rise) ** 2) * 6.5;
    this.fire.position.set(0, fy, 0);
    this.fire.scale.setScalar(4 + Math.min(1, t / 0.6) * 6 + Math.sin(t * 13) * 0.3);
    this.fireMat.opacity = Math.max(0, Math.min(1, t / 0.1) * (1 - t / 4.5));
    this.core.position.set(0, fy, 0);
    this.core.scale.setScalar(2.5 + Math.min(1, t / 0.5) * 3);
    this.coreMat.opacity = Math.max(0, 1 - t / 2.6);
    // 바닥 — 달아오른 빛 · 그을음
    this.ground.scale.setScalar(6 + Math.min(1, t / 0.5) * 8);
    this.ground.position.y = 0.06;
    this.groundMat.opacity = Math.max(0, 0.9 * (1 - t / 3));
    this.scorch.scale.setScalar(12);
    this.scorch.position.y = 0.04;
    this.scorchMat.opacity = Math.min(0.75, t * 2) * Math.max(0, 1 - Math.max(0, t - 6) / 6);
    // 충격파 고리
    const r = this.ringR();
    this.ring.position.y = 0.08;
    this.ring.scale.setScalar(Math.max(0.01, r));
    this.ringMat.opacity = t < NUKE_RING_S ? 0.9 * (1 - t / NUKE_RING_S) : 0;
    // 버섯구름 — 기둥(땅 → 머리)과 머리(도넛처럼 둥글게 퍼짐)에 연기를 계속 뿜음
    this.emitT += d;
    while (t < 3.4 && this.emitT > 0.025) {
      this.emitT -= 0.025;
      const head = fy + 0.6;
      // 기둥
      const hy = Math.random() * head;
      this.smoke.emit(tmpP.set(this.x + (Math.random() - 0.5) * 1.2, hy, this.z + (Math.random() - 0.5) * 1.2),
        new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4), 0.45 + Math.random() * 0.25, 2.5 + Math.random(),
        ['#ff8a3c', '#5d524b', '#d9d4ce']);
      // 머리 — 둥글게 말려 나가는 고리
      const a = Math.random() * Math.PI * 2;
      const hr = 1.2 + rise * 2.6;
      this.smoke.emit(tmpP.set(this.x + Math.cos(a) * hr, head + (Math.random() - 0.3) * 1.2, this.z + Math.sin(a) * hr),
        new THREE.Vector3(Math.cos(a) * 1.4, 0.5 + Math.random() * 0.6, Math.sin(a) * 1.4), 0.8 + Math.random() * 0.5, 3.2 + Math.random() * 1.5,
        ['#ffb24a', '#6a5e55', '#e2ddd7']);
    }
    // 빛 — 처음엔 온 장면을 오렌지빛으로, 2초에 걸쳐 꺼짐
    if (this.light) {
      this.light.position.set(this.x, 5, this.z);
      this.light.distance = 70;
      this.light.intensity = t < 2 ? 160 * (1 - t / 2) ** 1.5 : 0;
    }
  }

  dispose() {
    [this.flashMat, this.fireMat, this.coreMat, this.ringMat, this.groundMat, this.scorchMat].forEach((m) => m.dispose());
    this.ringGeo.dispose();
  }
}
