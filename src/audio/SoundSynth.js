/**
 * 程序化音效合成器 (SoundSynth)
 * 纯 Web Audio API 算法声学生成，零外部音频资源依赖
 */
export class SoundSynth {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.oceanGain = null;
    this.sprayGain = null;
    this.isInitialized = false;

    // 点击页面任意位置解锁音频上下文
    const unlock = () => {
      this.init();
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.initOceanAmbient();
      this.initWaterSpray();
      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio API 初始化失败:', e);
    }
  }

  /**
   * 生成白噪声缓冲区
   */
  _createNoiseBuffer(seconds = 5) {
    const bufferSize = this.ctx.sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * 海洋环境涛声合成器 (白噪声 + 低通滤波 + 缓变 LFO 调制)
   */
  initOceanAmbient() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(6);
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(380, this.ctx.currentTime);

    // LFO 模拟海浪起伏潮汐周期
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.18, this.ctx.currentTime); // 约 5.5 秒一次浪头

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(160, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    this.oceanGain = this.ctx.createGain();
    this.oceanGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(this.oceanGain);
    this.oceanGain.connect(this.ctx.destination);

    noise.start();
    lfo.start();
  }

  /**
   * 滑板/船体划水浪花声合成器
   */
  initWaterSpray() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(4);
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.8, this.ctx.currentTime);

    this.sprayGain = this.ctx.createGain();
    this.sprayGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(this.sprayGain);
    this.sprayGain.connect(this.ctx.destination);

    noise.start();
  }

  /**
   * 载具召唤/切换和弦清音
   */
  playChime(isShip = true) {
    if (!this.ctx) return;
    const baseFreq = isShip ? 261.63 : 440.0; // C4 或 A4
    const notes = isShip ? [baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 2] : [baseFreq, baseFreq * 1.5, baseFreq * 2.2];

    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = isShip ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + i * 0.08);

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + i * 0.08 + 1.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime + i * 0.08);
      osc.stop(this.ctx.currentTime + i * 0.08 + 1.2);
    });
  }

  /**
   * 每帧根据航速更新喷溅浪花音量
   */
  update(speed, onWater) {
    if (!this.sprayGain || !this.ctx) return;
    const targetVolume = onWater ? Math.min(speed / 25.0, 0.45) : 0.0;
    this.sprayGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.1);
  }
}
