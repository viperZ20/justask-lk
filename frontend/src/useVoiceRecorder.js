import { useState, useRef, useCallback, useEffect } from 'react';

// Records a short voice note on the DOCTOR side only.
// Doctors are identified to the platform, so their voice carries no anonymity
// risk. Patients never record — their speech is transcribed in the browser.
export function useVoiceRecorder({ maxSeconds = 60 } = {}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);

  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const resolveRef = useRef(null);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
    setSeconds(0);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const rec = new MediaRecorder(stream);
      mediaRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        const reader = new FileReader();
        reader.onloadend = () => resolveRef.current?.(reader.result);
        reader.readAsDataURL(blob);
        cleanup();
      };

      rec.start();
      setRecording(true);

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= maxSeconds) {
            rec.state === 'recording' && rec.stop();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setError('Microphone access was blocked.');
      cleanup();
    }
  }, [maxSeconds, cleanup]);

  // Returns { audio, durationSec } once encoding finishes.
  const stop = useCallback(() => {
    const captured = seconds;
    return new Promise((resolve) => {
      resolveRef.current = (dataUrl) => resolve({ audio: dataUrl, durationSec: captured });
      if (mediaRef.current?.state === 'recording') mediaRef.current.stop();
      else resolve(null);
    });
  }, [seconds]);

  const cancel = useCallback(() => {
    resolveRef.current = null;
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop();
    cleanup();
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { recording, seconds, error, start, stop, cancel };
}
