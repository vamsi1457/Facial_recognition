"use client";

import { useState, useRef, useEffect } from "react";

export default function LiveFacialExpressionRecognition() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentPrediction, setCurrentPrediction] = useState(null);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const [frameCount, setFrameCount] = useState(0);

  // Start webcam - SIMPLIFIED VERSION
  const startWebcam = async () => {
    try {
      setError("");
      setDebugInfo("Requesting camera access...");
      console.log("Starting camera...");

      // Simple camera request
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          facingMode: "user",
        },
      });

      console.log("Camera stream obtained:", stream);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Wait for video to load
        videoRef.current.onloadedmetadata = () => {
          console.log("Video metadata loaded");
          videoRef.current
            .play()
            .then(() => {
              console.log("Video playing successfully");
              setIsStreaming(true);
              setDebugInfo("Camera active - Ready for analysis");
              startLiveAnalysis();
            })
            .catch((err) => {
              console.error("Video play error:", err);
              setError(`Failed to start video playback: ${err.message}`);
            });
        };

        videoRef.current.onerror = (err) => {
          console.error("Video error:", err);
          setError("Video element error occurred");
        };
      }
    } catch (err) {
      console.error("Camera error:", err);
      if (err.name === "NotAllowedError") {
        setError(
          "Camera permission denied. Please allow camera access and try again.",
        );
      } else if (err.name === "NotFoundError") {
        setError("No camera found. Please connect a camera.");
      } else if (err.name === "NotReadableError") {
        setError(
          "Camera is busy or unavailable. Please close other apps using the camera.",
        );
      } else {
        setError(`Camera error: ${err.message}`);
      }
      setDebugInfo("");
    }
  };

  // Stop webcam
  const stopWebcam = () => {
    console.log("Stopping camera...");

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log("Stopped track:", track);
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
    setCurrentPrediction(null);
    setError("");
    setDebugInfo("");
    setFrameCount(0);
  };

  // Capture frame and analyze
  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) {
      console.log("Cannot capture - missing refs or already analyzing");
      return;
    }

    try {
      setIsAnalyzing(true);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      // Check if video is ready
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.log("Video not ready yet");
        setIsAnalyzing(false);
        return;
      }

      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to base64
      const base64Image = canvas.toDataURL("image/jpeg", 0.8);

      console.log("Frame captured, sending to API...");
      setFrameCount((prev) => prev + 1);

      // Send to API
      const response = await fetch("/api/predict-emotion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64Image,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const prediction = await response.json();
      console.log("Prediction received:", prediction);

      setCurrentPrediction(prediction);
      drawBoundingBox(prediction);
    } catch (err) {
      console.error("Analysis error:", err);
      setError(`Analysis failed: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Draw bounding box on overlay
  const drawBoundingBox = (prediction) => {
    if (!overlayCanvasRef.current || !prediction || !videoRef.current) return;

    const overlay = overlayCanvasRef.current;
    const ctx = overlay.getContext("2d");
    const video = videoRef.current;

    // Clear previous drawings
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Only draw if we have valid coordinates
    if (
      prediction.x &&
      prediction.y &&
      prediction.w &&
      prediction.h &&
      prediction.emotion !== "No face detected"
    ) {
      const { x, y, w, h, emotion, confidence } = prediction;

      // Draw green rectangle
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      // Draw label background
      const label = `${emotion} (${Math.round(confidence * 100)}%)`;
      ctx.font = "bold 16px Arial";
      const textWidth = ctx.measureText(label).width;
      const textHeight = 20;

      ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
      ctx.fillRect(x, y - textHeight - 5, textWidth + 10, textHeight);

      // Draw label text
      ctx.fillStyle = "#000000";
      ctx.fillText(label, x + 5, y - 8);
    }
  };

  // Start live analysis
  const startLiveAnalysis = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    console.log("Starting live analysis...");
    intervalRef.current = setInterval(() => {
      captureAndAnalyze();
    }, 300); // Every 300ms
  };

  // Setup overlay canvas when streaming starts
  useEffect(() => {
    if (isStreaming && videoRef.current && overlayCanvasRef.current) {
      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;

      const setupOverlay = () => {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
        console.log(
          "Overlay canvas setup:",
          overlay.width,
          "x",
          overlay.height,
        );
      };

      if (video.videoWidth > 0) {
        setupOverlay();
      } else {
        video.addEventListener("loadedmetadata", setupOverlay);
        return () => video.removeEventListener("loadedmetadata", setupOverlay);
      }
    }
  }, [isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopWebcam();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Live Facial Expression Recognition
          </h1>
          <p className="text-gray-600">
            Real-time AI emotion detection with bounding boxes
          </p>
        </div>

        {/* Debug Info */}
        {debugInfo && (
          <div className="mb-4 p-3 bg-blue-100 text-blue-800 rounded-lg text-sm text-center">
            {debugInfo}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg text-center">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {/* Camera Feed */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Camera Feed</h2>
                {isStreaming && (
                  <span className="text-green-500 text-sm">● LIVE</span>
                )}
              </div>

              {/* Video Container */}
              <div
                className="relative bg-black rounded-lg overflow-hidden"
                style={{ aspectRatio: "4/3" }}
              >
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                  style={{ transform: "scaleX(-1)" }} // Mirror effect
                />
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  style={{ transform: "scaleX(-1)" }} // Mirror effect
                />
              </div>

              {/* Controls */}
              <div className="mt-4 flex gap-3">
                {!isStreaming ? (
                  <button
                    onClick={startWebcam}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Start Camera
                  </button>
                ) : (
                  <button
                    onClick={stopWebcam}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Stop Camera
                  </button>
                )}
              </div>

              {/* Hidden canvas for frame capture */}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>

          {/* Results Panel */}
          <div>
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Live Detection</h3>

              {currentPrediction ? (
                <div className="text-center">
                  <div className="text-4xl mb-3">
                    {currentPrediction.emotion === "Happy" && "😊"}
                    {currentPrediction.emotion === "Sad" && "😢"}
                    {currentPrediction.emotion === "Angry" && "😠"}
                    {currentPrediction.emotion === "Surprise" && "😲"}
                    {currentPrediction.emotion === "Fear" && "😨"}
                    {currentPrediction.emotion === "Disgust" && "🤢"}
                    {currentPrediction.emotion === "Neutral" && "😐"}
                    {currentPrediction.emotion === "No face detected" && "❓"}
                  </div>
                  <div className="text-xl font-bold text-gray-800 mb-2">
                    {currentPrediction.emotion}
                  </div>
                  <div className="text-gray-600 mb-2">
                    Confidence: {Math.round(currentPrediction.confidence * 100)}
                    %
                  </div>
                  {currentPrediction.x > 0 && (
                    <div className="text-sm text-gray-500">
                      Box: ({currentPrediction.x}, {currentPrediction.y}){" "}
                      {currentPrediction.w}×{currentPrediction.h}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-3">📷</div>
                  <p>Waiting for detection...</p>
                  <p className="text-sm mt-1">Start camera to begin</p>
                </div>
              )}
            </div>

            {/* Stats */}
            {isStreaming && (
              <div className="bg-white rounded-xl shadow-lg p-6 mt-4">
                <h3 className="text-lg font-semibold mb-4">Stats</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Frames:</span>
                    <span className="font-medium">{frameCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rate:</span>
                    <span className="font-medium">~3.3 FPS</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className="text-green-500">● Active</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
