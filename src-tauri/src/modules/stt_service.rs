//! 实时字幕（流式语音识别）服务
//!
//! 基于 sherpa-onnx 的流式 zipformer transducer 模型（中文/英文），在独立线程中运行：
//! - 前端把「降噪后」的 PCM 帧通过 `stt_push_audio` 推入
//! - 识别线程用 mpsc 通道接收，解码后通过 Tauri event `stt-update` 推送增量/最终文本
//! - 模型首次启用时下载到 `appDataDir/models/stt/<lang>/`，之后本地复用，不再重复下载

use futures_util::StreamExt;
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig, OnlineStream};
use std::path::PathBuf;
use std::sync::mpsc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

/// 识别线程可处理的命令
enum SttCommand {
    /// 追加一段 PCM 音频（float32 单声道，sample_rate 为采集率，内部重采样到 16k）
    PushAudio { samples: Vec<f32>, sample_rate: i32 },
    /// 清空当前识别状态（例如字幕被关闭后残留的文本）
    Reset,
    /// 退出识别线程
    Stop,
}

/// 实时字幕服务（前端通过 Tauri command 调用）
pub struct SttService {
    tx: Mutex<Option<mpsc::SyncSender<SttCommand>>>,
}

impl Default for SttService {
    fn default() -> Self {
        Self::new()
    }
}

impl SttService {
    pub fn new() -> Self {
        Self { tx: Mutex::new(None) }
    }

    pub fn is_running(&self) -> bool {
        self.tx.try_lock().map(|g| g.is_some()).unwrap_or(false)
    }

    /// 启动（或重启）识别线程并加载指定语言的模型
    pub async fn start(&self, app: AppHandle, language: String) -> Result<(), String> {
        self.stop().await;
        let (tx, rx) = mpsc::sync_channel::<SttCommand>(256);
        *self.tx.lock().await = Some(tx);
        std::thread::spawn(move || worker_loop(app, rx, language));
        Ok(())
    }

    /// 停止识别线程
    pub async fn stop(&self) {
        let tx = self.tx.lock().await.take();
        if let Some(tx) = tx {
            let _ = tx.send(SttCommand::Stop);
        }
    }

    /// 推送一段音频；识别忙时丢弃最旧帧以保证实时性
    pub async fn push_audio(&self, samples: Vec<f32>, sample_rate: i32) -> Result<(), String> {
        let guard = self.tx.lock().await;
        let tx = guard.as_ref().ok_or_else(|| "实时字幕未启动".to_string())?;
        match tx.try_send(SttCommand::PushAudio { samples, sample_rate }) {
            Ok(()) => Ok(()),
            // 通道满：说明识别线程忙，丢弃该帧即可
            Err(mpsc::TrySendError::Full(_)) => Ok(()),
            Err(mpsc::TrySendError::Disconnected(_)) => Err("实时字幕线程已退出".to_string()),
        }
    }

    /// 清空识别状态
    pub async fn reset(&self) {
        let guard = self.tx.lock().await;
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(SttCommand::Reset);
        }
    }
}

// ==================== 模型定义与下载 ====================

/// 模型文件（下载后统一命名为固定文件名）
struct ModelFile {
    /// 下载时的原始文件名（HuggingFace 仓库内名称）
    remote: &'static str,
    /// 下载后保存为的本地文件名
    local: &'static str,
    /// 已知大小（字节），用于断点判断与进度显示
    size: u64,
}

/// 各语言对应的 HuggingFace 模型仓库与文件（官方 sherpa-onnx 模型，int8 量化版以减小体积）
fn model_spec(language: &str) -> (&'static str, Vec<ModelFile>) {
    match language {
        // 英文流式 zipformer（chunk-16-left-128，int8，约 73MB）
        "en" => (
            "csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26",
            vec![
                ModelFile { remote: "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx", local: "encoder.onnx", size: 71_083_163 },
                ModelFile { remote: "decoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx", local: "decoder.onnx", size: 1_307_236 },
                ModelFile { remote: "joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx", local: "joiner.onnx", size: 259_335 },
                ModelFile { remote: "tokens.txt", local: "tokens.txt", size: 5_048 },
            ],
        ),
        // 中文（zh）与自动（auto）共用中英双语流式 zipformer（int8，约 198MB）
        _ => (
            "csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20",
            vec![
                ModelFile { remote: "encoder-epoch-99-avg-1.int8.onnx", local: "encoder.onnx", size: 181_895_032 },
                ModelFile { remote: "decoder-epoch-99-avg-1.int8.onnx", local: "decoder.onnx", size: 13_091_040 },
                ModelFile { remote: "joiner-epoch-99-avg-1.int8.onnx", local: "joiner.onnx", size: 3_228_404 },
                ModelFile { remote: "tokens.txt", local: "tokens.txt", size: 56_317 },
            ],
        ),
    }
}

/// 模型下载目录：appDataDir/models/stt/<zh|en>（auto 与 zh 共用同一模型）
pub fn model_dir(app: &AppHandle, language: &str) -> Result<PathBuf, String> {
    let dir_key = if language == "en" { "en" } else { "zh" };
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?;
    Ok(data_dir.join("models").join("stt").join(dir_key))
}

/// 下载指定语言的模型（带进度事件 `stt-download-progress`）
pub async fn download_model(app: AppHandle, language: String) -> Result<(), String> {
    let (repo, files) = model_spec(&language);
    let dir = model_dir(&app, &language)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("创建模型目录失败: {e}"))?;

    let total: u64 = files.iter().map(|f| f.size).sum();
    let mut done: u64 = 0;
    let client = reqwest::Client::new();

    for file in &files {
        let dest = dir.join(file.local);
        // 已下载且大小一致则跳过
        if let Ok(meta) = tokio::fs::metadata(&dest).await {
            if meta.len() == file.size {
                done += file.size;
                continue;
            }
        }

        let url = format!(
            "https://huggingface.co/{repo}/resolve/main/{}",
            file.remote
        );
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("下载模型失败（{}）: {e}", file.remote))?;
        let total_len = response.content_length().unwrap_or(file.size);

        let mut stream = response.bytes_stream();
        let mut out = tokio::fs::File::create(&dest)
            .await
            .map_err(|e| format!("创建模型文件失败: {e}"))?;
        let mut received: u64 = 0;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("下载模型中断（{}）: {e}", file.remote))?;
            out.write_all(&chunk)
                .await
                .map_err(|e| format!("写入模型文件失败: {e}"))?;
            received += chunk.len() as u64;
            done += chunk.len() as u64;
            let percent = if total > 0 { (done * 100 / total).min(100) } else { 0 };
            let _ = app.emit(
                "stt-download-progress",
                serde_json::json!({
                    "language": language,
                    "file": file.remote,
                    "fileReceived": received,
                    "fileTotal": total_len,
                    "done": done,
                    "total": total,
                    "percent": percent,
                }),
            );
        }
        out.flush()
            .await
            .map_err(|e| format!("模型文件刷新失败: {e}"))?;
    }

    log::info!("实时字幕模型下载完成: lang={language}, dir={}", dir.display());
    let _ = app.emit(
        "stt-download-progress",
        serde_json::json!({
            "language": language,
            "done": total,
            "total": total,
            "percent": 100,
        }),
    );
    Ok(())
}

// ==================== 识别线程 ====================

fn emit_error(app: &AppHandle, message: String) {
    log::error!("实时字幕错误: {message}");
    let _ = app.emit(
        "stt-status",
        serde_json::json!({ "status": "error", "message": message }),
    );
}

fn emit_ready(app: &AppHandle) {
    let _ = app.emit(
        "stt-status",
        serde_json::json!({ "status": "ready" }),
    );
}

/// 加载识别器（模型文件必须已下载）
fn load_recognizer(app: &AppHandle, language: &str) -> Result<(OnlineRecognizer, OnlineStream), String> {
    let dir = model_dir(app, language)?;
    let encoder = dir.join("encoder.onnx");
    let decoder = dir.join("decoder.onnx");
    let joiner = dir.join("joiner.onnx");
    let tokens = dir.join("tokens.txt");

    for p in [&encoder, &decoder, &joiner, &tokens] {
        if !p.exists() {
            return Err(format!("缺少模型文件: {}", p.display()));
        }
    }

    let mut config = OnlineRecognizerConfig::default();
    config.model_config.transducer.encoder = Some(encoder.to_string_lossy().into_owned());
    config.model_config.transducer.decoder = Some(decoder.to_string_lossy().into_owned());
    config.model_config.transducer.joiner = Some(joiner.to_string_lossy().into_owned());
    config.model_config.tokens = Some(tokens.to_string_lossy().into_owned());
    config.model_config.model_type = Some("zipformer2".to_string());
    config.model_config.num_threads = 2;
    config.model_config.provider = Some("cpu".to_string());
    config.decoding_method = Some("greedy_search".to_string());
    // 端点检测：尾静音 2.4s / 1.2s，最短语句 300ms
    config.enable_endpoint = true;
    config.rule1_min_trailing_silence = 2.4;
    config.rule2_min_trailing_silence = 1.2;
    config.rule3_min_utterance_length = 300.0;

    let recognizer = OnlineRecognizer::create(&config).ok_or_else(|| "创建语音识别器失败".to_string())?;
    let stream = recognizer.create_stream();
    log::info!("实时字幕识别器加载成功: lang={language}");
    Ok((recognizer, stream))
}

/// 识别线程主循环：持有识别器与流，从通道接收命令并推送结果事件
fn worker_loop(app: AppHandle, rx: mpsc::Receiver<SttCommand>, initial_language: String) {
    let language = initial_language.clone();
    let mut recognizer: Option<OnlineRecognizer> = None;
    let mut stream: Option<OnlineStream> = None;

    match load_recognizer(&app, &language) {
        Ok((rec, st)) => {
            recognizer = Some(rec);
            stream = Some(st);
            emit_ready(&app);
        }
        Err(e) => emit_error(&app, e),
    }

    while let Ok(cmd) = rx.recv() {
        match cmd {
            SttCommand::PushAudio { samples, sample_rate } => {
                let (Some(rec), Some(st)) = (recognizer.as_ref(), stream.as_ref()) else {
                    continue;
                };
                st.accept_waveform(sample_rate, &samples);
                while rec.is_ready(st) {
                    rec.decode(st);
                }
                let Some(result) = rec.get_result(st) else { continue };
                if result.text.trim().is_empty() {
                    continue;
                }
                if rec.is_endpoint(st) {
                    let _ = app.emit(
                        "stt-update",
                        serde_json::json!({ "text": result.text, "isFinal": true }),
                    );
                    rec.reset(st);
                } else if !result.is_final {
                    let _ = app.emit(
                        "stt-update",
                        serde_json::json!({ "text": result.text, "isFinal": false }),
                    );
                }
            }
            SttCommand::Reset => {
                if let (Some(rec), Some(st)) = (recognizer.as_ref(), stream.as_ref()) {
                    rec.reset(st);
                }
            }
            SttCommand::Stop => break,
        }
    }

    // 线程退出时通知前端
    let _ = app.emit(
        "stt-status",
        serde_json::json!({ "status": "stopped" }),
    );
    log::info!("实时字幕识别线程已退出（lang={language}）");
}
