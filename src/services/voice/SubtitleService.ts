/**
 * 实时字幕服务（前端侧）
 * - 从「降噪后」的音频流取 PCM 帧，通过 Tauri command 推给 Rust 侧流式识别
 * - 监听 Rust 推送的 `stt-update` 事件，写入全局 store 供大厅字幕条显示
 * - v1 只转自己开麦说的话，不写入聊天记录
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

class SubtitleService {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private unlisten: UnlistenFn | null = null;
  private active = false;

  /** 从指定音频流开始取帧并推送识别 */
  async start(stream: MediaStream): Promise<void> {
    this.stop();

    this.unlisten = await listen<{ text: string; isFinal: boolean }>('stt-update', (event) => {
      const { text, isFinal } = event.payload || {};
      if (typeof text !== 'string') return;
      import('../../stores').then(({ useAppStore }) => {
        if (isFinal) {
          useAppStore.getState().setSubtitleFinal(text.trim());
          useAppStore.getState().setSubtitlePartial('');
        } else {
          useAppStore.getState().setSubtitlePartial(text.trim());
        }
      });
    });

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    this.source = ctx.createMediaStreamSource(stream);
    this.processor = ctx.createScriptProcessor(2048, 1, 1);
    // 输出接一个不播放的 MediaStreamDestination，避免 ScriptProcessor 被优化掉
    this.dest = ctx.createMediaStreamDestination();
    this.processor.onaudioprocess = (e) => {
      const samples = e.inputBuffer.getChannelData(0);
      const sampleRate = ctx.sampleRate;
      void invoke('stt_push_audio', {
        // 显式转成普通数组，保证跨 IPC 序列化为 JSON 数组
        samples: Array.from(samples),
        sampleRate,
      }).catch(() => {
        /* 识别未启动等错误静默处理 */
      });
    };
    this.source.connect(this.processor);
    this.processor.connect(this.dest);
    await ctx.resume().catch(() => {
      /* 忽略 */
    });
    this.active = true;

    import('../../stores').then(({ useAppStore }) => {
      useAppStore.getState().setSubtitlesVisible(true);
    });
  }

  stop(): void {
    this.active = false;
    try {
      this.processor?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.source?.disconnect();
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
    this.processor = null;
    this.dest = null;
    if (this.unlisten) {
      try {
        this.unlisten();
      } catch {
        /* ignore */
      }
      this.unlisten = null;
    }
    import('../../stores').then(({ useAppStore }) => {
      useAppStore.getState().setSubtitlesVisible(false);
    });
  }

  isActive(): boolean {
    return this.active;
  }
}

export const subtitleService = new SubtitleService();
