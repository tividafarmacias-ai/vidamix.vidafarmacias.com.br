import { createBarcodeDecoder } from './decoder.js';
import { isValidEan } from './code.js';

export function cameraErrorMessage(error) {
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) {
    return 'A câmera não foi autorizada. Permita o acesso nas configurações deste site ou digite o código.';
  }
  if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) {
    return 'Nenhuma câmera foi encontrada. Digite o código para continuar.';
  }
  if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(error?.name)) {
    return 'Não foi possível abrir a câmera. Feche outros apps que estejam usando a câmera e tente novamente.';
  }
  return 'Não foi possível iniciar a leitura. Tente novamente ou digite o código.';
}

/** Owns one camera session, including permission requests that resolve after closing. */
export function createCameraScanner({
  video, onCode, onState = () => {}, onError = () => {},
  mediaDevices = globalThis.navigator?.mediaDevices,
  secureContext = globalThis.isSecureContext,
  loadDecoder = createBarcodeDecoder,
  createCanvas = () => document.createElement('canvas'),
  schedule = setTimeout, cancel = clearTimeout, now = Date.now,
}) {
  let generation = 0;
  let state = 'idle';
  let stream = null;
  let timer;
  let candidate = '';
  let candidateTime = 0;
  const setState = (value) => { state = value; onState(value); };
  const release = (media) => media?.getTracks().forEach((track) => track.stop());

  function stop() {
    generation += 1;
    cancel(timer);
    timer = undefined;
    candidate = '';
    release(stream);
    stream = null;
    video.pause();
    video.srcObject = null;
    setState('idle');
  }

  async function start() {
    if (state !== 'idle') return;
    if (!secureContext) {
      onError('A câmera precisa de uma conexão HTTPS. Abra o endereço seguro do aplicativo ou digite o código.');
      return;
    }
    if (!mediaDevices?.getUserMedia) {
      onError('Este navegador não disponibiliza a câmera. Abra no Safari ou Chrome atualizado, ou digite o código.');
      return;
    }
    const session = ++generation;
    const current = () => session === generation;
    setState('starting');
    try {
      const decode = await loadDecoder();
      if (!current()) return;
      const acquired = await mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (!current()) { release(acquired); return; }
      stream = acquired;
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (!current()) return;
          stop();
          onError('A câmera foi interrompida. Toque em Usar câmera para tentar novamente.');
        }, { once: true });
      }
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      if (!current()) return;
      const canvas = createCanvas();
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas unavailable');
      setState('scanning');
      const scan = async () => {
        if (!current()) return;
        try {
          if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
            const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
            const width = Math.round(video.videoWidth * scale);
            const height = Math.round(video.videoHeight * scale);
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            context.drawImage(video, 0, 0, width, height);
            const code = await decode(canvas);
            if (!current()) return;
            if (code && isValidEan(code)) {
              if (candidate === code && now() - candidateTime < 1500) {
                stop();
                onCode(code);
                return;
              }
              candidate = code;
              candidateTime = now();
            }
          }
          timer = schedule(scan, 180);
        } catch (error) {
          if (!current()) return;
          stop();
          onError(cameraErrorMessage(error));
        }
      };
      timer = schedule(scan, 0);
    } catch (error) {
      if (!current()) return;
      stop();
      onError(cameraErrorMessage(error));
    }
  }

  return { start, stop, get state() { return state; } };
}
