import React, { useEffect, useRef, useState, useCallback } from 'react';
import { visionService } from './services/visionService';
import { SceneController } from './components/SceneController';
import LoadingOverlay from './components/LoadingOverlay';
import { PINCH_THRESHOLD } from './constants';
import { AppState, ParticleState } from './types';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.LOADING);
  // We use both State (for React updates) and Ref (for synchronous access in RAF loop)
  const [particleState, setParticleState] = useState<ParticleState>(ParticleState.SPHERE);
  const particleStateRef = useRef<ParticleState>(ParticleState.SPHERE);
  
  const [debugText, setDebugText] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneControllerRef = useRef<SceneController | null>(null);
  const requestRef = useRef<number>();

  // Initialize MediaPipe
  useEffect(() => {
    visionService.initialize().then(() => {
      setAppState(AppState.READY_TO_START);
    }).catch((err) => {
      console.error("Failed to load vision tasks", err);
      setAppState(AppState.ERROR);
    });
  }, []);

  const handleStart = async () => {
    setAppState(AppState.RUNNING);
    
    // Initialize Three.js Scene
    if (canvasRef.current) {
      sceneControllerRef.current = new SceneController(canvasRef.current);
    }

    // Start Camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', predictWebcam);
      }
    } catch (err) {
      console.error("Camera access denied", err);
      setAppState(AppState.ERROR);
    }
  };

  const predictWebcam = useCallback(() => {
    if (!videoRef.current || !sceneControllerRef.current) return;

    // Detect gestures
    const results = visionService.detect(videoRef.current);

    if (results && results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      
      // 1. Calculate Hand Center
      const handX = landmarks[9].x;
      const handY = landmarks[9].y;
      
      sceneControllerRef.current.updateHandPosition(handX, handY);

      // 2. Gesture Logic
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];

      // Calculate Euclidean distance
      const distance = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) + 
        Math.pow(thumbTip.y - indexTip.y, 2)
      );

      const detectedGestures = results.gestures.length > 0 ? results.gestures[0] : [];
      const isOpenPalm = detectedGestures.some(g => g.categoryName === 'Open_Palm' && g.score > 0.5);

      if (distance < PINCH_THRESHOLD) {
        // PINCH DETECTED (Create)
        // Check against Ref to avoid stale closure issues
        if (particleStateRef.current !== ParticleState.SPHERE) {
          particleStateRef.current = ParticleState.SPHERE;
          setParticleState(ParticleState.SPHERE);
          sceneControllerRef.current.triggerAssembly();
        }
        setDebugText('Gesture: Pinch (Create)');
      } else if (isOpenPalm || distance > 0.2) {
        // OPEN PALM DETECTED (Explode)
        if (particleStateRef.current !== ParticleState.EXPLODED) {
          particleStateRef.current = ParticleState.EXPLODED;
          setParticleState(ParticleState.EXPLODED);
          sceneControllerRef.current.triggerExplosion();
        }
        setDebugText('Gesture: Open Palm (Explode)');
      } else {
        setDebugText('Gesture: Tracking...');
      }

    } else {
      setDebugText('No Hand Detected');
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
  }, []); // Empty dependency array ensures stable closure for RAF

  // Cleanup
  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (sceneControllerRef.current) sceneControllerRef.current.cleanup();
    };
  }, []);

  return (
    // Removed bg-stone-900 to ensure video visibility if layers are tricky
    <div className="relative w-full h-screen overflow-hidden bg-black">
      
      {/* Background Video */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${appState === AppState.RUNNING ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Dark Overlay for Contrast */}
      <div 
        className={`absolute inset-0 bg-stone-950/40 pointer-events-none transition-opacity duration-1000 ${appState === AppState.RUNNING ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* 3D Canvas */}
      <canvas 
        ref={canvasRef} 
        className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-1000 ${appState === AppState.RUNNING ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* UI Overlay */}
      <LoadingOverlay 
        isVisible={appState !== AppState.RUNNING} 
        isLoading={appState === AppState.LOADING}
        onStart={handleStart} 
      />

      {/* Status HUD (Sticky CTA/Info) */}
      {appState === AppState.RUNNING && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-stone-950/50 backdrop-blur-md border border-stone-800 rounded-full px-6 py-2 shadow-lg">
             <p className="text-violet-400 font-mono text-sm tracking-widest uppercase">
               {debugText}
             </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;