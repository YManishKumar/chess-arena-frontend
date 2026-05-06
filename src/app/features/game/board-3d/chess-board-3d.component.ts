import {
  Component, ElementRef, ViewChild, Input, Output, EventEmitter,
  AfterViewInit, OnDestroy, OnChanges, SimpleChanges, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Chess, Square } from 'chess.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type GamePhase = 'intro' | 'play';

interface PieceAnim {
  group: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0: number;
  dur: number;
  arc: number;
  vanish: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
  selector: 'app-chess-board-3d',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wrap" #wrapper>
      <canvas #canvas></canvas>
      <!-- Intro overlay -->
      <div class="intro-overlay" #introOverlay>
        <div class="intro-logo" #introLogo>
          <div class="intro-title">CHESS ARENA</div>
          <div class="intro-sub">CINEMATIC 3D EXPERIENCE</div>
          <div class="intro-hint" #introHint>Touch anywhere to play</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }

    .wrap {
      position: relative;
      width: 100%;
      height: 100%;
      background: radial-gradient(ellipse at 40% 30%, #1a1050 0%, #0a0820 55%, #060418 100%);
      overflow: hidden;
    }

    canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
    }

    .intro-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 10;
      background: radial-gradient(ellipse at center,
        rgba(10,5,30,0.6) 0%,
        rgba(5,0,15,0.92) 100%);
      transition: opacity 1.2s ease;
    }

    .intro-logo {
      text-align: center;
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.8s ease, transform 0.8s ease;
    }

    .intro-title {
      font-family: 'Orbitron', 'Courier New', monospace;
      font-size: clamp(28px, 6vw, 72px);
      font-weight: 900;
      letter-spacing: 0.18em;
      background: linear-gradient(135deg, #ffffff 0%, #88aaff 40%, #cc88ff 70%, #ffffff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-shadow: none;
      filter: drop-shadow(0 0 30px rgba(140,100,255,0.8));
      animation: shimmer 3s linear infinite;
    }

    @keyframes shimmer {
      0%   { filter: drop-shadow(0 0 20px rgba(100,80,255,0.6)); }
      50%  { filter: drop-shadow(0 0 50px rgba(180,120,255,0.9)); }
      100% { filter: drop-shadow(0 0 20px rgba(100,80,255,0.6)); }
    }

    .intro-sub {
      font-family: 'Orbitron', monospace;
      font-size: clamp(10px, 2vw, 16px);
      letter-spacing: 0.4em;
      color: rgba(180, 160, 255, 0.7);
      margin-top: 10px;
      text-transform: uppercase;
    }

    .intro-hint {
      font-family: 'Orbitron', monospace;
      font-size: clamp(9px, 1.5vw, 13px);
      letter-spacing: 0.25em;
      color: rgba(255, 255, 255, 0.4);
      margin-top: 32px;
      opacity: 0;
      transition: opacity 0.8s ease;
      animation: blink 2s ease-in-out infinite;
    }

    @keyframes blink {
      0%,100% { opacity: 0.3; }
      50%      { opacity: 0.8; }
    }
  `]
})
export class ChessBoard3DComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('canvas')       canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('wrapper')      wrapperRef!: ElementRef<HTMLDivElement>;
  @ViewChild('introOverlay') overlayRef!: ElementRef<HTMLDivElement>;
  @ViewChild('introLogo')    logoRef!: ElementRef<HTMLDivElement>;
  @ViewChild('introHint')    hintRef!: ElementRef<HTMLDivElement>;

  @Input() fen           = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  @Input() selectedSquare: Square | null = null;
  @Input() legalMoves: Square[]          = [];
  @Input() lastMove: { from: Square; to: Square } | null = null;
  @Input() isFlipped     = false;
  @Input() checkSquare: Square | null    = null;
  // overhead=true: skip intro, fixed top-angle camera, royal marble look (2D-view replacement)
  @Input() overhead      = false;

  @Output() squareClick = new EventEmitter<Square>();

  // Three.js core
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private animId = 0;
  private resizeObs!: ResizeObserver;
  private ready = false;

  // Board state
  private chess      = new Chess();
  private tileMap    = new Map<string, THREE.Mesh>();
  private pieceMap   = new Map<string, THREE.Group>();
  private hlMap      = new Map<string, THREE.Object3D>();
  private pieceAnims: PieceAnim[] = [];

  // Shared geometries
  private planeGeo!: THREE.PlaneGeometry;
  private discGeo!: THREE.CylinderGeometry;
  private ringGeo!: THREE.TorusGeometry;
  private baseRingGeo!: THREE.TorusGeometry;

  // Environment
  private envMap: THREE.Texture | null = null;

  // Materials
  private M!: Record<string, THREE.MeshStandardMaterial>;

  // Intro
  private phase: GamePhase = 'intro';
  private introT0 = 0;
  private readonly INTRO_DUR = 8000;
  private stars!: THREE.Points;
  private introParticles!: THREE.Points;
  private particleOrigPos!: Float32Array;
  private particleTargPos!: Float32Array;

  // Pulse ring
  private pulseRings: { mesh: THREE.Mesh; t0: number }[] = [];

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      this.initThree();
      if (!this.overhead) {
        this.buildStars();
        this.buildIntroParticles();
      }
      this.buildBoard();
      this.buildSharedGeos();
      if (this.overhead) this.phase = 'play';
      this.startLoop();
      this.setupResize();
      this.setupEvents();
      if (this.overhead) {
        this.startOverhead();
      } else {
        this.startIntro();
      }
      this.ready = true;
    });
  }

  ngOnChanges(c: SimpleChanges) {
    if (!this.ready) return;
    this.ngZone.runOutsideAngular(() => {
      if (c['fen']) this.handleFenChange(c['fen'].previousValue, this.fen);
      if (c['selectedSquare'] || c['legalMoves'] || c['lastMove'] || c['checkSquare']) {
        this.refreshHighlights();
      }
      if (c['isFlipped']) this.kickCameraFlip();
    });
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animId);
    this.resizeObs?.disconnect();
    this.envMap?.dispose();
    this.renderer?.dispose();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  THREE INIT
  // ═══════════════════════════════════════════════════════════════════════════

  private initThree() {
    const canvas = this.canvasRef.nativeElement;
    const W = this.wrapperRef.nativeElement.clientWidth  || window.innerWidth;
    const H = this.wrapperRef.nativeElement.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setSize(W, H, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.overhead ? 0.9 : 1.2;
    const bg = this.overhead ? 0x060404 : 0x0a0820;
    this.renderer.setClearColor(bg, 1);

    this.scene  = new THREE.Scene();
    this.scene.background = new THREE.Color(bg);
    if (!this.overhead) this.scene.fog = new THREE.FogExp2(0x0d0a28, 0.018);

    // PMREMGenerator — dim studio env for subtle reflections only (NOT applied to background)
    if (this.overhead) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;
      // Apply to materials only — don't set scene.environment to avoid grey wash
      pmrem.dispose();
    }

    this.camera = new THREE.PerspectiveCamera(this.overhead ? 42 : 50, W / H, 0.1, 300);
    this.camera.position.set(0, 28, 18);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.055;
    this.controls.minDistance    = 4;
    this.controls.maxDistance    = 24;
    this.controls.maxPolarAngle  = Math.PI / 2.05;
    this.controls.minPolarAngle  = 0.1;
    this.controls.enablePan      = false;
    this.controls.enabled        = false;

    if (this.overhead) {
      // Luxury studio lighting — warm key + cool fill + gold rim + soft ambient
      this.scene.add(new THREE.AmbientLight(0xfff8f0, 1.4));

      // Key light: warm from upper-right front
      const key = new THREE.DirectionalLight(0xfff5e0, 4.0);
      key.position.set(6, 20, 10); key.castShadow = true;
      key.shadow.mapSize.set(4096, 4096);
      Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 80 });
      key.shadow.bias = -0.0005;
      key.shadow.normalBias = 0.02;
      this.scene.add(key);

      // Fill: cool blue-white from left
      const fill = new THREE.DirectionalLight(0xd0e8ff, 1.6);
      fill.position.set(-8, 14, 4); this.scene.add(fill);

      // Back rim: warm cream from behind
      const back = new THREE.DirectionalLight(0xffe8c0, 1.0);
      back.position.set(0, 12, -14); this.scene.add(back);

      // Gold point lights near frame for metallic glow
      const gold1 = new THREE.PointLight(0xd4a017, 3.0, 18);
      gold1.position.set(0, 2, 7); this.scene.add(gold1);
      const gold2 = new THREE.PointLight(0xd4a017, 2.0, 18);
      gold2.position.set(0, 2, -7); this.scene.add(gold2);

      // Soft under-table ambient for ground reflections
      const under = new THREE.PointLight(0x1a0a00, 0.8, 12);
      under.position.set(0, -2, 0); this.scene.add(under);
    } else {
      // Cinematic lighting
      this.scene.add(new THREE.AmbientLight(0xaabbdd, 1.8));

      const sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
      sun.position.set(8, 16, 10); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 60 });
      sun.shadow.bias = -0.001;
      this.scene.add(sun);

      const fill = new THREE.DirectionalLight(0xccddff, 1.6);
      fill.position.set(-5, 8, 10); this.scene.add(fill);

      const rim1 = new THREE.PointLight(0x9966ff, 3, 30);
      rim1.position.set(-8, 8, -6); this.scene.add(rim1);
    }

    const rim2 = new THREE.PointLight(0x66ccff, 2.5, 25);
    rim2.position.set(8, 6, -8);
    this.scene.add(rim2);

    if (!this.overhead) {
      const rim2 = new THREE.PointLight(0x66ccff, 2.5, 25);
      rim2.position.set(8, 6, -8); this.scene.add(rim2);
      const under = new THREE.PointLight(0x440088, 1.2, 15);
      under.position.set(0, -3, 0); this.scene.add(under);
    }

    // Materials — overhead uses true marble black/white, cinematic uses wood
    const lightTileColor = this.overhead ? 0xf5f0e8 : 0xe8d9b8;
    const darkTileColor  = this.overhead ? 0x0a0808 : 0x5c3218;
    const edgeColor      = this.overhead ? 0xc9a227 : 0x9070ff;
    const edgeEmissive   = this.overhead ? 0xb8860b : 0x9070ff;

    const lt = m({ color: lightTileColor, roughness: this.overhead ? 0.22 : 0.75, metalness: this.overhead ? 0.0 : 0.04 });
    const dt = m({ color: darkTileColor,  roughness: this.overhead ? 0.14 : 0.62, metalness: this.overhead ? 0.0 : 0.06 });
    if (this.overhead && this.envMap) {
      lt.envMap = this.envMap; lt.envMapIntensity = 0.35;
      dt.envMap = this.envMap; dt.envMapIntensity = 0.55;
    }

    this.M = {
      // Board
      lightTile: lt,
      darkTile:  dt,
      frame:     m({ color: this.overhead ? 0x1c1206 : 0x0f0804, roughness: this.overhead ? 0.65 : 0.92, metalness: this.overhead ? 0.15 : 0.05 }),
      edge:      m({ color: edgeColor, emissive: edgeEmissive, emissiveInt: this.overhead ? 0.5 : 0.6, roughness: 0.2, metalness: this.overhead ? 0.85 : 0.5 }),
      // Pieces — MeshPhysicalMaterial created below
      whitePc:   null as any,
      blackPc:   null as any,
      // Highlights
      selected:  m({ color: 0xf7b731, emissive: 0xf7b731, emissiveInt: 0.55, transparent: true, opacity: 0.82, roughness: 0.3, metalness: 0.1 }),
      legal:     m({ color: 0x26de81, emissive: 0x26de81, emissiveInt: 0.5,  transparent: true, opacity: 0.62, roughness: 0.4, metalness: 0.1 }),
      capture:   m({ color: 0xff4455, emissive: 0xff4455, emissiveInt: 0.45, transparent: true, opacity: 0.55, roughness: 0.4, metalness: 0.1 }),
      lastMov:   m({ color: 0x8877ff, emissive: 0x8877ff, emissiveInt: 0.38, transparent: true, opacity: 0.55, roughness: 0.4, metalness: 0.1 }),
      check:     m({ color: 0xff3344, emissive: 0xff3344, emissiveInt: 0.75, transparent: true, opacity: 0.9,  roughness: 0.3, metalness: 0.1 }),
      pulse:     m({ color: 0xffffff, emissive: 0xffffff, emissiveInt: 1.0,  transparent: true, opacity: 0.8,  roughness: 0.1, metalness: 0.1 }),
    };

    if (this.overhead) {
      // Ivory marble — warm white, polished, subtle clearcoat sheen
      const wp = new THREE.MeshPhysicalMaterial({
        color: 0xf0ebe0,
        roughness: 0.12,
        metalness: 0.0,
        clearcoat: 0.85,
        clearcoatRoughness: 0.08,
        reflectivity: 0.6,
      });
      if (this.envMap) { wp.envMap = this.envMap; wp.envMapIntensity = 0.6; }
      this.M['whitePc'] = wp;

      // Obsidian — deep black, slight gloss highlight, NOT chrome
      const bp = new THREE.MeshPhysicalMaterial({
        color: 0x18141e,
        roughness: 0.22,
        metalness: 0.0,
        clearcoat: 0.9,
        clearcoatRoughness: 0.15,
        emissive: new THREE.Color(0x120a1a),
        emissiveIntensity: 0.12,
        reflectivity: 0.7,
      });
      if (this.envMap) { bp.envMap = this.envMap; bp.envMapIntensity = 0.5; }
      this.M['blackPc'] = bp;

      // Gold — metallic, warm, for base rings
      const gp = new THREE.MeshPhysicalMaterial({
        color: 0xc8960c,
        roughness: 0.18,
        metalness: 1.0,
        emissive: new THREE.Color(0x7a5500),
        emissiveIntensity: 0.15,
      });
      if (this.envMap) { gp.envMap = this.envMap; gp.envMapIntensity = 1.2; }
      this.M['goldRing'] = gp;
    } else {
      this.M['whitePc'] = new THREE.MeshPhysicalMaterial({
        color: 0xf5ede0,
        roughness: 0.10, metalness: 0.0,
        clearcoat: 0.95, clearcoatRoughness: 0.07,
      });
      this.M['blackPc'] = new THREE.MeshPhysicalMaterial({
        color: 0x2c1a2e,
        roughness: 0.12, metalness: 0.0,
        clearcoat: 1.0, clearcoatRoughness: 0.05,
        emissive: new THREE.Color(0x1a0c20),
        emissiveIntensity: 0.25,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  STARS
  // ═══════════════════════════════════════════════════════════════════════════

  private buildStars() {
    const N   = 2000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r     = 60 + Math.random() * 140;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.cos(phi);
      pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
      const br = 0.5 + Math.random() * 0.5;
      col[i*3]   = br;
      col[i*3+1] = br * (0.7 + Math.random() * 0.3);
      col[i*3+2] = br;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.25, vertexColors: true, transparent: true, opacity: 0, sizeAttenuation: true
    }));
    this.scene.add(this.stars);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INTRO PARTICLES
  // ═══════════════════════════════════════════════════════════════════════════

  private buildIntroParticles() {
    const N   = 1800;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    this.particleOrigPos  = new Float32Array(N * 3);
    this.particleTargPos  = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      // Start: scattered sphere
      const r = 20 + Math.random() * 30;
      const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(p) * Math.cos(t);
      const y = r * Math.cos(p);
      const z = r * Math.sin(p) * Math.sin(t);
      pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z;
      this.particleOrigPos[i*3] = x; this.particleOrigPos[i*3+1] = y; this.particleOrigPos[i*3+2] = z;

      // Target: near board
      this.particleTargPos[i*3]   = (Math.random() - 0.5) * 12;
      this.particleTargPos[i*3+1] = Math.random() * 6;
      this.particleTargPos[i*3+2] = (Math.random() - 0.5) * 12;

      // Color: purple/blue/white galaxy palette
      const hue = Math.random();
      if (hue < 0.33) { col[i*3]=0.6; col[i*3+1]=0.4; col[i*3+2]=1.0; }
      else if (hue < 0.66) { col[i*3]=0.3; col[i*3+1]=0.7; col[i*3+2]=1.0; }
      else { col[i*3]=1.0; col[i*3+1]=1.0; col[i*3+2]=1.0; }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    this.introParticles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.12, vertexColors: true, transparent: true, opacity: 0, sizeAttenuation: true
    }));
    this.scene.add(this.introParticles);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BOARD
  // ═══════════════════════════════════════════════════════════════════════════

  private buildBoard() {
    // Ground plane — black marble table for overhead mode
    if (this.overhead) {
      const tableMat = new THREE.MeshPhysicalMaterial({
        color: 0x080606,
        roughness: 0.28,
        metalness: 0.0,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
        reflectivity: 0.5,
      });
      if (this.envMap) { tableMat.envMap = this.envMap; tableMat.envMapIntensity = 0.3; }
      const table = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), tableMat);
      table.rotation.x = -Math.PI / 2;
      table.position.y = -0.18;
      table.receiveShadow = true;
      this.scene.add(table);
    }

    // Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.14, 8.8), this.M['frame']);
    frame.position.y = -0.09;
    frame.receiveShadow = true;
    this.scene.add(frame);

    // Glow edges
    const hEdge = new THREE.BoxGeometry(8.4, 0.2, 0.05);
    const vEdge = new THREE.BoxGeometry(0.05, 0.2, 8.4);
    for (const [geo, px, pz] of [
      [hEdge, 0,    4.12] as const, [hEdge, 0,   -4.12] as const,
      [vEdge, 4.12, 0   ] as const, [vEdge,-4.12, 0   ] as const,
    ]) {
      const e = new THREE.Mesh(geo, this.M['edge']);
      e.position.set(px, 0.005, pz);
      this.scene.add(e);
    }

    // Tiles — start underground for intro
    const tileGeo = new THREE.BoxGeometry(0.96, 0.18, 0.96);
    for (let rank = 1; rank <= 8; rank++) {
      for (let fi = 0; fi < 8; fi++) {
        const sq  = `${String.fromCharCode(97 + fi)}${rank}` as Square;
        const lit = (fi + rank) % 2 === 1;
        const mat = (lit ? this.M['lightTile'] : this.M['darkTile']).clone();
        const tile = new THREE.Mesh(tileGeo, mat);
        tile.position.set(this.fx(fi), -5, this.rz(rank)); // start below ground
        tile.receiveShadow = true;
        tile.userData['sq'] = sq;
        this.scene.add(tile);
        this.tileMap.set(sq, tile);
      }
    }
  }

  private buildSharedGeos() {
    this.planeGeo   = new THREE.PlaneGeometry(0.92, 0.92);
    this.discGeo    = new THREE.CylinderGeometry(0.19, 0.19, 0.012, 24);
    this.ringGeo    = new THREE.TorusGeometry(0.38, 0.055, 8, 24);
    this.baseRingGeo = new THREE.TorusGeometry(0.21, 0.028, 10, 32);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  OVERHEAD MODE (2D replacement — no intro, fixed camera)
  // ═══════════════════════════════════════════════════════════════════════════

  private startOverhead() {
    // Cinematic angle — not pure top-down, slight front perspective
    this.camera.position.set(0, 12, 8);
    this.camera.lookAt(0, 0, 0);
    this.controls.enabled = true;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = Math.PI / 2.6;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 20;

    // Tiles immediately at final position
    for (const tile of this.tileMap.values()) tile.position.y = 0;

    // Spawn pieces from FEN immediately
    this.phase = 'play';
    try { this.chess.load(this.fen); } catch { /* */ }
    const board = this.chess.board();
    for (let ri = 0; ri < 8; ri++) {
      for (let fi = 0; fi < 8; fi++) {
        const p = board[ri][fi];
        if (!p) continue;
        const sq = `${String.fromCharCode(97 + fi)}${8 - ri}` as Square;
        this.spawnPieceAt(sq, p.type, p.color);
      }
    }

    const overlay = this.overlayRef?.nativeElement;
    if (overlay) { overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }

    this.refreshHighlights();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INTRO SEQUENCE
  // ═══════════════════════════════════════════════════════════════════════════

  private startIntro() {
    this.introT0 = performance.now();
    this.phase   = 'intro';

    // Load pieces underground for the rise animation
    try { this.chess.load(this.fen); } catch { /**/ }
    const board = this.chess.board();
    for (let ri = 0; ri < 8; ri++) {
      for (let fi = 0; fi < 8; fi++) {
        const p = board[ri][fi];
        if (!p) continue;
        const sq = `${String.fromCharCode(97 + fi)}${8 - ri}` as Square;
        const g  = this.spawnPieceAt(sq, p.type, p.color);
        // start underground
        g.position.y = -8;
      }
    }

    // Fade in overlay logo with delay
    setTimeout(() => {
      const logo = this.logoRef?.nativeElement;
      if (logo) { logo.style.opacity = '1'; logo.style.transform = 'translateY(0)'; }
    }, 1200);

    setTimeout(() => {
      const hint = this.hintRef?.nativeElement;
      if (hint) hint.style.opacity = '1';
    }, 3500);
  }

  private updateIntro(now: number) {
    if (this.phase !== 'intro' || !this.stars || !this.introParticles) return;
    const elapsed = now - this.introT0;
    const T = Math.min(elapsed / this.INTRO_DUR, 1);

    // ── Stars fade in ──────────────────────────────────────────
    (this.stars.material as THREE.PointsMaterial).opacity = easeIn(Math.min(T / 0.15, 1)) * 0.85;

    // ── Particles: fade in → swirl → fade out ─────────────────
    const pMat = this.introParticles.material as THREE.PointsMaterial;
    if (T < 0.12)      pMat.opacity = easeIn(T / 0.12) * 0.7;
    else if (T < 0.65) pMat.opacity = 0.7;
    else               pMat.opacity = 0.7 * (1 - (T - 0.65) / 0.35);

    // Particles converge toward board
    const pPos = this.introParticles.geometry.attributes['position'];
    const pArr = pPos.array as Float32Array;
    const N    = pArr.length / 3;
    const convT = easeOut(Math.min((T - 0.08) / 0.5, 1));
    for (let i = 0; i < N; i++) {
      const ox = this.particleOrigPos[i*3], oy = this.particleOrigPos[i*3+1], oz = this.particleOrigPos[i*3+2];
      const tx = this.particleTargPos[i*3], ty = this.particleTargPos[i*3+1], tz = this.particleTargPos[i*3+2];
      // also rotate slowly
      const angle = now * 0.0002;
      const rxox = ox * Math.cos(angle) - oz * Math.sin(angle);
      const rxoz = ox * Math.sin(angle) + oz * Math.cos(angle);
      pArr[i*3]   = rxox + (tx - rxox) * convT;
      pArr[i*3+1] = oy  + (ty - oy)   * convT;
      pArr[i*3+2] = rxoz + (tz - rxoz) * convT;
    }
    pPos.needsUpdate = true;

    // ── Camera fly-in ──────────────────────────────────────────
    if (T < 0.35) {
      const ct = easeOut(T / 0.35);
      this.camera.position.set(
        0,
        28 - (28 - 13) * ct,
        18 - (18 - 12) * ct
      );
      this.camera.lookAt(0, 0, 0);
    } else if (T >= 0.35 && T < 0.72) {
      const ct = easeOut((T - 0.35) / 0.37);
      this.camera.position.set(
        Math.sin(ct * Math.PI * 0.5) * 5,
        13 - (13 - 9) * ct,
        12 - (12 - 8.5) * ct
      );
      this.camera.lookAt(0, 0, 0);
    }

    // ── Board tiles rise (wave from center) ────────────────────
    if (T >= 0.2) {
      const bT = (T - 0.2) / 0.4;
      for (const [sq, tile] of this.tileMap) {
        const fi   = sq.charCodeAt(0) - 97;
        const rank = parseInt(sq[1]);
        const dx = fi - 3.5, dz = rank - 4.5;
        const dist  = Math.sqrt(dx * dx + dz * dz) / 5.66; // 0-1
        const delay = dist * 0.5;
        const lt    = easeOut(Math.max(0, Math.min(1, (bT - delay) / (1 - delay + 0.01))));
        tile.position.y = -5 + 5 * lt;
      }
    }

    // ── Pieces rise (staggered) ────────────────────────────────
    if (T >= 0.52) {
      const pT  = (T - 0.52) / 0.38;
      const all = [...this.pieceMap.entries()];
      all.forEach(([sq, g], idx) => {
        const delay = (idx / all.length) * 0.7;
        const lt    = easeOut(Math.max(0, Math.min(1, (pT - delay) / (1 - delay + 0.01))));
        const base  = this.sqToVec3(sq as Square);
        const ty    = base.y + this.yOff(g.userData['type']);
        g.position.y = -8 + (ty + 8) * lt;

        // Glow on landing
        const mat = (g.children[0] as THREE.Mesh)?.material as THREE.MeshStandardMaterial;
        if (mat?.emissiveIntensity !== undefined) {
          mat.emissiveIntensity = lt < 0.95 ? (1 - lt) * 2 : 0.15;
        }
      });
    }

    // ── Rim lights pulse ──────────────────────────────────────
    const pulseI = 1 + Math.sin(now * 0.003) * 0.5;
    const lights = this.scene.children.filter(c => c instanceof THREE.PointLight) as THREE.PointLight[];
    lights.forEach((l, i) => {
      if (i === 0) return;  // skip ambient
      l.intensity = l.userData['baseIntensity']
        ? l.userData['baseIntensity'] * pulseI
        : l.intensity;
    });

    // ── Outro: fade overlay, enable controls ─────────────────
    if (T >= 0.88) {
      const ft = (T - 0.88) / 0.12;
      const overlay = this.overlayRef?.nativeElement;
      if (overlay) overlay.style.opacity = `${1 - ft}`;
    }

    if (T >= 1) {
      this.onIntroComplete();
    }
  }

  private onIntroComplete() {
    this.phase = 'play';
    this.controls.enabled = true;
    const overlay = this.overlayRef?.nativeElement;
    if (overlay) { overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }
    // Tiles at final position
    for (const tile of this.tileMap.values()) tile.position.y = 0;
    // All pieces at final positions
    for (const [sq, g] of this.pieceMap) {
      const base = this.sqToVec3(sq as Square);
      g.position.set(base.x, base.y + this.yOff(g.userData['type']), base.z);
    }
    this.refreshHighlights();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HAND UPDATE
  // ═══════════════════════════════════════════════════════════════════════════



  // ═══════════════════════════════════════════════════════════════════════════
  //  PULSE RINGS (click feedback)
  // ═══════════════════════════════════════════════════════════════════════════

  private spawnPulse(sq: Square) {
    const p   = this.sqToVec3(sq);
    const mat = this.M['pulse'].clone();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.025, 6, 24),
      mat
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.1, p.z);
    this.scene.add(ring);
    this.pulseRings.push({ mesh: ring, t0: performance.now() });
  }

  private updatePulseRings(now: number) {
    this.pulseRings = this.pulseRings.filter(({ mesh, t0 }) => {
      const t = (now - t0) / 600;
      if (t >= 1) { this.scene.remove(mesh); return false; }
      const s = 0.1 + t * 1.2;
      mesh.scale.set(s, s, s);
      (mesh.material as THREE.MeshStandardMaterial).opacity = 0.85 * (1 - t);
      return true;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PIECES
  // ═══════════════════════════════════════════════════════════════════════════

  private spawnPieceAt(sq: Square, type: string, color: string): THREE.Group {
    const mat = (color === 'w' ? this.M['whitePc'] : this.M['blackPc']).clone();
    const g   = this.makePiece(type, mat);
    g.userData['type'] = type; g.userData['color'] = color;
    const base = this.sqToVec3(sq);
    g.position.set(base.x, base.y + this.yOff(type), base.z);
    g.castShadow = true;

    // Gold base ring — luxury detail on overhead mode
    if (this.overhead && this.M['goldRing']) {
      const ring = new THREE.Mesh(this.baseRingGeo, this.M['goldRing'].clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(base.x, base.y + 0.096, base.z);
      ring.castShadow = false;
      ring.receiveShadow = true;
      this.scene.add(ring);
      g.userData['goldRing'] = ring;
    }

    this.scene.add(g);
    this.pieceMap.set(sq, g);
    return g;
  }

  // Build a LatheGeometry from [r,y] profile points (rotated 32 segments)
  private lathe(pts: [number, number][], segs = 32): THREE.LatheGeometry {
    return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  }

  private makePiece(type: string, mat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, dy = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = dy; m.castShadow = true; m.receiveShadow = true; g.add(m);
    };

    switch (type) {
      case 'p': {
        // Pawn: wide base → narrow waist → ball head
        add(this.lathe([
          [0.22,0],[0.22,0.04],[0.18,0.08],[0.13,0.14],[0.11,0.22],
          [0.12,0.28],[0.14,0.32],[0.14,0.36],[0.12,0.38],[0.10,0.40],
        ]));
        add(new THREE.SphereGeometry(0.155, 20, 14), 0.52);
        break;
      }
      case 'r': {
        // Rook: solid base → column → battlements top
        add(this.lathe([
          [0.24,0],[0.24,0.04],[0.20,0.08],[0.16,0.14],[0.15,0.46],
          [0.19,0.48],[0.21,0.50],[0.21,0.58],
        ]));
        // Battlement slots (3 notches via small boxes subtracted visually)
        for (let i = 0; i < 4; i++) {
          const notch = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.13, 0.10), mat);
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          notch.position.set(Math.cos(a) * 0.16, 0.58, Math.sin(a) * 0.16);
          notch.castShadow = true; g.add(notch);
        }
        // Top cap
        add(new THREE.CylinderGeometry(0.185, 0.185, 0.06, 24), 0.62);
        break;
      }
      case 'n': {
        // Knight: base + stylised horse head
        add(this.lathe([
          [0.22,0],[0.22,0.04],[0.18,0.08],[0.14,0.14],[0.13,0.28],
          [0.14,0.32],[0.14,0.36],
        ]));
        // Neck
        const neck = new THREE.Mesh(
          new THREE.CylinderGeometry(0.10, 0.14, 0.22, 16), mat);
        neck.position.set(0.02, 0.47, 0.0); neck.rotation.x = -0.30;
        neck.castShadow = true; g.add(neck);
        // Head — elongated sphere tilted forward
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat);
        head.scale.set(0.80, 1.20, 1.0);
        head.position.set(0.03, 0.68, -0.04); head.rotation.x = -0.32;
        head.castShadow = true; g.add(head);
        // Snout
        const snout = new THREE.Mesh(
          new THREE.CylinderGeometry(0.065, 0.080, 0.14, 12), mat);
        snout.position.set(0.03, 0.60, -0.14); snout.rotation.x = 1.20;
        snout.castShadow = true; g.add(snout);
        // Ears
        for (const ex of [-0.045, 0.045]) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.030, 0.08, 8), mat);
          ear.position.set(ex, 0.80, -0.01);
          ear.castShadow = true; g.add(ear);
        }
        break;
      }
      case 'b': {
        // Bishop: tall tapered body → collar ring → round head → finial
        add(this.lathe([
          [0.22,0],[0.22,0.04],[0.18,0.08],[0.12,0.16],[0.08,0.42],
          [0.10,0.48],[0.12,0.52],[0.12,0.56],[0.08,0.58],
        ]));
        add(new THREE.TorusGeometry(0.10, 0.030, 10, 24), 0.60);
        add(new THREE.SphereGeometry(0.115, 20, 14), 0.74);
        // Bishop finial (small ball on top)
        add(new THREE.SphereGeometry(0.038, 12, 10), 0.87);
        break;
      }
      case 'q': {
        // Queen: wide base → waist → crown ring with 8 balls → top sphere
        add(this.lathe([
          [0.26,0],[0.26,0.04],[0.22,0.09],[0.15,0.18],[0.12,0.40],
          [0.14,0.46],[0.18,0.52],[0.18,0.60],[0.14,0.62],[0.10,0.64],
        ]));
        // Crown torus
        add(new THREE.TorusGeometry(0.155, 0.038, 10, 24), 0.68);
        // 8 crown ball points
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.040, 10, 8), mat);
          ball.position.set(Math.cos(a) * 0.155, 0.73, Math.sin(a) * 0.155);
          ball.castShadow = true; g.add(ball);
        }
        // Top sphere
        add(new THREE.SphereGeometry(0.100, 20, 14), 0.82);
        break;
      }
      case 'k': {
        // King: wide base → column → crown ring → cross
        add(this.lathe([
          [0.27,0],[0.27,0.04],[0.23,0.09],[0.16,0.18],[0.13,0.44],
          [0.16,0.50],[0.20,0.56],[0.20,0.64],[0.15,0.66],[0.11,0.68],
        ]));
        // Crown torus
        add(new THREE.TorusGeometry(0.14, 0.034, 10, 24), 0.72);
        // Cross — horizontal bar
        add(new THREE.BoxGeometry(0.28, 0.070, 0.070), 0.815);
        // Cross — vertical bar (taller)
        add(new THREE.BoxGeometry(0.070, 0.24, 0.070), 0.87);
        break;
      }
    }
    return g;
  }

  private handleFenChange(oldFen: string | undefined, newFen: string) {
    if (!oldFen || oldFen === newFen) return;
    const prevChess = new Chess(), nextChess = new Chess();
    try { prevChess.load(oldFen); nextChess.load(newFen); } catch { this.fullRebuild(newFen); return; }

    const prevMap = this.fenToMap(prevChess);
    const nextMap = this.fenToMap(nextChess);

    const lost   = new Map<Square, { type: string; color: string }>();
    const gained = new Map<Square, { type: string; color: string }>();
    for (const [sq, p] of prevMap) {
      const n = nextMap.get(sq);
      if (!n || n.type !== p.type || n.color !== p.color) lost.set(sq, p);
    }
    for (const [sq, p] of nextMap) {
      const o = prevMap.get(sq);
      if (!o || o.type !== p.type || o.color !== p.color) gained.set(sq, p);
    }

    const used = new Set<Square>();
    for (const [fromSq, lp] of lost) {
      let destSq: Square | null = null;
      for (const [gSq, gp] of gained) {
        if (!used.has(gSq) && gp.color === lp.color && (gp.type === lp.type || lp.type === 'p')) {
          destSq = gSq; break;
        }
      }
      const grp = this.pieceMap.get(fromSq);
      if (destSq && grp) {
        used.add(destSq);
        // Capture existing at dest
        const enemy = this.pieceMap.get(destSq);
        if (enemy && enemy !== grp) {
          this.pieceMap.delete(destSq);
          this.animatePiece(enemy, enemy.position.clone(),
            new THREE.Vector3(enemy.position.x, enemy.position.y + 3.5, enemy.position.z), 220, 0.5, true);
          setTimeout(() => this.removeGroup(enemy), 260);
        }
        const toBase = this.sqToVec3(destSq);
        const destT  = gained.get(destSq)!.type;
        const toPos  = new THREE.Vector3(toBase.x, toBase.y + this.yOff(destT), toBase.z);
        this.animatePiece(grp, grp.position.clone(), toPos, 360, 1.6);
        this.pieceMap.delete(fromSq);
        this.pieceMap.set(destSq, grp);
        grp.userData['type'] = destT;
        this.spawnPulse(destSq);
      } else if (grp) {
        const cp = grp.position.clone();
        this.animatePiece(grp, cp, new THREE.Vector3(cp.x, cp.y + 3.5, cp.z), 220, 0.5, true);
        this.pieceMap.delete(fromSq);
        setTimeout(() => this.removeGroup(grp), 260);
      }
    }
    for (const [sq, p] of gained) {
      if (!used.has(sq) && !this.pieceMap.has(sq)) this.spawnPieceAt(sq, p.type, p.color);
    }
    try { this.chess.load(newFen); } catch { /**/ }
  }

  private removeGroup(g: THREE.Group) {
    const ring = g.userData['goldRing'] as THREE.Mesh | undefined;
    if (ring) this.scene.remove(ring);
    this.scene.remove(g);
  }

  private fullRebuild(fen: string) {
    for (const [, g] of this.pieceMap) this.removeGroup(g);
    this.pieceMap.clear();
    this.chess = new Chess();
    try { this.chess.load(fen); } catch { return; }
    const board = this.chess.board();
    for (let ri = 0; ri < 8; ri++) {
      for (let fi = 0; fi < 8; fi++) {
        const p = board[ri][fi];
        if (p) this.spawnPieceAt(`${String.fromCharCode(97 + fi)}${8 - ri}` as Square, p.type, p.color);
      }
    }
  }

  private fenToMap(ch: Chess): Map<Square, { type: string; color: string }> {
    const map = new Map<Square, { type: string; color: string }>();
    const board = ch.board();
    for (let ri = 0; ri < 8; ri++) for (let fi = 0; fi < 8; fi++) {
      const p = board[ri][fi];
      if (p) map.set(`${String.fromCharCode(97 + fi)}${8 - ri}` as Square, { type: p.type, color: p.color });
    }
    return map;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HIGHLIGHTS
  // ═══════════════════════════════════════════════════════════════════════════

  private refreshHighlights() {
    for (const [, o] of this.hlMap) this.scene.remove(o);
    this.hlMap.clear();
    if (this.phase !== 'play') return;

    const addPlane = (sq: Square, mat: THREE.MeshStandardMaterial) => {
      const mesh = new THREE.Mesh(this.planeGeo, mat.clone());
      mesh.rotation.x = -Math.PI / 2;
      const p = this.sqToVec3(sq);
      mesh.position.set(p.x, 0.092, p.z);
      this.scene.add(mesh); this.hlMap.set(sq + '_p', mesh);
    };
    const addDisc = (sq: Square, mat: THREE.MeshStandardMaterial) => {
      const mesh = new THREE.Mesh(this.discGeo, mat.clone());
      const p = this.sqToVec3(sq);
      mesh.position.set(p.x, 0.094, p.z);
      this.scene.add(mesh); this.hlMap.set(sq + '_d', mesh);
    };
    const addRing = (sq: Square, mat: THREE.MeshStandardMaterial) => {
      const mesh = new THREE.Mesh(this.ringGeo, mat.clone());
      mesh.rotation.x = -Math.PI / 2;
      const p = this.sqToVec3(sq);
      mesh.position.set(p.x, 0.097, p.z);
      this.scene.add(mesh); this.hlMap.set(sq + '_r', mesh);
    };

    if (this.lastMove) { addPlane(this.lastMove.from, this.M['lastMov']); addPlane(this.lastMove.to, this.M['lastMov']); }
    if (this.selectedSquare) addPlane(this.selectedSquare, this.M['selected']);
    for (const sq of this.legalMoves) {
      this.pieceMap.has(sq) ? addRing(sq, this.M['capture']) : addDisc(sq, this.M['legal']);
    }
    if (this.checkSquare) addPlane(this.checkSquare, this.M['check']);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CAMERA FLIP
  // ═══════════════════════════════════════════════════════════════════════════

  private camFlip: { t0: number; fz: number; tz: number } | null = null;

  private kickCameraFlip() {
    this.camFlip = { t0: performance.now(), fz: this.camera.position.z, tz: this.isFlipped ? -8.5 : 8.5 };
  }

  private processCamFlip(now: number) {
    if (!this.camFlip) return;
    const t = Math.min((now - this.camFlip.t0) / 700, 1);
    const e = easeOut(t);
    this.camera.position.z = this.camFlip.fz + (this.camFlip.tz - this.camFlip.fz) * e;
    this.camera.lookAt(0, 0, 0);
    if (t >= 1) this.camFlip = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PIECE ANIMATION
  // ═══════════════════════════════════════════════════════════════════════════

  private animatePiece(g: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, dur: number, arc = 1.5, vanish = false) {
    this.pieceAnims.push({ group: g, from: from.clone(), to: to.clone(), t0: performance.now(), dur, arc, vanish });
  }

  private processPieceAnims(now: number) {
    this.pieceAnims = this.pieceAnims.filter(a => {
      const t = Math.min((now - a.t0) / a.dur, 1);
      const e = easeInOut(t);
      const x = a.from.x + (a.to.x - a.from.x) * e;
      const z = a.from.z + (a.to.z - a.from.z) * e;
      const arcY = a.vanish ? 0 : Math.sin(t * Math.PI) * a.arc;
      const y = a.from.y + (a.to.y - a.from.y) * e + arcY;
      a.group.position.set(x, y, z);
      // sync gold base ring
      const ring = a.group.userData['goldRing'] as THREE.Mesh | undefined;
      if (ring) ring.position.set(x, y - this.yOff(a.group.userData['type']) + 0.096, z);
      return t < 1;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  private startLoop() {
    const loop = () => {
      this.animId = requestAnimationFrame(loop);
      const now = performance.now();
      this.updateIntro(now);
      this.processPieceAnims(now);
      this.processCamFlip(now);

      this.updatePulseRings(now);
      if (this.phase === 'play') this.animateHighlights(now);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  private animateHighlights(now: number) {
    // Gentle pulse on selected/check highlights
    for (const [key, obj] of this.hlMap) {
      const mesh = obj as THREE.Mesh;
      const mat  = mesh.material as THREE.MeshStandardMaterial;
      if (key.endsWith('_p') && mat.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = 0.35 + Math.sin(now * 0.003) * 0.2;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RESIZE
  // ═══════════════════════════════════════════════════════════════════════════

  private setupResize() {
    this.resizeObs = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width > 0 && height > 0) {
          this.renderer.setSize(width, height, false);
          this.camera.aspect = width / height;
          this.camera.updateProjectionMatrix();
        }
      }
    });
    this.resizeObs.observe(this.wrapperRef.nativeElement);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  private setupEvents() {
    const canvas = this.canvasRef.nativeElement;
    let downX = 0, downY = 0;

    // Click detection
    canvas.addEventListener('mousedown', (e: MouseEvent) => { downX = e.clientX; downY = e.clientY; });
    canvas.addEventListener('mouseup',   (e: MouseEvent) => {
      if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return;
      const sq = this.squareFromMouse(e.clientX, e.clientY);
      if (sq) {
        this.ngZone.run(() => this.squareClick.emit(sq));
        this.spawnPulse(sq);
      }
    });
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      downX = e.touches[0].clientX; downY = e.touches[0].clientY;
    }, { passive: true });
    canvas.addEventListener('touchend', (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (Math.abs(t.clientX - downX) > 8 || Math.abs(t.clientY - downY) > 8) return;
      const sq = this.squareFromMouse(t.clientX, t.clientY);
      if (sq) { this.ngZone.run(() => this.squareClick.emit(sq)); this.spawnPulse(sq); }
    });

  }

  private squareFromMouse(cx: number, cy: number): Square | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.toNDC(cx, cy), this.camera);
    const hits = ray.intersectObjects([...this.tileMap.values()]);
    return hits.length > 0 ? (hits[0].object.userData['sq'] as Square) : null;
  }

  private toNDC(cx: number, cy: number): THREE.Vector2 {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((cx - rect.left) / rect.width)  * 2 - 1,
      -((cy - rect.top) / rect.height) * 2 + 1
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private fx(fi: number)   { return fi - 3.5; }
  private rz(rank: number) { return 3.5 - (rank - 1); }

  private sqToVec3(sq: Square): THREE.Vector3 {
    return new THREE.Vector3(this.fx(sq.charCodeAt(0) - 97), 0.09, this.rz(parseInt(sq[1])));
  }

  private yOff(type: string): number {
    return ({ p: 0.3, r: 0.33, n: 0.36, b: 0.39, q: 0.43, k: 0.46 } as Record<string, number>)[type] ?? 0.3;
  }
}

// ─── Easing ──────────────────────────────────────────────────────────────────

function easeOut(t: number): number  { return 1 - Math.pow(1 - t, 3); }
function easeIn(t: number): number   { return t * t * t; }
function easeInOut(t: number): number { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }

// ─── Material helper ─────────────────────────────────────────────────────────

function m(p: {
  color?: number; roughness?: number; metalness?: number;
  emissive?: number; emissiveInt?: number;
  transparent?: boolean; opacity?: number;
}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color:            p.color    ?? 0xffffff,
    roughness:        p.roughness ?? 0.5,
    metalness:        p.metalness ?? 0.1,
    emissive:         p.emissive !== undefined ? new THREE.Color(p.emissive) : new THREE.Color(0),
    emissiveIntensity: p.emissiveInt ?? 0,
    transparent:      p.transparent ?? false,
    opacity:          p.opacity  ?? 1,
  });
}
