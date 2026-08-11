/**
 * AI 降噪服务
 * - 基于 RNNoise（WASM，@jitsi/rnnoise-wasm，模型内置于 public/rnnoise，无需下载）
 * - 对输入流做实时降噪，返回处理后的 MediaStream；失败时静默降级为原始流
 * - 音频只在本机处理，不上传任何数据
 */

const WORKLET_URL = '/rnnoise/rnnoise-processor.js';

class NoiseSuppressor {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;

  /**
   * 对原始麦克风流启用降噪，返回处理后的流。
   * 可重复调用（内部先释放旧图）。
   */
  async attach(input: MediaStream): Promise<MediaStream> {
    this.dispose();
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    try {
      const workletUrl = new URL(WORKLET_URL, window.location.href).href;
      await ctx.audioWorklet.addModule(workletUrl);
      this.source = ctx.createMediaStreamSource(input);
      this.node = new AudioWorkletNode(ctx, 'rnnoise-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.dest = ctx.createMediaStreamDestination();
      this.source.connect(this.node);
      this.node.connect(this.dest);
      await ctx.resume().catch(() => {
        /* 忽略 */
      });
      return this.dest.stream;
    } catch (e) {
      console.warn('AI 降噪初始化失败，使用原始音频', e);
      this.dispose();
      return input;
    }
  }

  /** 关闭降噪并释放资源 */
  dispose(): void {
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.node?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.dest?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.ctx) {
      try {
        void this.ctx.close();
      } catch {
        /* ignore */
      }
    }
    this.ctx = null;
    this.source = null;
    this.node = null;
    this.dest = null;
  }
}

export const noiseSuppressor = new NoiseSuppressor();
