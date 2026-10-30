import { NarrationPlayer } from "../../game/tutorial/TutorialController";

type Listener<T> = (v: T) => void;

/**
 * Plays a step's narration in the browser: an audio file through an `<audio>` element, or, when the
 * step's `audio` is `"tts"`, the browser's speech synthesis (sentence boundaries come from the
 * synthesizer, so sentence cues are exact). Mobile browsers need a user gesture before either will
 * play; the tutorial's Start tap provides it.
 */
export class BrowserNarration implements NarrationPlayer {
  private audio?: HTMLAudioElement;
  private utterances: SpeechSynthesisUtterance[] = [];
  private timeListeners: Listener<number>[] = [];
  private sentenceListeners: Listener<number>[] = [];
  private endListeners: Listener<void>[] = [];
  private _playing = false;
  private _paused = false;
  private startedAt = 0;
  private pausedAt = 0;
  private ttsTimer: any;
  private _duration: number | undefined;
  private rate = 1;
  private generation = 0;
  /** Recordings loading ahead of their step (see `preload`), by URL, oldest first */
  private preloaded = new Map<string, HTMLAudioElement>();

  constructor(private resolveUrl: (url: string) => string = (u) => u) {}

  get playing() {
    return this._playing;
  }
  get paused() {
    return this._paused;
  }
  get duration() {
    return this._duration;
  }
  get time() {
    if (this.audio) return this.audio.currentTime;
    if (!this._playing) return 0;
    return (((this._paused ? this.pausedAt : performance.now()) - this.startedAt) / 1000) * this.rate;
  }

  /**
   * Playback speed. Recorded audio changes speed immediately (pitch preserved). Speech synthesis
   * queues every sentence up front, so a change there applies from the next step.
   */
  setRate(rate: number) {
    if (!(rate > 0)) return;
    if (!this.audio && this._playing) {
      // keep `time` continuous for the speech clock
      const at = this._paused ? this.pausedAt : performance.now();
      const t = ((at - this.startedAt) / 1000) * this.rate;
      this.startedAt = at - (t * 1000) / rate;
    }
    this.rate = rate;
    if (this.audio) this.audio.playbackRate = rate;
  }

  onTime(cb: Listener<number>) {
    this.timeListeners.push(cb);
    return () => {
      this.timeListeners = this.timeListeners.filter((c) => c !== cb);
    };
  }
  onSentence(cb: Listener<number>) {
    this.sentenceListeners.push(cb);
    return () => {
      this.sentenceListeners = this.sentenceListeners.filter((c) => c !== cb);
    };
  }
  onEnd(cb: () => void) {
    this.endListeners.push(cb);
    return () => {
      this.endListeners = this.endListeners.filter((c) => c !== cb);
    };
  }

  /**
   * Starts downloading a recording before its step, so it starts at once when the step comes. Keeps
   * the last few: Back can return to one just played.
   */
  preload(audio: string) {
    if (audio === "tts" || typeof Audio === "undefined") return;
    const url = this.resolveUrl(audio);
    if (this.preloaded.has(url)) return;
    const element = new Audio();
    element.preload = "auto";
    element.src = url;
    element.load();
    this.preloaded.set(url, element);
    while (this.preloaded.size > 3) {
      const [oldest] = this.preloaded.keys();
      this.preloaded.delete(oldest);
    }
  }

  async play(step: { audio: string; text: string; sentences: string[] }): Promise<void> {
    this.stop();
    const generation = ++this.generation;
    this._playing = true;
    this._paused = false;
    if (step.audio === "tts") {
      return this.speak(step.sentences, generation);
    }
    const url = this.resolveUrl(step.audio);
    // Reuse the element that has been loading it, if any
    const ready = this.preloaded.get(url);
    this.preloaded.delete(url);
    const audio = ready ?? new Audio(url);
    if (ready) audio.currentTime = 0;
    audio.playbackRate = this.rate;
    audio.preservesPitch = true;
    this.audio = audio;
    this._duration = undefined;
    audio.addEventListener("loadedmetadata", () => {
      if (generation === this.generation) this._duration = audio.duration;
    });
    audio.addEventListener("timeupdate", () => {
      if (generation === this.generation) this.timeListeners.forEach((cb) => cb(audio.currentTime));
    });
    audio.addEventListener("ended", () => {
      if (generation !== this.generation) return;
      this._playing = false;
      this.endListeners.forEach((cb) => cb());
    });
    try {
      await audio.play();
    } catch (e) {
      this._playing = false;
      throw e;
    }
  }

  private speak(sentences: string[], generation: number): Promise<void> {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || sentences.length === 0) {
      this._playing = false;
      return Promise.reject(new Error("speech synthesis unavailable"));
    }
    synth.cancel();
    this.startedAt = performance.now();
    const text = (s: string) => s.replace(/[*_`#>[\]()!]/g, "").replace(/:[a-zA-Z0-9_-]+:/g, "");
    // Rough estimate so proportional cues have something to work with: ~2.6 words/second
    const words = sentences.join(" ").split(/\s+/).length;
    this._duration = Math.max(1, words / 2.6);
    let started: () => void = () => {};
    let failed: (e: Error) => void = () => {};
    const startedPromise = new Promise<void>((resolve, reject) => {
      started = resolve;
      failed = reject;
    });
    // Some browsers (and headless ones) accept the utterance and never speak: fall back after a moment
    const watchdog = setTimeout(() => {
      if (generation === this.generation && this._playing) {
        this.stop();
        failed(new Error("speech synthesis did not start"));
      }
    }, 2500);
    this.utterances = sentences.map((s, i) => {
      const u = new SpeechSynthesisUtterance(text(s));
      u.rate = this.rate;
      u.onstart = () => {
        if (generation !== this.generation) return;
        if (i === 0) {
          clearTimeout(watchdog);
          started();
        }
        this.sentenceListeners.forEach((cb) => cb(i));
      };
      u.onerror = () => {
        if (generation !== this.generation) return;
        clearTimeout(watchdog);
        this.stop();
        failed(new Error("speech synthesis error"));
      };
      u.onend = () => {
        if (generation !== this.generation) return;
        if (i === sentences.length - 1) {
          this._playing = false;
          clearInterval(this.ttsTimer);
          this.endListeners.forEach((cb) => cb());
        }
      };
      return u;
    });
    this.utterances.forEach((u) => synth.speak(u));
    clearInterval(this.ttsTimer);
    this.ttsTimer = setInterval(() => {
      if (generation === this.generation && this._playing && !this._paused) {
        this.timeListeners.forEach((cb) => cb(this.time));
      }
    }, 100);
    return startedPromise;
  }

  pause() {
    if (!this._playing || this._paused) return;
    this._paused = true;
    if (this.audio) this.audio.pause();
    else {
      this.pausedAt = performance.now();
      window.speechSynthesis?.pause();
    }
  }

  resume() {
    if (!this._playing || !this._paused) return;
    this._paused = false;
    if (this.audio) void this.audio.play().catch(() => {});
    else {
      this.startedAt += performance.now() - this.pausedAt;
      window.speechSynthesis?.resume();
    }
  }

  stop() {
    this.generation++;
    this._playing = false;
    this._paused = false;
    clearInterval(this.ttsTimer);
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = undefined;
    }
    if (this.utterances.length && typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
      this.utterances = [];
    }
  }
}
