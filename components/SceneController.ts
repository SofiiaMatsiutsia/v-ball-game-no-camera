import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';
import { PARTICLE_COUNT, SPHERE_RADIUS, EXPLOSION_RADIUS, COLOR_CORE } from '../constants';

export class SceneController {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private particles: THREE.Points | null = null;
  
  // Data arrays
  private spherePositions: Float32Array;
  private explosionPositions: Float32Array;
  private currentPositions: Float32Array;

  // Animation state
  private explosionFactor = { value: 0 }; 
  
  // Cleanup
  private frameId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    
    // Camera setup
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.z = 8;

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ 
      canvas, 
      antialias: true, 
      alpha: true, // Critical for transparency
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0); // Clear to fully transparent black
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 1;

    // Post-processing Setup
    // We must use a render target with RGBA format to preserve the transparent background
    const renderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth,
      window.innerHeight,
      {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat, // Ensures alpha channel is preserved
        colorSpace: THREE.SRGBColorSpace,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        samples: 4,
        stencilBuffer: false,
        depthBuffer: true
      }
    );

    const renderScene = new RenderPass(this.scene, this.camera);
    renderScene.clearColor = new THREE.Color(0x000000);
    renderScene.clearAlpha = 0; // Explicitly clear alpha to 0
    
    const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
    // Strength: 1, Radius: 0.08, Threshold: 0
    this.bloomPass = new UnrealBloomPass(resolution, 1, 0.08, 0);

    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(renderScene);
    this.composer.addPass(this.bloomPass);

    // Initialize data
    this.spherePositions = new Float32Array(PARTICLE_COUNT * 3);
    this.explosionPositions = new Float32Array(PARTICLE_COUNT * 3);
    this.currentPositions = new Float32Array(PARTICLE_COUNT * 3);

    this.initParticles();
    this.initLighting();
    
    window.addEventListener('resize', this.handleResize);
    this.animate();
  }

  private initLighting() {
    // Soft violet ambient light
    const ambientLight = new THREE.AmbientLight(0x2e1065, 0.5); 
    this.scene.add(ambientLight);

    // Bright fuchsia point light
    const pointLight = new THREE.PointLight(0xd946ef, 2, 50);
    pointLight.position.set(2, 2, 5);
    this.scene.add(pointLight);
  }

  private initParticles() {
    const geometry = new THREE.BufferGeometry();
    
    // Create Sphere positions and Explosion positions
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // 1. Sphere Shape (using spherical coordinates for even distribution)
      const phi = Math.acos(-1 + (2 * i) / PARTICLE_COUNT);
      const theta = Math.sqrt(PARTICLE_COUNT * Math.PI) * phi;

      const sx = SPHERE_RADIUS * Math.cos(theta) * Math.sin(phi);
      const sy = SPHERE_RADIUS * Math.sin(theta) * Math.sin(phi);
      const sz = SPHERE_RADIUS * Math.cos(phi);

      this.spherePositions[i3] = sx;
      this.spherePositions[i3 + 1] = sy;
      this.spherePositions[i3 + 2] = sz;

      // 2. Explosion Shape (Random outward vectors)
      const u = Math.random();
      const v = Math.random();
      const thetaR = 2 * Math.PI * u;
      const phiR = Math.acos(2 * v - 1);
      const r = SPHERE_RADIUS + (Math.random() * (EXPLOSION_RADIUS - SPHERE_RADIUS));

      this.explosionPositions[i3] = r * Math.sin(phiR) * Math.cos(thetaR);
      this.explosionPositions[i3 + 1] = r * Math.sin(phiR) * Math.sin(thetaR);
      this.explosionPositions[i3 + 2] = r * Math.cos(phiR);

      // Initial state = sphere
      this.currentPositions[i3] = sx;
      this.currentPositions[i3 + 1] = sy;
      this.currentPositions[i3 + 2] = sz;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this.currentPositions, 3));

    // Material
    const material = new THREE.PointsMaterial({
      color: COLOR_CORE,
      size: 0.08,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      depthWrite: false, // Helps with blending and transparency
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  public updateHandPosition(x: number, y: number) {
    // Map normalized 2D (0-1) to 3D world space
    // Assuming camera Z is 8, we roughly map screen space to a plane at Z=0
    const vec = new THREE.Vector3();
    const pos = new THREE.Vector3();
    
    vec.set(
        (x * 2) - 1,
        -(y * 2) + 1,
        0.5 );

    vec.unproject( this.camera );
    vec.sub( this.camera.position ).normalize();

    const distance = -this.camera.position.z / vec.z;
    pos.copy( this.camera.position ).add( vec.multiplyScalar( distance ) );

    // Smoothly interpolate the group position
    if (this.particles) {
        gsap.to(this.particles.position, {
            x: pos.x,
            y: pos.y,
            z: pos.z,
            duration: 0.2,
            overwrite: true
        });
    }
  }

  public triggerExplosion() {
    gsap.to(this.explosionFactor, {
      value: 1,
      duration: 0.8,
      ease: "power2.out"
    });
    
    // Increase Bloom Strength
    gsap.to(this.bloomPass, {
      strength: 2,
      duration: 0.8,
      ease: "power2.out"
    });
  }

  public triggerAssembly() {
    gsap.to(this.explosionFactor, {
      value: 0,
      duration: 0.6,
      ease: "power2.inOut"
    });

    // Reset Bloom Strength
    gsap.to(this.bloomPass, {
      strength: 1,
      duration: 0.6,
      ease: "power2.inOut"
    });
  }

  private handleResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };

  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);

    if (this.particles) {
      // Rotation for visual flair
      this.particles.rotation.y += 0.002;
      this.particles.rotation.z += 0.001;

      // Interpolate positions based on explosionFactor
      const positions = this.particles.geometry.attributes.position.array as Float32Array;
      const factor = this.explosionFactor.value;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        // Linear interpolation between sphere and explosion
        positions[i3] = this.spherePositions[i3] * (1 - factor) + this.explosionPositions[i3] * factor;
        positions[i3 + 1] = this.spherePositions[i3 + 1] * (1 - factor) + this.explosionPositions[i3 + 1] * factor;
        positions[i3 + 2] = this.spherePositions[i3 + 2] * (1 - factor) + this.explosionPositions[i3 + 2] * factor;
      }

      this.particles.geometry.attributes.position.needsUpdate = true;
      
      // Dynamic color shift
      const mat = this.particles.material as THREE.PointsMaterial;
      if (factor > 0.5) {
          mat.color.setHex(0xe879f9); // Fuchsia when exploded
      } else {
          mat.color.setHex(0x8b5cf6); // Violet when compact
      }
    }

    this.composer.render();
  };

  public cleanup() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
  }
}