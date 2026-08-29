import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Speech-to-text for the patient side.
 *
 * The critical property: transcription happens in the browser and only the
 * resulting TEXT is ever sent to the server. No audio recording is uploaded,
 * stored, or transmitted anywhere. A voice is biometric data — treating it as
 * identity and keeping it off the wire is what keeps the platform's anonymity
 * claim literally true rather than approximately true.
 *
 * Note: some browser implementations of this API do send audio to a vendor
 * speech service for processing. That is disclosed to the user in the UI
 * rather than glossed over — see the note rendered beside the microphone.
 */
export function useSpeechInput({ onResult, lang = 'en-US' } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  const supported =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setError('Voice input is not supported in this browser. Please type instead.');
      return;
    }

    setError(null);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    let finalText = '';

    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk + ' ';
        else live += chunk;
      }
      setInterim(live);
      if (finalText.trim()) {
        onResult?.(finalText.trim());
        finalText = '';
      }
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed') {
        setError('Microphone access was blocked. You can still type your message.');
      } else if (e.error === 'no-speech') {
        setError(null); // harmless — the user simply paused
      } else {
        setError('Voice input stopped. Please try again or type instead.');
      }
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
      setInterim('');
    };

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [supported, lang, onResult]);

  // Always release the microphone when the component goes away.
  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { supported: Boolean(supported), listening, interim, error, start, stop, setError };
}
