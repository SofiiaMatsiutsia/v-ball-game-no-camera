import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

class VisionService {
  private gestureRecognizer: GestureRecognizer | null = null;
  private lastVideoTime = -1;

  async initialize() {
    if (this.gestureRecognizer) return;

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
    );

    this.gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
        delegate: 'CPU',
      },
      runningMode: 'LIVE_STREAM',
      numHands: 1,
    });
  }

  detect(video: HTMLVideoElement) {
    if (!this.gestureRecognizer) return null;
    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      const results = this.gestureRecognizer.recognizeForVideo(video, Date.now());
      return results;
    }
    return null;
  }
}

export const visionService = new VisionService();