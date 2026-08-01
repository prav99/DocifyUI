import React, { useEffect, useRef, useState } from 'react';
import { LogoMark } from './ui.jsx';

/* =========================================================================
   Demo kit — the shared engine behind every self-playing product film.
   One implementation of: ambient score (WebAudio), narrated voiceover
   (speechSynthesis), caption track, scene sequencing that waits for BOTH
   the minimum scene time AND the narration to finish, poster, controls.
   Used by the three homepage films in pages/demos.jsx.
   ========================================================================= */

/* ---------------- ambient score ---------------- */
let musicCtx = null, musicNodes = null;

export function musicStart() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!musicCtx) musicCtx = new AC();
    if (musicCtx.state === 'suspended') musicCtx.resume();
    if (musicNodes) return;
    const ctx = musicCtx;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 4);
    master.connect(ctx.destination);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.3;
    lp.connect(master);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 120;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency); lfo.start();
    const chords = [
      [130.81, 196.0, 329.63, 493.88],
      [110.0, 164.81, 261.63, 392.0],
      [87.31, 174.61, 261.63, 440.0]
    ];
    const oscs = chords[0].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i < 2 ? 0.5 : 0.2;
      o.connect(g); g.connect(lp); o.start();
      return o;
    });
    let step = 0;
    const iv = setInterval(() => {
      step++;
      const ch = chords[step % chords.length];
      const t = ctx.currentTime;
      oscs.forEach((o, i) => o.frequency.setTargetAtTime(ch[i], t, 2.5));
    }, 9000);
    musicNodes = { master, oscs, lfo, iv };
  } catch { /* audio unavailable */ }
}

/* ---------------- interaction sound effects ----------------
   Tiny WebAudio cues per scene: click (UI action), whoosh (scene hook),
   chime (completion), success (resolution chord). Always quiet, under VO. */
export function sfx(kind) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!musicCtx) musicCtx = new AC();
    const ctx = musicCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.connect(ctx.destination);
    const tone = (freq, at, dur, vol, type = 'sine') => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.linearRampToValueAtTime(vol, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g); g.connect(out);
      o.start(t + at); o.stop(t + at + dur + 0.05);
    };
    if (kind === 'click') {
      tone(1600, 0, 0.06, 0.045, 'triangle'); tone(2400, 0.005, 0.04, 0.02, 'sine');
    } else if (kind === 'whoosh') {
      const len = Math.floor(ctx.sampleRate * 0.45);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      src.connect(f); f.connect(g); g.connect(out); src.start(t);
    } else if (kind === 'chime') {
      tone(880, 0, 0.5, 0.05); tone(1318.5, 0.12, 0.6, 0.04);
    } else if (kind === 'success') {
      tone(523.25, 0, 0.4, 0.045); tone(659.25, 0.1, 0.4, 0.04); tone(783.99, 0.2, 0.6, 0.045);
    }
  } catch { /* audio unavailable */ }
}

export function musicStop() {
  try {
    if (!musicNodes || !musicCtx) return;
    clearInterval(musicNodes.iv);
    const t = musicCtx.currentTime;
    musicNodes.master.gain.cancelScheduledValues(t);
    musicNodes.master.gain.setTargetAtTime(0.0001, t, 0.4);
    const n = musicNodes;
    musicNodes = null;
    setTimeout(() => { try { n.oscs.forEach((o) => o.stop()); n.lfo.stop(); n.master.disconnect(); } catch { /* ignore */ } }, 1600);
  } catch { /* ignore */ }
}

/* ---------------- narration ---------------- */
let cachedVoice = null;
function pickVoice() {
  try {
    const vs = window.speechSynthesis.getVoices();
    if (!vs || !vs.length) return null;
    const prefs = [
      /Google UK English Female/i, /Google US English/i,
      /(Aria|Jenny|Sonia|Libby|Emma).*(Natural|Online)/i,
      /Samantha/i, /Serena/i, /Karen/i, /Moira/i, /Tessa/i, /Daniel/i
    ];
    for (const rx of prefs) { const v = vs.find((x) => rx.test(x.name)); if (v) return v; }
    return vs.find((x) => x.lang && x.lang.indexOf('en') === 0) || vs[0];
  } catch { return null; }
}
try {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => { cachedVoice = pickVoice(); };
  }
} catch { /* ignore */ }

export function narrate(text, onEnd) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (!cachedVoice) cachedVoice = pickVoice();
    if (cachedVoice) u.voice = cachedVoice;
    u.rate = 1.0;
    u.pitch = 1;
    u.volume = 1;
    let done = false;
    const finish = () => { if (!done) { done = true; if (onEnd) onEnd(); } };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  } catch { if (onEnd) onEnd(); }
}

export function stopAllAudio() {
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  musicStop();
}

/* ---------------- opening slate ---------------- */
export function TitleSlate({ kicker, title, sub }) {
  return (
    <div className="slate">
      <div className="slate-mark"><LogoMark size={32} /></div>
      <p className="slate-kicker">{kicker}</p>
      <h3 className="slate-title">{title}</h3>
      <p className="slate-sub">{sub}</p>
      <p className="slate-note">Sound recommended — turn on the voiceover</p>
    </div>
  );
}

/* ---------------- animated counter used inside scenes ---------------- */
export function CountTo({ from = 0, to = 96, delay = 1200, dur = 3000 }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    let raf;
    const d = setTimeout(() => {
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        setV(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(d); if (raf) cancelAnimationFrame(raf); };
  }, [from, to, delay, dur]);
  return <>{v}</>;
}

/* Only one film may speak at a time: starting any film pauses whichever
   other film is currently playing (two overlapping voiceovers is chaos). */
let activeFilmPause = null;

/* =========================================================================
   DemoShell — the whole player. Feed it scenes; it does the rest.
   scenes: [{ label, vo, dur, render() }]
   ========================================================================= */
export function DemoShell({ name, crumb, scenes, posterMeta = null, poster = 'Play demo · sound on' }) {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [sound, setSound] = useState(true);
  const [runId, setRunId] = useState(0);
  const [fs, setFs] = useState(false);
  const windowRef = useRef(null);
  const playingRef = useRef(false);
  const pauseRef = useRef(null);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  useEffect(() => {
    if (!playing) return undefined;
    let alive = true;
    let advanced = false;
    let speechDone = !sound;
    let minDone = false;
    const tryAdvance = () => {
      if (!alive || advanced || !speechDone || !minDone) return;
      advanced = true;
      setTimeout(() => { if (alive) setScene((s) => (s + 1) % scenes.length); }, 450);
    };
    const tMin = setTimeout(() => { minDone = true; tryAdvance(); }, scenes[scene].dur);
    if (sound && scenes[scene].sfx) sfx(scenes[scene].sfx);
    if (sound) narrate(scenes[scene].vo, () => { speechDone = true; tryAdvance(); });
    const tGuard = setTimeout(() => { speechDone = true; minDone = true; tryAdvance(); }, scenes[scene].dur + 20000);
    return () => { alive = false; clearTimeout(tMin); clearTimeout(tGuard); };
  }, [scene, playing, sound, runId]); // eslint-disable-line

  useEffect(() => () => { stopAllAudio(); if (activeFilmPause === pauseRef) activeFilmPause = null; }, []);

  const pause = () => {
    setPlaying(false); stopAllAudio();
    if (activeFilmPause === pauseRef) activeFilmPause = null;
  };
  pauseRef.current = pause;
  const claimPlayback = () => {
    if (activeFilmPause && activeFilmPause !== pauseRef) { try { activeFilmPause.current(); } catch { /* ignore */ } }
    activeFilmPause = pauseRef;
  };
  const play = () => { claimPlayback(); setStarted(true); setPlaying(true); if (sound) musicStart(); setRunId((n) => n + 1); };
  const jump = (i) => {
    claimPlayback();
    setStarted(true); setPlaying(true);
    if (sound) musicStart();
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    setScene(i); setRunId((n) => n + 1);
  };

  // Auto-pause the moment the player scrolls (mostly) out of view — a film
  // narrating from off-screen is noise, not a demo. IntersectionObserver
  // where available, plus a rAF-throttled scroll fallback for environments
  // that suspend IO, plus a tab-visibility pause.
  useEffect(() => {
    const el = windowRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.intersectionRatio < 0.3 && playingRef.current) pauseRef.current();
    }, { threshold: [0, 0.3] });
    io.observe(el);
    return () => io.disconnect();
  }, [started]);
  useEffect(() => {
    const outOfView = () => {
      const el = windowRef.current;
      if (!el) return false;
      if (document.fullscreenElement === el || document.webkitFullscreenElement === el) return false;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      return visible < Math.min(r.height, vh) * 0.3;
    };
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (playingRef.current && outOfView()) pauseRef.current();
      });
    };
    const onVis = () => { if (document.hidden && playingRef.current) pauseRef.current(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Fullscreen expand/exit for the whole player window.
  const toggleFull = () => {
    const el = windowRef.current;
    if (!el) return;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl === el) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
  };
  useEffect(() => {
    const on = () => setFs((document.fullscreenElement || document.webkitFullscreenElement) === windowRef.current);
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    return () => { document.removeEventListener('fullscreenchange', on); document.removeEventListener('webkitfullscreenchange', on); };
  }, []);
  const toggleSound = () => {
    setSound((v) => {
      const nv = !v;
      if (!nv) stopAllAudio();
      else if (playing) { musicStart(); setRunId((n) => n + 1); }
      return nv;
    });
  };

  // Resting state: a designed light poster card — no black void while scrolling.
  if (!started && posterMeta) {
    return (
      <div className="demo-window" ref={windowRef}>
        <div className="demo-chrome">
          <span className="demo-shellname">Docify</span>
          <span className="crumb">{crumb}</span>
          <span className="spacer" style={{ flex: 1 }} />
        </div>
        <button className="vid-poster2" onClick={play} aria-label={'Play ' + name + ' demo with sound'}>
          <span className="vp2-text">
            <span className="vp2-kicker mono">{posterMeta.kicker}</span>
            <span className="vp2-title">{posterMeta.title}</span>
            <span className="vp2-sub">{posterMeta.sub}</span>
            <span className="vp2-meta">▶ Play with voiceover · {posterMeta.mins} · captions included</span>
          </span>
          <span className="vid-playbtn" aria-hidden="true">▶</span>
        </button>
      </div>
    );
  }

  return (
    <div className="demo-window" ref={windowRef}>
      {!started && (
        <button className="vid-poster" onClick={play} aria-label={'Play ' + name + ' demo with sound'}>
          <span className="vid-playbtn">▶</span>
          <span className="vid-postertxt">{poster}</span>
        </button>
      )}
      <div className="demo-chrome">
        <span className="demo-shellname">Docify</span>
        <span className="crumb">{crumb}</span>
        <span className="spacer" style={{ flex: 1 }} />
      </div>
      <div className="demo-body">
        <aside className="demo-rail">
          {scenes.map((s, i) => (
            <button key={s.label} className={'demo-step' + (i === scene ? ' on' : i < scene ? ' done' : '')} onClick={() => jump(i)}>
              <span className="mono">{'0' + (i + 1)}</span> {s.label}
            </button>
          ))}
        </aside>
        <div className={'demo-stage' + (scene === 0 ? ' demo-stage--slate' : '')} key={scene + '-' + runId}>
          {scenes[scene].render()}
        </div>
      </div>
      {/* caption track: the narration line, always visible for muted viewers */}
      {started && scene > 0 && (
        <div className="jd-cap"><span className="jd-capline" key={scene}>{scenes[scene].vo}</span></div>
      )}
      <div className="demo-bar">
        <button className="demo-ctl" onClick={() => (playing ? pause() : play())} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="demo-ctl" onClick={() => { pause(); setScene(0); setStarted(false); }} aria-label="Stop">■</button>
        <button className="demo-ctl demo-ctl--wide" onClick={toggleSound}>{sound ? 'Sound on' : 'Muted'}</button>
        <button className="demo-ctl" onClick={toggleFull} aria-label={fs ? 'Exit full screen' : 'Expand to full screen'} title={fs ? 'Exit full screen' : 'Full screen'}>{fs ? '⤡' : '⤢'}</button>
        <div className="demo-track">
          {scenes.map((s, i) => (
            <button key={s.label} className="demo-seg" onClick={() => jump(i)} aria-label={s.label}>
              {i === scene && started
                ? <span className="demo-segfill" style={{ animationDuration: Math.round(scenes[i].dur * 1.4) + 'ms', animationPlayState: playing ? 'running' : 'paused' }} />
                : i < scene ? <span className="demo-segdone" /> : null}
            </button>
          ))}
        </div>
        <span className="helper">{'0' + (scene + 1)} / {'0' + scenes.length} · {scenes[scene].label}</span>
      </div>
    </div>
  );
}
