window.__ModuleLoader__.load({
  id: '@local/dsh-ps5-recorder',
  factory(require) {
    const React = require('react');
    const { createElement: h, useCallback, useEffect, useRef, useState } = React;

    const NS = 'ps5-recorder';
    const PANEL_KEY = 'ps5-recorder';
    const API = '/ps5-recorder-api';

    /* ------------------------------------------------------------------ */
    /* locale                                                             */
    /* ------------------------------------------------------------------ */

    const MESSAGES = {
      zh: {
        'panel.label': 'PS5 录制',
        'page.title': 'PS5 录制',
        'page.subtitle': '一键录制 → 自动整理成片 → 自动上传 YouTube',
        'status.obsOff': 'OBS 未连接',
        'status.obsOn': 'OBS 已连接',
        'status.recording': '录制中',
        'status.paused': '已暂停',
        'status.uploading': '正在上传',
        'status.ready': '待命',
        'section.record': '录制',
        'section.queue': '上传队列',
        'section.settings': '设置',
        'field.game': '游戏英文名',
        'field.gamePlaceholder': '例如 GTA VI',
        'field.episode': '集数',
        'field.episodeHint': '留空则自动使用下一集',
        'preview.title': '成片标题',
        'preview.empty': '填写游戏名后自动生成',
        'capture.label': '采集卡',
        'capture.active': '有信号',
        'capture.inactive': '无信号',
        'capture.none': '未检测到采集卡',
        'audio.label': '游戏音频',
        'audio.unmuted': '已启用（录制时自动打开）',
        'audio.muted': '已静音（录制时会自动打开）',
        'audio.none': '未检测到音频输入',
        'audio.disconnected': '采集卡未提供音频（本段录制可能没有声音）',
        'folder.label': '录制文件夹',
        'action.start': '开始录制',
        'action.forceStart': '强制开始',
        'action.pause': '暂停',
        'action.resume': '继续',
        'action.stop': '停止',
        'action.prepare': '准备 OBS',
        'action.refresh': '刷新',
        'action.openFolder': '打开文件夹',
        'action.save': '保存',
        'action.saved': '已保存',
        'action.connectYouTube': '连接 YouTube',
        'action.disconnect': '断开',
        'action.retry': '重试',
        'action.uploadNow': '立即上传',
        'action.remove': '移除',
        'action.cancelUpload': '取消上传',
        'action.reveal': '在 Finder 中显示',
        'action.loadPlaylists': '加载播放列表',
        'queue.empty': '还没有录好的视频。停止录制后，成片会出现在这里。',
        'queue.finalizing': '正在整理文件',
        'queue.queued': '等待上传',
        'queue.uploading': '上传中',
        'queue.done': '已上传',
        'queue.error': '失败',
        'queue.canceled': '已取消',
        'queue.openOnYouTube': '在 YouTube 打开',
        'setting.upload': '上传',
        'setting.obs': '画面',
        'setting.advanced': '高级',
        'setting.folder': '录制文件夹',
        'setting.separator': '标题分隔符',
        'setting.padding': '集数位数',
        'setting.privacy': '可见性',
        'privacy.private': '私享（仅自己）',
        'privacy.unlisted': '不公开（有链接可见）',
        'privacy.public': '公开',
        'setting.tags': '标签（逗号分隔）',
        'setting.playlist': '播放列表 ID（可选）',
        'setting.description': '简介模板（支持 {game} {episode} {duration}）',
        'setting.autoUpload': '停止录制后自动上传',
        'setting.uploadDelay': '上传前等待（秒）',
        'setting.thumbnail': '自动生成封面',
        'setting.keepOriginal': '保留原始 MKV',
        'setting.fps': '录制帧率',
        'setting.format': '录制容器',
        'setting.encoder': '视频编码器',
        'setting.unmute': '开始录制时自动打开游戏音频',
        'setting.monitorAudio': '录制时同时监听游戏声音（从 Mac 扬声器/耳机输出）',
        'setting.keepAwake': '录制时阻止电脑熄屏 / 睡眠',
        'setting.clientId': 'Google OAuth 客户端 ID',
        'setting.clientSecret': 'Google OAuth 客户端 Secret',
        'setting.clientSecretSet': '已保存，如需更换请重新填写',
        'setting.channel': '已连接频道',
        'setting.notConnected': '未连接',
        'setup.title': '首次使用：一次性配置 YouTube',
        'setup.body': '需要自己创建一个免费的 Google Cloud OAuth 客户端（约 10 分钟），插件会用它把视频上传到你自己的频道。详细步骤见插件详情页。',
        'hint.noFfmpeg': '没有找到 ffmpeg，整理成片和生成封面会失败：在终端运行 brew install ffmpeg。',
        'hint.noClient': '还没有填写 Google OAuth 客户端，填好并连接后才会自动上传。',
        'hint.notConnected': 'YouTube 未连接，成片会先留在队列里，连接后自动继续上传。',
        'error.api': '接口未就绪，重启 DeepSeek Harness 后重试。',
        'error.network': '无法连接本地服务。',
        'error.capture': '采集卡没有信号：检查 PS5 是否开机、HDMI 是否接到采集卡输入。',
        'recording.hint': '录制中可直接关闭这个面板，OBS 会继续录；停止后自动上传。',
        'paused.hint': '录制已暂停：这段画面不会进入成片，继续后接着录。',
        'force.title': '仍然开始录制？',
        'force.body': '采集卡当前没有信号，录下来可能是黑屏。',
        'session.episode': '集数',
        'session.folder': '文件会保存在',
        'upload.progress': '上传进度',
        'unit.mb': 'MB',
        'unit.min': '分钟',
      },
      en: {
        'panel.label': 'PS5 Recorder',
        'page.title': 'PS5 Recorder',
        'page.subtitle': 'One-click record → auto finalize → auto upload to YouTube',
        'status.obsOff': 'OBS offline',
        'status.obsOn': 'OBS connected',
        'status.recording': 'Recording',
        'status.paused': 'Paused',
        'status.uploading': 'Uploading',
        'status.ready': 'Standby',
        'section.record': 'Record',
        'section.queue': 'Upload queue',
        'section.settings': 'Settings',
        'field.game': 'Game name (English)',
        'field.gamePlaceholder': 'e.g. GTA VI',
        'field.episode': 'Episode',
        'field.episodeHint': 'Leave empty to use the next episode',
        'preview.title': 'Video title',
        'preview.empty': 'Filled in once you type a game name',
        'capture.label': 'Capture card',
        'capture.active': 'Signal',
        'capture.inactive': 'No signal',
        'capture.none': 'Not detected',
        'audio.label': 'Game audio',
        'audio.unmuted': 'Enabled (turned on when recording)',
        'audio.muted': 'Muted (turned on when recording)',
        'audio.none': 'No audio input',
        'audio.disconnected': 'Capture card provides no audio (this recording may be silent)',
        'folder.label': 'Recording folder',
        'action.start': 'Start recording',
        'action.forceStart': 'Start anyway',
        'action.pause': 'Pause',
        'action.resume': 'Resume',
        'action.stop': 'Stop',
        'action.prepare': 'Prepare OBS',
        'action.refresh': 'Refresh',
        'action.openFolder': 'Open folder',
        'action.save': 'Save',
        'action.saved': 'Saved',
        'action.connectYouTube': 'Connect YouTube',
        'action.disconnect': 'Disconnect',
        'action.retry': 'Retry',
        'action.uploadNow': 'Upload now',
        'action.remove': 'Remove',
        'action.cancelUpload': 'Cancel upload',
        'action.reveal': 'Show in Finder',
        'action.loadPlaylists': 'Load playlists',
        'queue.empty': 'No finished recordings yet. Stop a recording and it appears here.',
        'queue.finalizing': 'Finalizing',
        'queue.queued': 'Queued',
        'queue.uploading': 'Uploading',
        'queue.done': 'Uploaded',
        'queue.error': 'Failed',
        'queue.canceled': 'Canceled',
        'queue.openOnYouTube': 'Open on YouTube',
        'setting.upload': 'Upload',
        'setting.obs': 'Video',
        'setting.advanced': 'Advanced',
        'setting.folder': 'Recording folder',
        'setting.separator': 'Title separator',
        'setting.padding': 'Episode digits',
        'setting.privacy': 'Visibility',
        'privacy.private': 'Private',
        'privacy.unlisted': 'Unlisted',
        'privacy.public': 'Public',
        'setting.tags': 'Tags (comma separated)',
        'setting.playlist': 'Playlist ID (optional)',
        'setting.description': 'Description template ({game} {episode} {duration})',
        'setting.autoUpload': 'Upload automatically after recording',
        'setting.uploadDelay': 'Wait before upload (s)',
        'setting.thumbnail': 'Generate thumbnail',
        'setting.keepOriginal': 'Keep original MKV',
        'setting.fps': 'Frame rate',
        'setting.format': 'Container',
        'setting.encoder': 'Video encoder',
        'setting.unmute': 'Unmute game audio when recording starts',
        'setting.monitorAudio': 'Monitor game audio through the Mac while recording',
        'setting.keepAwake': 'Keep the Mac awake while recording',
        'setting.clientId': 'Google OAuth client ID',
        'setting.clientSecret': 'Google OAuth client secret',
        'setting.clientSecretSet': 'Saved — fill again to replace',
        'setting.channel': 'Connected channel',
        'setting.notConnected': 'Not connected',
        'setup.title': 'First run: one-time YouTube setup',
        'setup.body': 'Create a free Google Cloud OAuth client (about 10 minutes). The plugin uses it to upload to your own channel. Steps are in the plugin details.',
        'hint.noFfmpeg': 'ffmpeg not found: finalizing and thumbnails will fail. Run brew install ffmpeg.',
        'hint.noClient': 'No Google OAuth client yet; add one to enable automatic uploads.',
        'hint.notConnected': 'YouTube is not connected. Finished videos stay queued and upload after you connect.',
        'error.api': 'Endpoint not ready — restart DeepSeek Harness.',
        'error.network': 'Cannot reach the local service.',
        'error.capture': 'Capture card has no signal: check the PS5 is on and HDMI goes into the card input.',
        'recording.hint': 'You can close this panel while recording; OBS keeps recording and uploads when stopped.',
        'paused.hint': 'Recording is paused: paused video is skipped in the final file.',
        'force.title': 'Record anyway?',
        'force.body': 'The capture card has no signal right now, so the recording may be black.',
        'session.episode': 'Episode',
        'session.folder': 'Saved to',
        'upload.progress': 'Upload progress',
        'unit.mb': 'MB',
        'unit.min': 'min',
      },
    };

    /* ------------------------------------------------------------------ */
    /* helpers                                                            */
    /* ------------------------------------------------------------------ */

    async function request(path, body) {
      let response;
      try {
        response = await fetch(`${API}${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          credentials: 'same-origin',
          cache: 'no-store',
        });
      } catch {
        throw new Error('network');
      }
      let data = null;
      try { data = await response.json(); } catch { /* ignore */ }
      if (!response.ok || data === null || data.ok === false) {
        const message = data && typeof data.error === 'string' ? data.error : `HTTP ${response.status}`;
        throw new Error(response.status === 404 ? 'not-found' : message);
      }
      return data;
    }

    function fmtDuration(seconds) {
      const total = Math.max(0, Math.round(Number(seconds) || 0));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      return `${m}:${String(s).padStart(2, '0')}`;
    }

    function fmtTimecode(timecode, durationMs) {
      const fromTimecode = /^\d{2}:\d{2}:\d{2}/.test(timecode || '') ? timecode.slice(0, 8) : '';
      if (fromTimecode && fromTimecode !== '00:00:00') return fromTimecode;
      return fmtDuration((Number(durationMs) || 0) / 1000);
    }

    function fmtSize(bytes) {
      const size = Number(bytes) || 0;
      if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
      if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(0)} MB`;
      return `${Math.max(1, Math.round(size / 1024))} KB`;
    }

    function buildTitlePreview(game, episode, separator, padding) {
      const cleanGame = String(game || '').trim();
      if (!cleanGame) return '';
      if (!episode) return `${cleanGame}${separator}EP ${'?'.repeat(Math.max(1, padding || 2))}`;
      return `${cleanGame}${separator}EP ${String(Math.max(1, Math.floor(Number(episode) || 1))).padStart(Math.max(1, padding || 2), '0')}`;
    }

    /* ------------------------------------------------------------------ */
    /* pieces                                                             */
    /* ------------------------------------------------------------------ */

    function Chip({ tone = 'idle', children, pulse = false }) {
      return h('span', { className: 'pr-chip', 'data-tone': tone, 'data-pulse': pulse ? 'true' : 'false' },
        h('span', { className: 'pr-chip-dot' }), children);
    }

    function Field({ label, hint, children, wide = false }) {
      return h('label', { className: 'pr-field', 'data-wide': wide ? 'true' : 'false' },
        h('span', { className: 'pr-field-label' }, label),
        children,
        hint ? h('span', { className: 'pr-field-hint' }, hint) : null);
    }

    function Toggle({ label, checked, onChange }) {
      return h('label', { className: 'pr-toggle' },
        h('input', { type: 'checkbox', checked: Boolean(checked), onChange: event => onChange(event.target.checked) }),
        h('span', { className: 'pr-toggle-track' }, h('span', { className: 'pr-toggle-thumb' })),
        h('span', { className: 'pr-toggle-label' }, label));
    }

    function Progress({ percent }) {
      return h('div', { className: 'pr-progress' },
        h('span', { className: 'pr-progress-fill', style: { width: `${Math.max(0, Math.min(100, Number(percent) || 0))}%` } }));
    }

    function Icon({ name, size = 15 }) {
      const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
      if (name === 'play') return h('svg', common, h('path', { d: 'M7 4.5v15l13-7.5z', fill: 'currentColor', stroke: 'none' }));
      if (name === 'pause') return h('svg', common, h('rect', { x: 6, y: 4.5, width: 4, height: 15, fill: 'currentColor', stroke: 'none' }), h('rect', { x: 14, y: 4.5, width: 4, height: 15, fill: 'currentColor', stroke: 'none' }));
      if (name === 'stop') return h('svg', common, h('rect', { x: 6, y: 6, width: 12, height: 12, rx: 2, fill: 'currentColor', stroke: 'none' }));
      if (name === 'upload') return h('svg', common, h('path', { d: 'M12 16V4m0 0L7 9m5-5 5 5' }), h('path', { d: 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3' }));
      if (name === 'refresh') return h('svg', common, h('path', { d: 'M20 11a8 8 0 1 0-2.3 6.7' }), h('path', { d: 'M20 5v6h-6' }));
      if (name === 'folder') return h('svg', common, h('path', { d: 'M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z' }));
      if (name === 'youtube') return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor' }, h('path', { d: 'M21.6 7.2a2.8 2.8 0 0 0-2-2C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8M10 15.2V8.8l5.5 3.2z' }));
      return h('svg', common, h('circle', { cx: 12, cy: 12, r: 9 }));
    }

    function Button({ variant = 'default', icon, children, onClick, disabled = false, title }) {
      return h('button', {
        type: 'button', className: 'pr-btn', 'data-variant': variant, onClick, disabled, title,
      }, icon ? h(Icon, { name: icon, size: 14 }) : null, children ? h('span', null, children) : null);
    }

    function QueueItem({ item, t, busy, onRetry, onUploadNow, onRemove, onReveal, onCancel }) {
      const statusKey = `queue.${item.status}`;
      const tone = item.status === 'done' ? 'ok' : item.status === 'error' ? 'error' : item.status === 'uploading' ? 'live' : 'idle';
      return h('div', { className: 'pr-queue-item' },
        h('div', { className: 'pr-queue-main' },
          h('div', { className: 'pr-queue-head' },
            h('strong', { className: 'pr-queue-title', title: item.title }, item.title),
            h(Chip, { tone, pulse: item.status === 'uploading' }, t(statusKey))),
          h('div', { className: 'pr-queue-meta' },
            item.durationSec > 0 ? h('span', null, fmtDuration(item.durationSec)) : null,
            item.size > 0 ? h('span', null, fmtSize(item.size)) : null,
            item.status === 'uploading' ? h('span', null, `${item.percent || 0}%`) : null,
            item.warning ? h('span', { className: 'pr-queue-warning' }, item.warning) : null,
            item.error ? h('span', { className: 'pr-queue-error' }, item.error) : null),
          item.status === 'uploading' ? h(Progress, { percent: item.percent }) : null),
        h('div', { className: 'pr-queue-actions' },
          item.status === 'done' && item.url ? h('a', { className: 'pr-link', href: item.url, target: '_blank', rel: 'noreferrer' }, t('queue.openOnYouTube')) : null,
          item.status === 'error' ? h(Button, { variant: 'primary', icon: 'upload', onClick: () => onRetry(item), disabled: busy }, t('action.retry')) : null,
          item.status === 'queued' || item.status === 'canceled' ? h(Button, { icon: 'upload', onClick: () => onUploadNow(item), disabled: busy }, t('action.uploadNow')) : null,
          item.status === 'uploading' ? h(Button, { onClick: onCancel, disabled: busy }, t('action.cancelUpload')) : null,
          item.filePath ? h(Button, { onClick: () => onReveal(item), disabled: busy }, t('action.reveal')) : null,
          item.status !== 'uploading' ? h(Button, { variant: 'ghost', onClick: () => onRemove(item), disabled: busy }, t('action.remove')) : null));
    }

    /* ------------------------------------------------------------------ */
    /* page                                                               */
    /* ------------------------------------------------------------------ */

    function Page({ t }) {
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState('');
      const [game, setGame] = useState('');
      const [episode, setEpisode] = useState('');
      const [force, setForce] = useState(false);
      const [tab, setTab] = useState('upload');
      const [draft, setDraft] = useState(null);
      const [secret, setSecret] = useState('');
      const [playlists, setPlaylists] = useState(null);
      const [devices, setDevices] = useState(null);
      const [audioDevices, setAudioDevices] = useState(null);
      const [dirty, setDirty] = useState(false);
      const mounted = useRef(true);
      const timer = useRef(null);
      const noticeTimer = useRef(null);

      useEffect(() => () => {
        mounted.current = false;
        if (timer.current !== null) clearTimeout(timer.current);
        if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
      }, []);

      const showNotice = useCallback((text) => {
        setNotice(text);
        if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => { if (mounted.current) setNotice(''); }, 4000);
      }, []);

      const load = useCallback(async () => {
        try {
          const payload = await request('/state');
          if (!mounted.current) return;
          setData(payload);
          setError(previous => (previous === 'not-found' || previous === 'network' ? '' : previous));
        } catch (failure) {
          if (!mounted.current) return;
          setError(failure.message);
        }
      }, []);

      useEffect(() => {
        if (!data) return;
        if (draft === null && data.settings) setDraft(data.settings);
        if (!game && data.settings?.lastGame) setGame(data.settings.lastGame);
      }, [data, draft, game]);

      useEffect(() => {
        let cancelled = false;
        const tick = async () => {
          if (cancelled) return;
          if (document.visibilityState !== 'hidden') await load();
          if (!cancelled) timer.current = setTimeout(tick, data?.obs?.recording ? 1000 : 2500);
        };
        void tick();
        return () => {
          cancelled = true;
          if (timer.current !== null) clearTimeout(timer.current);
        };
      }, [load, data?.obs?.recording]);

      const act = useCallback(async (path, body, options = {}) => {
        setBusy(true);
        setError('');
        try {
          const result = await request(path, body);
          await load();
          if (options.notice) showNotice(options.notice);
          return result;
        } catch (failure) {
          if (options.captureForce !== false && /没有信号|没有检测到可用的游戏音频/.test(failure.message)) setForce(true);
          setError(failure.message === 'not-found' ? t('error.api') : failure.message === 'network' ? t('error.network') : failure.message);
          return null;
        } finally {
          setBusy(false);
        }
      }, [load, showNotice, t]);

      const settings = data?.settings ?? {};
      const obs = data?.obs ?? {};
      const session = data?.session ?? null;
      const queue = data?.queue ?? [];
      const recording = Boolean(obs.recording);
      const paused = Boolean(obs.paused);
      const currentGame = game.trim();
      const lastEpisode = data?.games?.[currentGame]?.episode ?? 0;
      const nextEpisode = lastEpisode + 1;
      const effectiveEpisode = episode.trim() === '' ? nextEpisode : Number(episode);
      const titlePreview = buildTitlePreview(currentGame, episode.trim() === '' ? nextEpisode : effectiveEpisode, settings.separator ?? ' | ', settings.episodePadding ?? 2);
      const uploadingCount = queue.filter(item => item.status === 'uploading').length;
      const activeCapture = obs.capture;
      const captureOk = activeCapture ? activeCapture.active : false;

      const start = async (forceStart) => {
        const result = await act('/start', {
          game: currentGame,
          episode: episode.trim() === '' ? undefined : Number(episode),
          force: Boolean(forceStart),
        });
        if (result) {
          setForce(false);
          setEpisode('');
        }
      };

      const stop = async () => {
        await act('/stop', {}, { notice: t('queue.finalizing') });
      };

      const prepare = async () => {
        const result = await act('/prepare', {}, { notice: t('action.saved') });
        if (result) showNotice(t('capture.label'));
      };

      const saveSettings = async () => {
        if (!draft) return;
        const payload = { ...draft };
        if (secret.trim()) payload.googleClientSecret = secret.trim();
        else delete payload.googleClientSecret;
        const result = await act('/settings', payload);
        if (result) {
          setSecret('');
          setDirty(false);
          showNotice(t('action.saved'));
        }
      };

      const connectYouTube = async () => {
        const win = window.open('about:blank', '_blank');
        const result = await act('/youtube/connect', {}, { captureForce: false });
        if (result?.url) {
          if (win) win.location.href = result.url;
          else window.location.href = result.url;
        } else if (win) {
          win.close();
        }
      };

      const loadPlaylists = async () => {
        const result = await act('/youtube/playlists', {}, { captureForce: false });
        if (result) setPlaylists(result.playlists ?? []);
      };

      const loadDevices = async () => {
        const result = await act('/devices', {}, { captureForce: false });
        if (result) setDevices(result.devices ?? []);
      };

      const chooseDevice = async (value) => {
        const label = devices?.find(item => item.value === value)?.label;
        const result = await act('/device', { value, label }, { captureForce: false });
        if (result) {
          showNotice(t('capture.label'));
          await loadDevices();
        }
      };

      const loadAudioDevices = async () => {
        const result = await act('/audio-devices', {}, { captureForce: false });
        if (result) setAudioDevices(result);
      };

      const chooseAudioDevice = async (deviceId) => {
        const result = await act('/audio-device', { deviceId }, { captureForce: false });
        if (result) {
          showNotice(t('audio.label'));
          await loadAudioDevices();
        }
      };

      const updateDraft = (key, value) => {
        setDraft(previous => ({ ...(previous ?? {}), [key]: value }));
        setDirty(true);
      };

      const statusChips = [
        recording
          ? h(Chip, { key: 'rec', tone: 'live', pulse: true }, paused ? t('status.paused') : t('status.recording'))
          : h(Chip, { key: 'obs', tone: obs.connected ? 'ok' : 'idle' }, obs.connected ? t('status.obsOn') : t('status.obsOff')),
        uploadingCount > 0 ? h(Chip, { key: 'up', tone: 'live', pulse: true }, t('status.uploading')) : null,
        data?.youtube?.connected ? h(Chip, { key: 'yt', tone: 'ok' }, `YouTube · ${data.youtube.channel || t('status.ready')}`) : null,
      ].filter(Boolean);

      return h('div', { className: 'pr-page' },
        h('style', null, CSS),

        error ? h('div', { className: 'pr-banner', role: 'alert' }, error) : null,
        notice ? h('div', { className: 'pr-banner', 'data-tone': 'ok' }, notice) : null,

        h('header', { className: 'pr-header', 'data-window-drag': '' },
          h('div', { className: 'pr-heading' },
            h('h1', { className: 'pr-title' }, t('page.title')),
            h('p', { className: 'pr-subtitle' }, t('page.subtitle'))),
          h('div', { className: 'pr-toolbar' },
            h('div', { className: 'pr-chips' }, statusChips),
            h(Button, { icon: 'refresh', onClick: () => void load(), disabled: busy }, t('action.refresh')))),

        !data && !error ? h('div', { className: 'pr-loading' }, '…') : null,

        h('section', { className: 'pr-card' },
          h('div', { className: 'pr-card-head' },
            h('h2', { className: 'pr-card-title' }, t('section.record')),
            h('div', { className: 'pr-card-side' },
              h(Button, { icon: 'folder', onClick: () => void act('/open-folder', {}, { captureForce: false }) }, t('action.openFolder')))),
          h('div', { className: 'pr-grid' },
            h(Field, { label: t('field.game') },
              h('input', {
                className: 'pr-input', value: game, placeholder: t('field.gamePlaceholder'),
                disabled: recording, onChange: event => setGame(event.target.value), spellCheck: false,
              })),
            h(Field, { label: t('field.episode'), hint: t('field.episodeHint') },
              h('input', {
                className: 'pr-input', type: 'number', min: 1, value: episode,
                placeholder: String(nextEpisode), disabled: recording,
                onChange: event => setEpisode(event.target.value),
              })),
            h('div', { className: 'pr-preview' },
              h('span', { className: 'pr-preview-label' }, t('preview.title')),
              h('strong', { className: 'pr-preview-title', 'data-empty': titlePreview === '' ? 'true' : 'false' },
                titlePreview === '' ? t('preview.empty') : titlePreview))),

          h('div', { className: 'pr-status-row' },
            h('span', { className: 'pr-status-item' },
              h('span', { className: 'pr-status-key' }, t('capture.label')),
              h('span', { className: 'pr-status-value', 'data-tone': captureOk ? 'ok' : 'warn' },
                activeCapture
                  ? `${activeCapture.device || activeCapture.name} · ${captureOk ? t('capture.active') : t('capture.inactive')}`
                  : t('capture.none'))),
            h('span', { className: 'pr-status-item' },
              h('span', { className: 'pr-status-key' }, t('audio.label')),
              h('span', { className: 'pr-status-value', 'data-tone': obs.audio?.connected ? 'ok' : 'warn' },
                obs.audio
                  ? (obs.audio.connected ? (obs.audio.muted ? t('audio.muted') : t('audio.unmuted')) : t('audio.disconnected'))
                  : t('audio.none'))),
            h('span', { className: 'pr-status-item' },
              h('span', { className: 'pr-status-key' }, t('folder.label')),
              h('span', { className: 'pr-status-value', title: settings.recordingFolder }, settings.recordingFolder ?? ''))),

          recording
            ? h('div', { className: 'pr-session' },
              h('div', { className: 'pr-session-time' }, fmtTimecode(obs.timecode, obs.durationMs)),
              h('div', { className: 'pr-session-body' },
                h('div', { className: 'pr-session-title' }, session?.title ?? titlePreview),
                h('div', { className: 'pr-session-hint' }, paused ? t('paused.hint') : t('recording.hint'))),
              h('div', { className: 'pr-session-actions' },
                h(Button, { icon: paused ? 'play' : 'pause', onClick: () => void act('/pause', { paused: !paused }), disabled: busy }, paused ? t('action.resume') : t('action.pause')),
                h(Button, { variant: 'danger', icon: 'stop', onClick: () => void stop(), disabled: busy }, t('action.stop'))))
            : h('div', { className: 'pr-actions' },
              h(Button, { variant: 'primary', icon: 'play', onClick: () => void start(false), disabled: busy || !currentGame }, t('action.start')),
              force
                ? h(Button, { variant: 'danger', onClick: () => void start(true), disabled: busy || !currentGame }, t('action.forceStart'))
                : null,
              h(Button, { icon: 'refresh', onClick: () => void prepare(), disabled: busy }, t('action.prepare'))),

          force
            ? h('div', { className: 'pr-warn' },
              h('strong', null, t('force.title')),
              h('span', null, t('force.body')))
            : null),

        h('section', { className: 'pr-card' },
          h('div', { className: 'pr-card-head' },
            h('h2', { className: 'pr-card-title' }, t('section.queue')),
            h('div', { className: 'pr-card-side' },
              h('span', { className: 'pr-hint' }, `${queue.filter(item => item.status === 'done').length} / ${queue.length}`))),
          queue.length === 0
            ? h('p', { className: 'pr-empty' }, t('queue.empty'))
            : h('div', { className: 'pr-queue' },
              queue.map(item => h(QueueItem, {
                key: item.id, item, t, busy,
                onRetry: (target) => void act('/queue/retry', { id: target.id }),
                onUploadNow: (target) => void act('/queue/upload', { id: target.id }),
                onRemove: (target) => void act('/queue/remove', { id: target.id }),
                onCancel: () => void act('/queue/cancel', {}),
                onReveal: (target) => void act('/reveal', { path: target.filePath }, { captureForce: false }),
              })))),

        h('section', { className: 'pr-card' },
          h('div', { className: 'pr-card-head' },
            h('h2', { className: 'pr-card-title' }, t('section.settings')),
            h('div', { className: 'pr-card-side' },
              h('div', { className: 'pr-tabs' },
                ['upload', 'obs', 'advanced'].map(key => h('button', {
                  key, type: 'button', className: 'pr-tab', 'data-active': tab === key,
                  onClick: () => setTab(key),
                }, t(`setting.${key}`)))),
              h(Button, { variant: 'primary', onClick: () => void saveSettings(), disabled: busy || !dirty }, t('action.save')))),

          !data?.ffmpeg?.available
            ? h('div', { className: 'pr-warn' }, h('span', null, t('hint.noFfmpeg')))
            : null,

          tab === 'upload'
            ? h('div', { className: 'pr-tab-body' },
              h('div', { className: 'pr-youtube' },
                h('div', { className: 'pr-youtube-head' },
                  h('div', { className: 'pr-youtube-id' },
                    h(Icon, { name: 'youtube', size: 18 }),
                    h('span', null, data?.youtube?.connected ? `${t('setting.channel')}：${data.youtube.channel || t('status.ready')}` : t('setting.notConnected'))),
                  h('div', { className: 'pr-youtube-actions' },
                    data?.youtube?.pending
                      ? h(Button, { onClick: () => void act('/youtube/cancel', {}, { captureForce: false }) }, t('queue.uploading'))
                      : data?.youtube?.connected
                        ? h(Button, { onClick: () => void act('/youtube/disconnect', {}, { captureForce: false }) }, t('action.disconnect'))
                        : h(Button, { variant: 'primary', icon: 'youtube', onClick: () => void connectYouTube(), disabled: busy || !settings.googleClientId }, t('action.connectYouTube')))),
                data?.youtube?.error ? h('div', { className: 'pr-warn' }, h('span', null, data.youtube.error)) : null,
                h('div', { className: 'pr-grid' },
                  h(Field, { label: t('setting.clientId'), wide: true },
                    h('input', {
                      className: 'pr-input', value: draft?.googleClientId ?? '', spellCheck: false,
                      placeholder: '1234567890-abc.apps.googleusercontent.com',
                      onChange: event => updateDraft('googleClientId', event.target.value),
                    })),
                  h(Field, { label: t('setting.clientSecret'), wide: true },
                    h('input', {
                      className: 'pr-input', type: 'password', value: secret,
                      placeholder: settings.googleClientSecretSet ? t('setting.clientSecretSet') : 'GOCSPX-…',
                      onChange: event => setSecret(event.target.value),
                    })))),
              h('div', { className: 'pr-grid' },
                h(Field, { label: t('setting.privacy') },
                  h('select', {
                    className: 'pr-input', value: draft?.privacyStatus ?? 'private',
                    onChange: event => updateDraft('privacyStatus', event.target.value),
                  }, ['private', 'unlisted', 'public'].map(value => h('option', { key: value, value }, t(`privacy.${value}`))))),
                h(Field, { label: t('setting.tags') },
                  h('input', {
                    className: 'pr-input', value: (draft?.tags ?? []).join(', '), spellCheck: false,
                    onChange: event => updateDraft('tags', event.target.value.split(',').map(item => item.trim()).filter(Boolean)),
                  })),
                h(Field, { label: t('setting.playlist') },
                  h('input', {
                    className: 'pr-input', value: draft?.playlistId ?? '', spellCheck: false,
                    placeholder: 'PL…',
                    onChange: event => updateDraft('playlistId', event.target.value),
                  })),
                h(Field, { label: t('setting.description'), wide: true },
                  h('textarea', {
                    className: 'pr-input pr-textarea', rows: 3, value: draft?.descriptionTemplate ?? '',
                    placeholder: '本期 {game} EP {episode}，时长 {duration}。',
                    onChange: event => updateDraft('descriptionTemplate', event.target.value),
                  }))),
              data?.youtube?.connected && playlists === null
                ? h('div', { className: 'pr-row' },
                  h(Button, { onClick: () => void loadPlaylists(), disabled: busy }, t('action.loadPlaylists')))
                : null,
              playlists && playlists.length > 0
                ? h('div', { className: 'pr-playlists' }, playlists.map(playlist => h('button', {
                  key: playlist.id, type: 'button', className: 'pr-playlist',
                  onClick: () => updateDraft('playlistId', playlist.id),
                }, playlist.title)))
                : null)
            : null,

          tab === 'obs'
            ? h('div', { className: 'pr-tab-body' },
              h('div', { className: 'pr-grid' },
                h(Field, { label: t('setting.folder'), wide: true },
                  h('input', {
                    className: 'pr-input', value: draft?.recordingFolder ?? '', spellCheck: false,
                    onChange: event => updateDraft('recordingFolder', event.target.value),
                  })),
                h(Field, { label: t('setting.fps') },
                  h('select', {
                    className: 'pr-input', value: String(draft?.fps ?? 60),
                    onChange: event => updateDraft('fps', Number(event.target.value)),
                  }, [30, 60].map(value => h('option', { key: value, value: String(value) }, `${value} fps`)))),
                h(Field, { label: t('setting.format') },
                  h('select', {
                    className: 'pr-input', value: draft?.videoFormat ?? 'mkv',
                    onChange: event => updateDraft('videoFormat', event.target.value),
                  }, ['mkv', 'mp4', 'hybrid_mov'].map(value => h('option', { key: value, value }, value.toUpperCase())))),
                h(Field, { label: t('setting.encoder'), wide: true },
                  h('select', {
                    className: 'pr-input', value: draft?.videoEncoder ?? 'com.apple.videotoolbox.videoencoder.ave.avc',
                    onChange: event => updateDraft('videoEncoder', event.target.value),
                  }, [
                    ['com.apple.videotoolbox.videoencoder.ave.avc', 'Apple VT H.264（硬件，推荐）'],
                    ['com.apple.videotoolbox.videoencoder.h264', 'Apple VT H.264（软件）'],
                    ['com.apple.videotoolbox.videoencoder.ave.hevc', 'Apple VT HEVC（硬件）'],
                    ['obs_x264', 'x264'],
                  ].map(([value, label]) => h('option', { key: value, value }, label)))),
                h(Field, { label: t('capture.label'), wide: true },
                  h('div', { className: 'pr-row' },
                    h('select', {
                      className: 'pr-input', value: obs.capture?.device ?? '',
                      onChange: event => void chooseDevice(event.target.value),
                    }, (devices ?? []).length > 0
                      ? devices.map(item => h('option', { key: item.value, value: item.value }, item.label))
                      : h('option', { value: obs.capture?.device ?? '' }, obs.capture?.device || t('capture.none'))),
                    h(Button, { icon: 'refresh', onClick: () => void loadDevices(), disabled: busy }, t('action.refresh')))),
                h(Field, { label: t('audio.label'), wide: true },
                  h('div', { className: 'pr-row' },
                    h('select', {
                      className: 'pr-input', value: audioDevices?.current ?? obs.audio?.deviceId ?? '',
                      onChange: event => void chooseAudioDevice(event.target.value),
                    }, (audioDevices?.devices ?? []).length > 0
                      ? audioDevices.devices.map(item => h('option', { key: item.id, value: item.id }, item.label))
                      : h('option', { value: obs.audio?.deviceId ?? '' }, obs.audio?.connected ? (obs.audio.deviceId || t('audio.unmuted')) : t('audio.disconnected'))),
                    h(Button, { icon: 'refresh', onClick: () => void loadAudioDevices(), disabled: busy }, t('action.refresh')))),
                h(Field, { label: t('setting.padding') },
                  h('input', {
                    className: 'pr-input', type: 'number', min: 1, max: 4, value: draft?.episodePadding ?? 2,
                    onChange: event => updateDraft('episodePadding', Number(event.target.value)),
                  })),
                h(Field, { label: t('setting.separator') },
                  h('input', {
                    className: 'pr-input', value: draft?.separator ?? ' | ', spellCheck: false,
                    onChange: event => updateDraft('separator', event.target.value),
                  }))),
              h('div', { className: 'pr-actions' },
                h(Button, { icon: 'refresh', onClick: () => void prepare(), disabled: busy }, t('action.prepare')),
                h(Button, { icon: 'folder', onClick: () => void act('/open-folder', {}, { captureForce: false }) }, t('action.openFolder'))))
            : null,

          tab === 'advanced'
            ? h('div', { className: 'pr-tab-body' },
              h('div', { className: 'pr-toggles' },
                h(Toggle, { label: t('setting.autoUpload'), checked: draft?.autoUpload !== false, onChange: value => updateDraft('autoUpload', value) }),
                h(Toggle, { label: t('setting.thumbnail'), checked: draft?.makeThumbnail !== false, onChange: value => updateDraft('makeThumbnail', value) }),
                h(Toggle, { label: t('setting.keepOriginal'), checked: Boolean(draft?.keepOriginal), onChange: value => updateDraft('keepOriginal', value) }),
                h(Toggle, { label: t('setting.unmute'), checked: draft?.unmuteGameAudio !== false, onChange: value => updateDraft('unmuteGameAudio', value) }),
                h(Toggle, { label: t('setting.monitorAudio'), checked: Boolean(draft?.monitorGameAudio), onChange: value => updateDraft('monitorGameAudio', value) }),
                h(Toggle, { label: t('setting.keepAwake'), checked: draft?.keepAwake !== false, onChange: value => updateDraft('keepAwake', value) })),
              h('div', { className: 'pr-grid' },
                h(Field, { label: t('setting.uploadDelay') },
                  h('input', {
                    className: 'pr-input', type: 'number', min: 0, value: draft?.uploadDelaySeconds ?? 2,
                    onChange: event => updateDraft('uploadDelaySeconds', Number(event.target.value)),
                  })),
                h(Field, { label: t('setting.playlist') },
                  h('input', {
                    className: 'pr-input', value: draft?.playlistId ?? '', spellCheck: false,
                    onChange: event => updateDraft('playlistId', event.target.value),
                  }))),
              h('div', { className: 'pr-status-row' },
                h('span', { className: 'pr-status-item' },
                  h('span', { className: 'pr-status-key' }, 'OBS'),
                  h('span', { className: 'pr-status-value' }, `${obs.connected ? t('status.obsOn') : t('status.obsOff')}${obs.version ? ` · ${obs.version}` : ''}`)),
                h('span', { className: 'pr-status-item' },
                  h('span', { className: 'pr-status-key' }, 'ffmpeg'),
                  h('span', { className: 'pr-status-value', 'data-tone': data?.ffmpeg?.available ? 'ok' : 'warn' }, data?.ffmpeg?.path || '—'))))
            : null),

        h('footer', { className: 'pr-footer' },
          h('span', null, data?.youtube?.connected ? '' : t('hint.notConnected')),
          h('span', null, 'obs-websocket · ffmpeg · YouTube Data API')));
    }

    /* ------------------------------------------------------------------ */
    /* styles                                                             */
    /* ------------------------------------------------------------------ */

    const CSS = `
.pr-page{position:relative;height:100%;overflow:auto;box-sizing:border-box;padding:calc(26px + var(--dsh-frame-top-clearance,0px)) 30px 60px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px;line-height:1.5}
.pr-page *{box-sizing:border-box}
.pr-page>:not(.pr-banner){max-width:1040px;margin-left:auto;margin-right:auto}
.pr-banner{max-width:1040px;margin:0 auto 12px;padding:10px 14px;border-radius:10px;font-size:12px;color:var(--dsw-alias-state-error-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 7%,transparent)}
.pr-banner[data-tone='ok']{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 30%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 7%,transparent)}
.pr-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap}
.pr-heading{min-width:0}
.pr-title{margin:0 0 3px;font-size:21px;font-weight:650;letter-spacing:-.015em;line-height:1.25}
.pr-subtitle{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}
.pr-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pr-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.pr-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:11.5px;font-weight:550;white-space:nowrap}
.pr-chip-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}
.pr-chip[data-tone='live']{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 7%,transparent)}
.pr-chip[data-tone='live'] .pr-chip-dot{background:var(--dsw-alias-state-error-primary)}
.pr-chip[data-tone='ok']{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 26%,transparent)}
.pr-chip[data-tone='ok'] .pr-chip-dot{background:var(--dsw-alias-state-success-primary)}
.pr-chip[data-tone='warn']{color:var(--dsw-alias-state-warn-primary)}
.pr-chip[data-tone='warn'] .pr-chip-dot{background:var(--dsw-alias-state-warn-primary)}
.pr-chip[data-tone='error']{color:var(--dsw-alias-state-error-primary)}
.pr-chip[data-tone='error'] .pr-chip-dot{background:var(--dsw-alias-state-error-primary)}
.pr-chip[data-pulse='true'] .pr-chip-dot{animation:pr-pulse 2.4s ease-in-out infinite}
@keyframes pr-pulse{0%,100%{opacity:1}50%{opacity:.25}}
.pr-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:550;cursor:pointer;transition:background .15s ease,border-color .15s ease,opacity .15s ease;white-space:nowrap}
.pr-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.pr-btn:disabled{opacity:.42;cursor:default}
.pr-btn[data-variant='primary']{border-color:transparent;background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff}
.pr-btn[data-variant='primary']:hover{filter:brightness(1.06)}
.pr-btn[data-variant='danger']{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.pr-btn[data-variant='ghost']{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}
.pr-card{border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1);padding:16px 18px 18px;margin-bottom:14px}
.pr-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.pr-card-title{margin:0;font-size:13px;font-weight:600}
.pr-card-side{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.pr-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.pr-field[data-wide='true']{grid-column:1/-1}
.pr-field-label{font-size:11px;color:var(--dsw-alias-label-secondary);font-weight:550}
.pr-field-hint{font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.8}
.pr-input{appearance:none;width:100%;height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.pr-input:focus{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 40%,transparent);outline-offset:-1px}
textarea.pr-input{height:auto;padding:8px 10px;resize:vertical;line-height:1.5}
.pr-preview{display:flex;flex-direction:column;gap:5px;justify-content:center;padding:8px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);border:1px dashed var(--dsw-alias-border-l1)}
.pr-preview-label{font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.pr-preview-title{font-size:14px;font-weight:600;letter-spacing:-.01em;word-break:break-all}
.pr-preview-title[data-empty='true']{font-weight:500;color:var(--dsw-alias-label-secondary);font-size:12.5px}
.pr-status-row{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}
.pr-status-item{display:flex;flex-direction:column;gap:2px;min-width:0;max-width:100%}
.pr-status-key{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-weight:550}
.pr-status-value{font-size:11.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px}
.pr-status-value[data-tone='ok']{color:var(--dsw-alias-state-success-primary)}
.pr-status-value[data-tone='warn']{color:var(--dsw-alias-state-warn-primary)}
.pr-session{display:flex;align-items:center;gap:16px;margin-top:14px;padding:14px 16px;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 6%,var(--dsw-alias-bg-layer-2));border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 22%,transparent);flex-wrap:wrap}
.pr-session-time{font-size:26px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--dsw-alias-state-error-primary);min-width:120px}
.pr-session-body{flex:1;min-width:180px}
.pr-session-title{font-size:13.5px;font-weight:600;margin-bottom:3px}
.pr-session-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}
.pr-session-actions{display:flex;gap:8px}
.pr-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.pr-warn{display:flex;flex-direction:column;gap:3px;margin-top:12px;padding:10px 13px;border-radius:10px;font-size:11.5px;color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 26%,transparent)}
.pr-empty{margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.pr-queue{display:flex;flex-direction:column;gap:10px}
.pr-queue-item{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:11px 13px;border-radius:11px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);flex-wrap:wrap}
.pr-queue-main{flex:1;min-width:200px}
.pr-queue-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px}
.pr-queue-title{font-size:12.5px;font-weight:600}
.pr-queue-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.pr-queue-error{color:var(--dsw-alias-state-error-primary);max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-queue-warning{color:var(--dsw-alias-state-warn-primary);max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-queue-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.pr-progress{height:4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);margin-top:8px;overflow:hidden}
.pr-progress-fill{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary,#4d6bfe);transition:width .4s ease}
.pr-link{font-size:11.5px;color:var(--dsw-alias-brand-primary,#4d6bfe);text-decoration:none;white-space:nowrap}
.pr-link:hover{text-decoration:underline}
.pr-tabs{display:inline-flex;padding:2px;gap:2px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.pr-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;font-weight:550;padding:4px 11px;border-radius:7px;cursor:pointer}
.pr-tab[data-active='true']{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.1)}
.pr-tab-body{display:flex;flex-direction:column;gap:14px}
.pr-toggle{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.pr-toggle input{position:absolute;opacity:0;width:0;height:0}
.pr-toggle-track{position:relative;width:30px;height:17px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);transition:background .15s ease;flex:none}
.pr-toggle-thumb{position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .15s ease,background .15s ease}
.pr-toggle input:checked+.pr-toggle-track{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 30%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 50%,transparent)}
.pr-toggle input:checked+.pr-toggle-track .pr-toggle-thumb{transform:translateX(13px);background:var(--dsw-alias-brand-primary,#4d6bfe)}
.pr-toggles{display:flex;flex-wrap:wrap;gap:10px 20px;padding-top:4px}
.pr-youtube{display:flex;flex-direction:column;gap:12px;padding:13px 14px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.pr-youtube-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pr-youtube-id{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:550}
.pr-youtube-actions{display:flex;gap:8px}
.pr-playlists{display:flex;flex-wrap:wrap;gap:6px}
.pr-playlist{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:4px 9px;border-radius:999px;cursor:pointer}
.pr-playlist:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}
.pr-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}
.pr-row{display:flex;gap:8px}
.pr-loading{padding:40px 0;text-align:center;color:var(--dsw-alias-label-secondary)}
.pr-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:18px;font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.85;flex-wrap:wrap}
@media (max-width:720px){.pr-page{padding:calc(20px + var(--dsh-frame-top-clearance,0px)) 16px 40px}.pr-session-time{font-size:22px}}
`;

    /* ------------------------------------------------------------------ */
    /* plugin                                                             */
    /* ------------------------------------------------------------------ */

    function Glyph({ size = 18, active = false }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { opacity: active ? 1 : 0.86 },
      },
        h('rect', { x: 2.5, y: 6, width: 14, height: 12, rx: 2.5 }),
        h('path', { d: 'M16.5 10.5 21 8v8l-4.5-2.5z' }),
        h('circle', { cx: 7.5, cy: 12, r: 2.2, fill: 'currentColor', stroke: 'none', opacity: 0.9 }));
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, MESSAGES));
      const t = ctx.locale.bind(NS);

      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_KEY, inject: () => ({ t }),
      }, Page)));

      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_KEY, order: 22,
        label: () => t('panel.label'),
      }, Glyph)));
    }

    return { inject: ['slots', 'locale'], apply };
  },
});
