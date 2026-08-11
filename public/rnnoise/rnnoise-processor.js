/**
 * RNNoise 降噪 AudioWorkletProcessor
 *
 * - 通过 AudioWorklet 的模块加载机制引入 @jitsi/rnnoise-wasm 的同步版
 *   （rnnoise-sync.js 把 wasm 内联为 base64，可在 AudioWorklet 全局同步初始化）
 * - 按 10ms 帧（480 样本 @48kHz）调用 rnnoise_process_frame，
 *   输出用 FIFO 缓冲以对齐 AudioWorklet 的 128 样本块
 * - 初始化失败时降级为直通（不丢音频）
 */
import createRNNWasmModuleSync from './rnnoise-sync.js';

class RnnoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 每帧样本数 = 采样率 / 100（10ms），48k=480，44.1k=441，32k=320
    this.frameSize = Math.round(sampleRate / 100);

    this.inBuf = new Float32Array(this.frameSize);
    this.inPos = 0;

    this.outBuf = new Float32Array(this.frameSize);
    this.outPos = 0;
    this.outLen = 0;

    // 帧长（480）与 AudioWorklet 块长（128）不是整数倍关系，
    // 若立即输出会出现周期性欠载（每 4 块缺 32 个采样）。这里延迟一帧多一点的
    // 输出（约 13ms，可忽略），使处理与消费相位对齐，避免丢音。
    this.delaySamples = this.frameSize + 128;
    this.produced = 0;

    this.rnnoise = null;
    this.state = 0;
    this.inPtr = 0;
    this.outPtr = 0;
    this.ready = false;

    try {
      this.rnnoise = createRNNWasmModuleSync();
      this.state = this.rnnoise._rnnoise_create(sampleRate);
      this.inPtr = this.rnnoise._malloc(this.frameSize * 4);
      this.outPtr = this.rnnoise._malloc(this.frameSize * 4);
      this.ready = this.state !== 0 && this.inPtr !== 0 && this.outPtr !== 0;
    } catch (e) {
      console.error('[rnnoise] 初始化失败，降级为直通', e);
      this.ready = false;
    }
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!input || !output) return true;

    const inLen = input.length;
    for (let i = 0; i < inLen; i++) {
      this.inBuf[this.inPos++] = input[i];
      if (this.inPos === this.frameSize) {
        this.inPos = 0;
        if (this.ready) {
          this.rnnoise.HEAPF32.set(this.inBuf, this.inPtr >> 2);
          this.rnnoise._rnnoise_process_frame(this.state, this.inPtr, this.outPtr);
          this.outBuf.set(
            new Float32Array(this.rnnoise.HEAPF32.buffer, this.outPtr, this.frameSize)
          );
        } else {
          this.outBuf.set(this.inBuf);
        }
        this.outPos = 0;
        this.outLen = this.frameSize;
        this.produced += this.frameSize;
      }
    }

    // 初始延迟阶段：输出静音，积累足够缓冲后再开始消费
    if (this.produced <= this.delaySamples) {
      output.fill(0);
      return true;
    }

    // 把处理好的帧按块输出（不足的部分补 0，避免缓冲错位）
    const n = Math.min(output.length, this.outLen);
    for (let i = 0; i < n; i++) {
      output[i] = this.outBuf[this.outPos + i];
    }
    this.outPos += n;
    this.outLen -= n;

    return true;
  }
}

registerProcessor('rnnoise-processor', RnnoiseProcessor);
