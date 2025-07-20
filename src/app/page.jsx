// /app/page.jsx

'use client';

import { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';

export default function Home() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const animationFrameId = useRef();

  // --- State Variables ---
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  // 1. Load Face-API Models & Get Devices
  useEffect(() => {
    const loadModelsAndGetDevices = async () => {
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      ]);
      setIsModelsLoaded(true);
      console.log('Face-API models loaded successfully.');

      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const availableVideoDevices = devices.filter(device => device.kind === 'videoinput');
        setVideoDevices(availableVideoDevices);
        
        if (availableVideoDevices.length > 0) {
          setSelectedDeviceId(availableVideoDevices[0].deviceId);
        }
        tempStream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error("Error getting devices or initial permission:", err);
      }
    };
    loadModelsAndGetDevices();
  }, []);

  // 2. Start/Switch Video Stream
  useEffect(() => {
    if (!isModelsLoaded || !selectedDeviceId) return;

    const startVideoStream = async () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }

      try {
        const constraints = {
          video: { 
            deviceId: { exact: selectedDeviceId },
            width: 640, 
            height: 480 
          },
          audio: true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error accessing webcam:', err);
      }
    };
    startVideoStream();
  }, [selectedDeviceId, isModelsLoaded]);

  // 3. Main face detection and drawing loop (FIXED TO PREVENT BLINKING)
  const handleVideoPlay = () => {
    if (videoRef.current && canvasRef.current) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
    }
      
    const detectFaces = async () => {
      if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const displaySize = { width: video.videoWidth, height: video.videoHeight };
        
        if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
            canvas.width = displaySize.width;
            canvas.height = displaySize.height;
        }

        faceapi.matchDimensions(canvas, displaySize);
        const detections = await faceapi.detectAllFaces(video, new faceapi.SsdMobilenetv1Options());
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Clear only the canvas, don't draw the video frame onto it
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Draw just the detections on the transparent canvas
          faceapi.draw.drawDetections(canvas, resizedDetections);
        }
      }
      animationFrameId.current = requestAnimationFrame(detectFaces);
    };
    detectFaces();
  };

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // 4. Handle Video Recording (FIXED TO RECORD THE SMOOTH VIDEO FEED)
  const handleStartRecording = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      // Record the clean stream directly from the video element
      const stream = videoRef.current.srcObject;
      
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks((prev) => [...prev, event.data]);
        }
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setVideoUrl(null);
      console.log('Recording started.');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      console.log('Recording stopped.');
    }
  };

  useEffect(() => {
    if (!isRecording && recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setRecordedChunks([]);
    }
  }, [isRecording, recordedChunks]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-4">Face Tracking Recorder</h1>
      <p className="mb-2">{isModelsLoaded ? 'Ready to track! 🚀' : 'Loading models, please wait... ⏳'}</p>

      <div className="mb-4 w-full max-w-xs">
        <label htmlFor="cameraSelect" className="block text-sm font-medium text-gray-300 mb-1">Select Camera</label>
        <select
          id="cameraSelect"
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
          disabled={videoDevices.length === 0}
          className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
        >
          {videoDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
            </option>
          ))}
        </select>
      </div>
      
      <div className="relative w-full max-w-2xl mx-auto aspect-video border-4 border-blue-500 rounded-lg overflow-hidden shadow-lg">
        <video
          ref={videoRef}
          onLoadedData={handleVideoPlay}
          autoPlay
          muted
          playsInline
          className="absolute top-0 left-0 w-full h-full object-cover"
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full"
        />
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
        {!isRecording ? (
          <button
            onClick={handleStartRecording}
            disabled={!isModelsLoaded || !selectedDeviceId}
            className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 disabled:bg-gray-500 transition-all"
          >
            Start Recording
          </button>
        ) : (
          <button
            onClick={handleStopRecording}
            className="px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition-all"
          >
            Stop Recording
          </button>
        )}
      </div>

      {videoUrl && (
        <div className="mt-8 w-full max-w-2xl mx-auto">
          <h2 className="text-2xl font-semibold mb-4 text-center">Your Recording</h2>
          <video src={videoUrl} controls className="w-full rounded-lg shadow-lg" />
          <div className="text-center mt-4">
            <a
              href={videoUrl}
              download={`face-recording-${Date.now()}.webm`}
              className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all"
            >
              Download Video
            </a>
          </div>
        </div>
      )}
    </main>
  );
}