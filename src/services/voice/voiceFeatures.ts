/**
 * AI 语音能力运行时开关（内存态）
 *
 * 设置页修改后立即写入，WebRTC 音频链路开麦/重开麦时读取；
 * 应用启动时由 WebRTCClient.initialize 从后端配置同步一次。
 */

export type SttLanguage = 'zh' | 'en' | 'auto';

class VoiceFeatures {
  private noiseSuppression = false;
  private subtitles = false;
  private sttLanguage: SttLanguage = 'zh';

  setNoiseSuppression(v: boolean) {
    this.noiseSuppression = v;
  }

  setSubtitles(v: boolean) {
    this.subtitles = v;
  }

  setSttLanguage(lang: SttLanguage) {
    this.sttLanguage = lang;
  }

  isNoiseSuppressionEnabled(): boolean {
    return this.noiseSuppression;
  }

  isSubtitlesEnabled(): boolean {
    return this.subtitles;
  }

  getSttLanguage(): SttLanguage {
    return this.sttLanguage;
  }

  /** 从后端配置一次性同步（应用启动/进入大厅时调用） */
  applyConfig(config: {
    noiseSuppressionEnabled?: boolean;
    subtitlesEnabled?: boolean;
    sttLanguage?: SttLanguage;
  }) {
    if (typeof config.noiseSuppressionEnabled === 'boolean') {
      this.noiseSuppression = config.noiseSuppressionEnabled;
    }
    if (typeof config.subtitlesEnabled === 'boolean') {
      this.subtitles = config.subtitlesEnabled;
    }
    if (
      config.sttLanguage === 'zh' ||
      config.sttLanguage === 'en' ||
      config.sttLanguage === 'auto'
    ) {
      this.sttLanguage = config.sttLanguage;
    }
  }
}

export const voiceFeatures = new VoiceFeatures();
