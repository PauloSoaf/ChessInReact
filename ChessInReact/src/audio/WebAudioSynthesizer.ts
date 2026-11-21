/**
 * WebAudioSynthesizer.ts
 *
 * Procedural Web Audio API sound synthesizer and haptic vibration engine.
 * Fully offline, zero external sound assets, zero network egress (Spec 12 RNF-01 & RNF-13).
 *
 * Conforms to:
 * - Spec 01 Section 10.2 (R3F <-> EventBus Audio Controller)
 * - Spec 12 RF-18 (Haptic Feedback and Custom Minigame Audio)
 * - Spec 12 RNF-13 (Audio Isolation with Web Audio API & Volume Controls)
 */

export class WebAudioSynthesizer {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled: boolean = true;
  private volume: number = 0.35; // Safe default volume within RNF-13 limits

  constructor() {
    // AudioContext is lazily initialized on first user interaction
  }

  /**
   * Lazily initializes the browser AudioContext and master gain node.
   */
  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.audioCtx) {
      try {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          this.audioCtx = new AudioCtxClass();
          this.masterGain = this.audioCtx.createGain();
          this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
          this.masterGain.connect(this.audioCtx.destination);
        }
      } catch {
        this.audioCtx = null;
        this.masterGain = null;
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    return this.audioCtx;
  }

  /**
   * Sets whether sound effects are enabled.
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Returns current sound enabled status.
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Sets master volume with strict boundary clamping (0.0 to 1.0) per RNF-13.
   */
  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.volume = clamped;
    if (this.audioCtx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(clamped, this.audioCtx.currentTime);
    }
  }

  /**
   * Returns current volume.
   */
  public getVolume(): number {
    return this.volume;
  }

  /**
   * Triggers subtle haptic vibration on mobile devices (Spec 12 RF-18).
   */
  public triggerHaptic(pattern: number | number[] = 15): void {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore vibration errors on unsupported devices
    }
  }

  /**
   * Standard piece move sound: crisp wooden board tap.
   */
  public playMove(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic(12);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.045);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  /**
   * Subtle tactile click sound for UI buttons (reserve drops, spell activation).
   */
  public playTactileClick(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic(10);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.02);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + 0.025);
  }

  /**
   * Piece selection / pickup sound: subtle micro-tap on lifting a piece from the board.
   */
  public playPieceSelect(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic(8);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(310, t + 0.015);

    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + 0.02);
  }

  /**
   * Illegal move / check constraint warning: soft wooden double buzz / error tap.
   */
  public playIllegalMove(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic(25);

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(75, t + 0.05);

    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + 0.055);
  }

  /**
   * Piece capture sound: punchy impact click with acoustic variation by piece weight.
   * Heavy pieces (Queen, Rook, King) produce a deeper, resonant wooden thud.
   * Pawns produce a crisp, lighter tap.
   */
  public playCapture(variantId?: string): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    const vUpper = variantId ? variantId.toUpperCase() : '';
    const isHeavy = vUpper === 'QUEEN' || vUpper === 'ROOK' || vUpper === 'KING' || vUpper === 'DUCK';
    const isPawn = vUpper === 'PAWN';

    const hapticDuration = isHeavy ? 35 : isPawn ? 15 : 25;
    this.triggerHaptic(hapticDuration);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const t = ctx.currentTime;

    if (isHeavy) {
      // Deeper, heavier impact
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(35, t + 0.08);

      gain.gain.setValueAtTime(0.55, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.085);
    } else if (isPawn) {
      // Crisper, lighter tap
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.045);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.05);
    } else {
      // Standard minor/medium piece click (Knight, Bishop, Silver, Gold, etc.)
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.065);

      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.07);
    }
  }

  /**
   * Royal check alert: pleasant harmonic chime (D5 + A5), or dramatic triple chime on match-deciding checks.
   */
  public playCheck(urgent = false): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic(urgent ? [30, 20, 45] : 30);

    const t = ctx.currentTime;
    const freqs = urgent ? [587.33, 880.0, 1174.66] : [587.33, 880.0];
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(urgent ? 0.28 : 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (urgent ? 0.32 : 0.22));

      osc.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + (urgent ? 0.33 : 0.23));
    }
  }

  /**
   * Checkmate / game conclusion fanfare: rich resonant chord.
   */
  public playCheckmate(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic([30, 40, 60]);

    const t = ctx.currentTime;
    const chord = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.03);

      gain.gain.setValueAtTime(0.25, t + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t + idx * 0.03);
      osc.stop(t + 0.46);
    });
  }

  /**
   * Triumphant Victory Fanfare (King of the Hill conquest, Racing Kings win, Antichess extinction win).
   * Ascending C major fanfare (C4 -> E4 -> G4 -> C5 -> E5).
   */
  public playVictoryFanfare(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic([40, 30, 70]);

    const t = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25]; // C4, E4, G4, C5, E5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);

      gain.gain.setValueAtTime(0.3, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.38);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.39);
    });
  }

  /**
   * Castling acoustic: two rapid synchronized wooden piece sliding impacts (King + Rook).
   */
  public playCastle(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic([18, 30, 24]);

    const t = ctx.currentTime;
    // Step 1: King wooden step
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(200, t);
    osc1.frequency.exponentialRampToValueAtTime(95, t + 0.045);
    gain1.gain.setValueAtTime(0.28, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    osc1.connect(gain1);
    gain1.connect(master);
    osc1.start(t);
    osc1.stop(t + 0.05);

    // Step 2: Rook swift slide & lock (90ms delay)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(260, t + 0.09);
    osc2.frequency.exponentialRampToValueAtTime(110, t + 0.14);
    gain2.gain.setValueAtTime(0.32, t + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc2.connect(gain2);
    gain2.connect(master);
    osc2.start(t + 0.09);
    osc2.stop(t + 0.15);
  }

  /**
   * Pawn Promotion Fanfare: triumphant ascending major chord flourish.
   */
  public playPromote(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic([20, 20, 40]);

    const t = ctx.currentTime;
    const notes = [440.0, 554.37, 659.25, 880.0]; // A4, C#5, E5, A5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.05);

      gain.gain.setValueAtTime(0.28, t + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.28);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t + idx * 0.05);
      osc.stop(t + idx * 0.05 + 0.29);
    });
  }

  /**
   * Mechanical DGT Chess Clock Tick.
   * Produces an authentic, tactile micro-click.
   * In urgent scramble (< 10s), switches to a sharper dual-frequency alert click.
   */
  public playClockTick(isUrgent = false): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    if (isUrgent) {
      this.triggerHaptic([12, 18]);
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1600, t);
      osc.frequency.exponentialRampToValueAtTime(800, t + 0.02);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.025);
    } else {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, t);
      osc.frequency.exponentialRampToValueAtTime(650, t + 0.015);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.02);
    }
  }

  /**
   * Zeitnot Time Pressure Warning: Tense cardiovascular double heartbeat thump (thump-thump).
   * Generates palpable psychological urgency when under critical time scramble (< 10 seconds).
   */
  public playLowTimeWarning(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic([35, 75, 45]);

    const t = ctx.currentTime;

    // Heartbeat Pulse 1 (Systole - deep sub-bass thump)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(58, t);
    osc1.frequency.exponentialRampToValueAtTime(32, t + 0.09);
    gain1.gain.setValueAtTime(0.42, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc1.connect(gain1);
    gain1.connect(master);
    osc1.start(t);
    osc1.stop(t + 0.095);

    // Heartbeat Pulse 2 (Diastole - secondary resonant thump 120ms later)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(68, t + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(36, t + 0.2);
    gain2.gain.setValueAtTime(0.32, t + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc2.connect(gain2);
    gain2.connect(master);
    osc2.start(t + 0.12);
    osc2.stop(t + 0.205);
  }

  /**
   * Atomic explosion burst: low-frequency rumble and filtered noise.
   */
  public playExplosion(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic(50);

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.25);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  /**
   * Duck Chess: synthetic duck quack via dual-formant resonance (Spec 12 RF-18).
   */
  public playDuck(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic([15, 20, 15]);

    const t = ctx.currentTime;
    const duration = 0.18;

    // Dual formant oscillators simulating authentic nasal quack
    const formants = [450, 850];
    for (const baseFreq of formants) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.linearRampToValueAtTime(baseFreq * 0.75, t + duration);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(baseFreq, t);
      filter.Q.setValueAtTime(4.0, t);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.linearRampToValueAtTime(0.35, t + duration * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + duration + 0.01);
    }
  }

  /**
   * Spell Chess: mystical audio synthesis for each spell type (Spec 12 RF-18).
   */
  public playSpell(spellType: string): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic(25);

    const t = ctx.currentTime;
    const upper = spellType.toUpperCase();

    if (upper === 'JUMP') {
      // Rapid upward sparkling arpeggio
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.035);

        gain.gain.setValueAtTime(0.25, t + idx * 0.035);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.035 + 0.08);

        osc.connect(gain);
        gain.connect(master);

        osc.start(t + idx * 0.035);
        osc.stop(t + idx * 0.035 + 0.09);
      });
    } else if (upper === 'FREEZE') {
      // Crystalline glass shimmer
      const freqs = [1174.66, 1760.0];
      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc.connect(gain);
        gain.connect(master);

        osc.start(t);
        osc.stop(t + 0.23);
      });
    } else if (upper === 'STEALTH' || upper === 'FOG') {
      // Ethereal whisper sweep
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, t);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, t);
      filter.frequency.exponentialRampToValueAtTime(150, t + 0.16);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.17);
    } else {
      // PORTAL or default magical warp sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(840, t + 0.1);
      osc.frequency.exponentialRampToValueAtTime(420, t + 0.22);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.23);
    }
  }

  /**
   * Tactical piece drop (Crazyhouse / Shogi / Bughouse).
   */
  public playDrop(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.triggerHaptic(18);

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.055);

    gain.gain.setValueAtTime(0.38, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  /**
   * Puzzle Rush move outcome audio (Spec 12 RF-18).
   */
  public playPuzzleOutcome(isCorrect: boolean): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    const t = ctx.currentTime;
    if (isCorrect) {
      this.triggerHaptic([15, 25]);
      // Cheerful major arpeggio (C5 -> E5 -> G5)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.05);

        gain.gain.setValueAtTime(0.24, t + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.12);

        osc.connect(gain);
        gain.connect(master);

        osc.start(t + idx * 0.05);
        osc.stop(t + idx * 0.05 + 0.13);
      });
    } else {
      this.triggerHaptic(40);
      // Soft low buzzer
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.linearRampToValueAtTime(95, t + 0.16);

      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.17);
    }
  }
}

/**
 * Global singleton audio synthesizer instance.
 */
export const globalAudioSynthesizer = new WebAudioSynthesizer();
