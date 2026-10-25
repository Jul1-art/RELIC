import Hls from './assets/vendor/hls.full.mjs';

/** One continuous media clock, with local HLS segments and an MP4 fallback.
 * Instantiated only when the viewer actually starts the film. */
export function attachFilmSource(video, media = {}) {
  let player = null;
  let destroyed = false;
  let fallbackActive = false;
  let mediaRecovery = false;
  const controller = {
    mode: 'mp4',
    recover,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      player?.destroy();
      player = null;
    },
  };
  function recover() {
    if (destroyed || fallbackActive || !media.src || controller.mode === 'mp4') return false;
    const position = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const resume = !video.paused;
    fallbackActive = true;
    controller.mode = 'mp4';
    player?.destroy(); player = null;
    video.src = media.src;
    video.addEventListener('loadedmetadata', () => {
      if (destroyed) return;
      if (position > 0 && position < video.duration) video.currentTime = position;
      if (resume) video.play().catch(() => {});
    }, { once: true });
    video.load();
    return true;
  }
  if (media.hls && Hls.isSupported()) {
    controller.mode = 'hls';
    player = new Hls({
      enableWorker: false,
      maxBufferLength: 32,
      maxMaxBufferLength: 48,
      backBufferLength: 12,
      maxBufferSize: 16 * 1024 * 1024,
      manifestLoadingMaxRetry: 1,
      levelLoadingMaxRetry: 1,
      fragLoadingMaxRetry: 2,
    });
    player.on(Hls.Events.ERROR, (_event, data) => {
      if (destroyed || !data.fatal) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovery) {
        mediaRecovery = true;
        player?.recoverMediaError();
      } else if (!recover()) {
        video.dispatchEvent(new Event('error'));
      }
    });
    player.attachMedia(video);
    player.loadSource(media.hls);
  } else if (media.hls && video.canPlayType('application/vnd.apple.mpegurl')) {
    controller.mode = 'native-hls';
    video.src = media.hls;
    video.load();
  } else {
    fallbackActive = true;
    video.src = media.src || '';
    video.load();
  }
  return controller;
}
