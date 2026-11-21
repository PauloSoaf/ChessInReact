// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebAudioSynthesizer } from '../WebAudioSynthesizer';
import { GlobalEventBus } from '../../core/events/EventBus';
import { asCoordinateKey } from '../../core/coordinates';

describe('WebAudioSynthesizer & Audio Decoupling (Spec 01 Section 10.2 & Spec 12 RF-18, RNF-13)', () => {
  let synth: WebAudioSynthesizer;

  beforeEach(() => {
    synth = new WebAudioSynthesizer();
  });

  it('initializes safely without throwing in headless environments', () => {
    expect(synth.isEnabled()).toBe(true);
    expect(synth.getVolume()).toBeCloseTo(0.35);

    // Should no-op safely when no AudioContext is available
    expect(() => {
      synth.playMove();
      synth.playCapture();
      synth.playCheck();
      synth.playCheckmate();
      synth.playExplosion();
      synth.playDuck();
      synth.playSpell('JUMP');
      synth.playSpell('FREEZE');
      synth.playSpell('STEALTH');
      synth.playSpell('PORTAL');
      synth.playDrop();
      synth.playPuzzleOutcome(true);
      synth.playPuzzleOutcome(false);
      synth.triggerHaptic(15);
    }).not.toThrow();
  });

  it('clamps volume strictly between 0.0 and 1.0 per Spec 12 RNF-13', () => {
    synth.setVolume(-0.5);
    expect(synth.getVolume()).toBe(0);

    synth.setVolume(1.8);
    expect(synth.getVolume()).toBe(1);

    synth.setVolume(0.65);
    expect(synth.getVolume()).toBe(0.65);
  });

  it('honors enabled toggle and mutes audio immediately per Spec 12 RNF-13', () => {
    synth.setEnabled(false);
    expect(synth.isEnabled()).toBe(false);

    // When disabled, methods exit immediately without scheduling audio nodes
    expect(() => {
      synth.playMove();
      synth.playDuck();
      synth.playSpell('FREEZE');
    }).not.toThrow();

    synth.setEnabled(true);
    expect(synth.isEnabled()).toBe(true);
  });

  describe('Mocked Web Audio API audio graph creation', () => {
    let mockOsc: {
      type: string;
      frequency: {
        setValueAtTime: ReturnType<typeof vi.fn>;
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
        linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      };
      connect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    };

    let mockGain: {
      gain: {
        setValueAtTime: ReturnType<typeof vi.fn>;
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
        linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      };
      connect: ReturnType<typeof vi.fn>;
    };

    let mockFilter: {
      type: string;
      frequency: {
        setValueAtTime: ReturnType<typeof vi.fn>;
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
        linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      };
      Q: {
        setValueAtTime: ReturnType<typeof vi.fn>;
      };
      connect: ReturnType<typeof vi.fn>;
    };

    let mockAudioCtx: {
      state: string;
      currentTime: number;
      destination: Record<string, unknown>;
      resume: ReturnType<typeof vi.fn>;
      createOscillator: ReturnType<typeof vi.fn>;
      createGain: ReturnType<typeof vi.fn>;
      createBiquadFilter: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockOsc = {
        type: 'sine',
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };

      mockGain = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };

      mockFilter = {
        type: 'bandpass',
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        Q: {
          setValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };

      mockAudioCtx = {
        state: 'suspended',
        currentTime: 10.0,
        destination: {},
        resume: vi.fn().mockResolvedValue(undefined),
        createOscillator: vi.fn().mockReturnValue(mockOsc),
        createGain: vi.fn().mockReturnValue(mockGain),
        createBiquadFilter: vi.fn().mockReturnValue(mockFilter),
      };

      // Install mock AudioContext onto global window
      (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn().mockImplementation(() => mockAudioCtx);
    });

    afterEach(() => {
      delete (window as unknown as { AudioContext?: unknown }).AudioContext;
      vi.restoreAllMocks();
    });

    it('creates and starts audio oscillator nodes for piece move', () => {
      const activeSynth = new WebAudioSynthesizer();
      activeSynth.playMove();

      expect(mockAudioCtx.resume).toHaveBeenCalled();
      expect(mockAudioCtx.createOscillator).toHaveBeenCalled();
      expect(mockAudioCtx.createGain).toHaveBeenCalled();
      expect(mockOsc.start).toHaveBeenCalled();
      expect(mockOsc.stop).toHaveBeenCalled();
    });

    it('synthesizes tactile button click for reserve and spell activations', () => {
      const activeSynth = new WebAudioSynthesizer();
      activeSynth.playTactileClick();

      expect(mockAudioCtx.createOscillator).toHaveBeenCalled();
      expect(mockAudioCtx.createGain).toHaveBeenCalled();
      expect(mockOsc.start).toHaveBeenCalled();
      expect(mockOsc.stop).toHaveBeenCalled();
    });

    it('synthesizes piece capture with piece-weight acoustic differentiation', () => {
      const activeSynth = new WebAudioSynthesizer();

      // Heavy piece (Queen)
      activeSynth.playCapture('QUEEN');
      expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(140, 10.0);

      // Light piece (Pawn)
      activeSynth.playCapture('PAWN');
      expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(220, 10.0);

      // Default/minor piece (Knight or undefined)
      activeSynth.playCapture('KNIGHT');
      expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(180, 10.0);

      activeSynth.playCapture();
      expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(180, 10.0);
    });

    it('synthesizes authentic dual-formant duck quack (Spec 12 RF-18)', () => {
      const activeSynth = new WebAudioSynthesizer();
      activeSynth.playDuck();

      // Formants require dual oscillators and biquad filters
      expect(mockAudioCtx.createOscillator).toHaveBeenCalledTimes(2);
      expect(mockAudioCtx.createBiquadFilter).toHaveBeenCalledTimes(2);
      expect(mockOsc.start).toHaveBeenCalledTimes(2);
    });

    it('synthesizes spell sounds with distinct acoustic signatures', () => {
      const activeSynth = new WebAudioSynthesizer();

      // JUMP: 4-note ascending arpeggio
      activeSynth.playSpell('JUMP');
      expect(mockAudioCtx.createOscillator).toHaveBeenCalled();

      mockAudioCtx.createOscillator.mockClear();

      // FREEZE: dual crystalline shimmer
      activeSynth.playSpell('FREEZE');
      expect(mockAudioCtx.createOscillator).toHaveBeenCalledTimes(2);

      mockAudioCtx.createOscillator.mockClear();

      // STEALTH: filtered lowpass sweep
      activeSynth.playSpell('STEALTH');
      expect(mockAudioCtx.createBiquadFilter).toHaveBeenCalled();
    });

    it('synthesizes puzzle success and failure audio cues', () => {
      const activeSynth = new WebAudioSynthesizer();

      // Success
      activeSynth.playPuzzleOutcome(true);
      expect(mockAudioCtx.createOscillator).toHaveBeenCalledTimes(3);

      mockAudioCtx.createOscillator.mockClear();

      // Failure
      activeSynth.playPuzzleOutcome(false);
      expect(mockAudioCtx.createOscillator).toHaveBeenCalledTimes(1);
    });

    it('calls navigator.vibrate when available for mobile haptic feedback', () => {
      const vibrateSpy = vi.fn();
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateSpy,
        configurable: true,
        writable: true,
      });

      const activeSynth = new WebAudioSynthesizer();
      activeSynth.triggerHaptic(20);

      expect(vibrateSpy).toHaveBeenCalledWith(20);
    });

    it('synthesizes castling double wooden slide and tap', () => {
      const activeSynth = new WebAudioSynthesizer();
      activeSynth.playCastle();

      // Dual steps: King step + Rook step
      expect(mockAudioCtx.createOscillator).toHaveBeenCalledTimes(2);
      expect(mockOsc.start).toHaveBeenCalledTimes(2);
    });

    it('synthesizes promotion triumphant fanfare', () => {
      const activeSynth = new WebAudioSynthesizer();
      activeSynth.playPromote();

      // 4-note ascending major flourish
      expect(mockAudioCtx.createOscillator).toHaveBeenCalledTimes(4);
      expect(mockOsc.start).toHaveBeenCalledTimes(4);
    });

    it('synthesizes mechanical DGT clock ticks for normal and urgent Zeitnot', () => {
      const activeSynth = new WebAudioSynthesizer();

      // Normal tick
      activeSynth.playClockTick(false);
      expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(1100, 10.0);

      mockOsc.frequency.setValueAtTime.mockClear();

      // Urgent Zeitnot tick
      activeSynth.playClockTick(true);
      expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(1600, 10.0);
    });

    it('synthesizes tense cardiovascular heartbeat thump under critical Zeitnot', () => {
      const activeSynth = new WebAudioSynthesizer();
      activeSynth.playLowTimeWarning();

      // Dual heartbeat pulses (systole + diastole)
      expect(mockAudioCtx.createOscillator).toHaveBeenCalledTimes(2);
      expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(58, 10.0);
      expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(68, 10.12);
    });
  });

  describe('GlobalEventBus integration with minigame events', () => {
    it('emits and receives CLOCK_TICK event', () => {
      const spy = vi.fn();
      const unsub = GlobalEventBus.subscribe('CLOCK_TICK', spy);

      GlobalEventBus.emit('CLOCK_TICK', {
        playerId: 'P1',
        secondsLeft: 9,
        isUrgent: true,
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({
        playerId: 'P1',
        secondsLeft: 9,
        isUrgent: true,
      });

      unsub();
    });

    it('emits and receives CASTLE_TRIGGERED event', () => {
      const spy = vi.fn();
      const unsub = GlobalEventBus.subscribe('CASTLE_TRIGGERED', spy);

      GlobalEventBus.emit('CASTLE_TRIGGERED', {
        playerId: 'P1',
        isKingside: true,
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({
        playerId: 'P1',
        isKingside: true,
      });

      unsub();
    });

    it('emits and receives PROMOTION_TRIGGERED event', () => {
      const spy = vi.fn();
      const unsub = GlobalEventBus.subscribe('PROMOTION_TRIGGERED', spy);

      GlobalEventBus.emit('PROMOTION_TRIGGERED', {
        playerId: 'P2',
        toVariant: 'QUEEN',
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({
        playerId: 'P2',
        toVariant: 'QUEEN',
      });

      unsub();
    });
    it('emits and receives SPELL_CAST event', () => {
      const spy = vi.fn();
      const unsub = GlobalEventBus.subscribe('SPELL_CAST', spy);

      GlobalEventBus.emit('SPELL_CAST', {
        spellType: 'FREEZE',
        coordinate: asCoordinateKey('3,3'),
        playerId: 'P1',
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({
        spellType: 'FREEZE',
        coordinate: '3,3',
        playerId: 'P1',
      });

      unsub();
    });

    it('emits and receives DUCK_PLACED event', () => {
      const spy = vi.fn();
      const unsub = GlobalEventBus.subscribe('DUCK_PLACED', spy);

      GlobalEventBus.emit('DUCK_PLACED', {
        coordinate: asCoordinateKey('4,4'),
        playerId: 'P2',
      });

      expect(spy).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('emits and receives PIECE_DROPPED event', () => {
      const spy = vi.fn();
      const unsub = GlobalEventBus.subscribe('PIECE_DROPPED', spy);

      GlobalEventBus.emit('PIECE_DROPPED', {
        pieceVariant: 'KNIGHT',
        coordinate: asCoordinateKey('2,2'),
        playerId: 'P1',
      });

      expect(spy).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('emits and receives PUZZLE_ATTEMPT event', () => {
      const spy = vi.fn();
      const unsub = GlobalEventBus.subscribe('PUZZLE_ATTEMPT', spy);

      GlobalEventBus.emit('PUZZLE_ATTEMPT', {
        isCorrect: true,
        isCompleted: true,
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({
        isCorrect: true,
        isCompleted: true,
      });
      unsub();
    });
  });
});
