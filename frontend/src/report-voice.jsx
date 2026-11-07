import { useEffect, useRef, useState } from 'react';
import { Icon } from './operations-ui';

const RECORDING_LIMIT = 180_000;
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'];

function release(session) {
  clearTimeout(session.timer);
  session.stream?.getTracks().forEach((track) => track.stop());
}

export function ReportVoice({ transcribe, onTranscript, onBusyChange }) {
  const active = useRef(null);
  const mounted = useRef(false);
  const [phase, setPhase] = useState('idle');
  const [clip, setClip] = useState(null);
  const [error, setError] = useState('');
  const supported = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const session = active.current;
      active.current = null;
      if (session) release(session);
    };
  }, []);

  function changePhase(next) {
    setPhase(next);
    onBusyChange(next !== 'idle');
  }

  async function upload(recording) {
    setError('');
    changePhase('transcribing');
    try {
      const result = await transcribe(recording);
      if (mounted.current) {
        onTranscript(result.text);
        setClip(null);
      }
    } catch (error) {
      if (mounted.current) setError(error.message);
    } finally {
      if (mounted.current) changePhase('idle');
    }
  }

  function cancel() {
    const session = active.current;
    active.current = null;
    if (session) release(session);
    changePhase('idle');
  }

  async function start() {
    setClip(null);
    setError('');
    changePhase('permission');
    const session = { chunks: [] };
    active.current = session;
    try {
      session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (active.current !== session) {
        release(session);
        return;
      }
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(session.stream, mimeType ? { mimeType } : undefined);
      session.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (active.current === session && event.data.size) session.chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (active.current !== session) return;
        cancel();
        setError('Recording stopped unexpectedly. Record again or type your update.');
      };
      recorder.onstop = () => {
        if (active.current !== session) return;
        active.current = null;
        release(session);
        const recording = new Blob(session.chunks, { type: recorder.mimeType || session.chunks[0]?.type });
        if (!recording.size) {
          changePhase('idle');
          setError('The recording is empty. Record again or type your update.');
          return;
        }
        setClip(recording);
        void upload(recording);
      };
      recorder.start();
      session.timer = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, RECORDING_LIMIT);
      changePhase('recording');
    } catch {
      if (active.current !== session) return;
      cancel();
      setError('Microphone access is unavailable. Check your browser permissions or type your update.');
    }
  }

  if (!supported) return <small className="report-voice-status">
    Recording is unavailable here. You can type your update.
  </small>;

  return <>
    <div className="shift-actions report-voice-actions">
      {phase === 'idle' && <button type="button" className="secondary" onClick={start}>
        <Icon name="mic" /> Record update
      </button>}
      {phase === 'idle' && clip && <>
        <button type="button" className="secondary" onClick={() => upload(clip)}>Retry transcription</button>
        <button type="button" className="secondary" onClick={() => setClip(null)}>Discard recording</button>
      </>}
      {phase === 'recording' && <button type="button" onClick={() => {
        const recorder = active.current?.recorder;
        if (recorder?.state === 'recording') recorder.stop();
      }}><Icon name="stop" /> Stop recording</button>}
      {(phase === 'permission' || phase === 'recording') && (
        <button type="button" className="secondary" onClick={cancel}>Cancel recording</button>
      )}
    </div>
    {phase === 'permission' && <p className="report-voice-status" role="status">Waiting for microphone access…</p>}
    {phase === 'recording' && <p className="report-voice-status" role="status">Recording… Up to three minutes.</p>}
    {phase === 'transcribing' && <p className="report-voice-status" role="status">Adding your recording to the shift update…</p>}
    {error && <p className="report-voice-status error" role="alert">{error}</p>}
  </>;
}
