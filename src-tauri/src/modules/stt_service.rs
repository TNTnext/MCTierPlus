//! 实时字幕（流式语音识别）服务
//!
//! 基于 sherpa-onnx 的流式 zipformer transducer 模型（中文/英文），在独立线程中运行：
//! - 前端把「降噪后」的 PCM 帧通过 `stt_push_audio` 推入
//! - 识别线程用 mpsc 通道接收，解码后通过 Tauri event `stt-update` 推送增量/最终文本
//! - 模型首次启用时下载到 `appDataDir/models/stt/<lang>/`，之后本地复用，不再重复下载

use futures_util::StreamExt;
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig, OnlineStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
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
    /// 模型下载取消标记
    cancel_download: Arc<AtomicBool>,
    /// 是否正在下载模型（防止并发下载）
    downloading: Arc<AtomicBool>,
}

impl Default for SttService {
    fn default() -> Self {
        Self::new()
    }
}

impl SttService {
    pub fn new() -> Self {
        Self {
            tx: Mutex::new(None),
            cancel_download: Arc::new(AtomicBool::new(false)),
            downloading: Arc::new(AtomicBool::new(false)),
        }
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

    /// 请求取消当前模型下载
    pub fn cancel_download(&self) {
        self.cancel_download.store(true, Ordering::SeqCst);
    }

    /// 清除取消标记（开始一次新下载前调用）
    pub fn reset_cancel(&self) {
        self.cancel_download.store(false, Ordering::SeqCst);
    }

    /// 尝试开始一次下载（返回 false 表示已有下载在进行）
    pub fn try_begin_download(&self) -> bool {
        !self.downloading.swap(true, Ordering::SeqCst)
    }

    /// 下载结束（成功/失败/取消均需调用）
    pub fn end_download(&self) {
        self.downloading.store(false, Ordering::SeqCst);
    }

    /// 获取取消标记（供下载任务在循环中检查）
    pub fn cancel_handle(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.cancel_download)
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

/// 各语言对应的 HuggingFace 模型仓库、模型类型与文件（官方 sherpa-onnx 模型，int8 量化版以减小体积）
/// 返回 (仓库, 模型类型, 文件列表)
fn model_spec(language: &str) -> (&'static str, &'static str, Vec<ModelFile>) {
    match language {
        // 英文流式 zipformer 20M（int8，约 44MB；体积小、下载快）
        "en" => (
            "csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17",
            "zipformer",
            vec![
                ModelFile { remote: "encoder-epoch-99-avg-1.int8.onnx", local: "encoder.onnx", size: 42_845_182 },
                ModelFile { remote: "decoder-epoch-99-avg-1.int8.onnx", local: "decoder.onnx", size: 539_499 },
                ModelFile { remote: "joiner-epoch-99-avg-1.int8.onnx", local: "joiner.onnx", size: 259_572 },
                ModelFile { remote: "tokens.txt", local: "tokens.txt", size: 5_048 },
            ],
        ),
        // 中文（zh）与自动（auto）共用中文流式 zipformer 14M（int8，约 25MB；体积小、下载快）
        _ => (
            "csukuangfj/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23",
            "zipformer",
            vec![
                ModelFile { remote: "encoder-epoch-99-avg-1.int8.onnx", local: "encoder.onnx", size: 21_621_684 },
                ModelFile { remote: "decoder-epoch-99-avg-1.int8.onnx", local: "decoder.onnx", size: 1_888_682 },
                ModelFile { remote: "joiner-epoch-99-avg-1.int8.onnx", local: "joiner.onnx", size: 1_795_562 },
                ModelFile { remote: "tokens.txt", local: "tokens.txt", size: 48_697 },
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

/// 判断指定语言的模型是否齐全且完整（文件存在且大小与预期一致）。
/// 防止下载中断留下的“半截文件”被误判为已下载，从而用损坏模型启动识别导致崩溃。
pub fn model_complete(app: &AppHandle, language: &str) -> bool {
    let Ok(dir) = model_dir(app, language) else {
        return false;
    };
    let (_, _, files) = model_spec(language);
    files.iter().all(|f| {
        std::fs::metadata(dir.join(f.local))
            .map(|meta| meta.len() == f.size)
            .unwrap_or(false)
    })
}

/// 下载源列表（按顺序尝试，成功后记住可用源，避免重复失败）
const STT_MIRRORS: &[&str] = &[
    "https://huggingface.co",
    "https://hf-mirror.com",
];

/// 下载单个模型文件；成功返回 Ok(true)，被取消返回 Ok(false)，失败返回 Err(原因)。
/// 任何失败/取消都会删除已写入的半截文件，避免残留损坏文件。
async fn download_one(
    client: &reqwest::Client,
    base: &str,
    repo: &str,
    file: &ModelFile,
    dest: &PathBuf,
    cancel: &AtomicBool,
    app: &AppHandle,
    language: &str,
    done: &mut u64,
    total: u64,
) -> Result<bool, String> {
    let url = format!("{base}/{repo}/resolve/main/{}", file.remote);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("连接失败: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("HTTP 状态 {}", response.status()));
    }

    let total_len = response.content_length().unwrap_or(file.size);
    let mut stream = response.bytes_stream();

    // 下载主体；出错时 out 会随闭包退出而关闭，随后由调用方删除半截文件
    let result: Result<(), String> = async {
        let mut out = tokio::fs::File::create(dest)
            .await
            .map_err(|e| format!("创建模型文件失败: {e}"))?;
        let mut received: u64 = 0;

        loop {
            // 每块 120 秒无数据视为超时，避免网络卡死时界面永远转圈
            let chunk = tokio::time::timeout(std::time::Duration::from_secs(120), stream.next())
                .await
                .map_err(|_| "下载超时（120 秒无数据），请检查网络后重试".to_string())?
                .transpose()
                .map_err(|e| format!("传输中断: {e}"))?;
            let Some(chunk) = chunk else { break };

            if cancel.load(Ordering::SeqCst) {
                return Err("已取消".to_string());
            }

            out.write_all(&chunk)
                .await
                .map_err(|e| format!("写入模型文件失败: {e}"))?;
            received += chunk.len() as u64;
            *done += chunk.len() as u64;
            let percent = if total > 0 { (*done * 100 / total).min(100) } else { 0 };
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
        if received != file.size {
            return Err(format!(
                "文件大小不符：预期 {} 字节，实际 {} 字节",
                file.size, received
            ));
        }
        Ok(())
    }
    .await;

    match result {
        Ok(()) => Ok(true),
        Err(e) => {
            // 无论超时/断流/取消，都清掉半截文件，避免下次被误判为已下载
            let _ = tokio::fs::remove_file(dest).await;
            if cancel.load(Ordering::SeqCst) {
                Ok(false)
            } else {
                Err(e)
            }
        }
    }
}

/// 下载指定语言的模型（带进度事件 `stt-download-progress` 与取消支持）
pub async fn download_model_impl(
    app: &AppHandle,
    language: &str,
    cancel: Arc<AtomicBool>,
) -> Result<serde_json::Value, String> {
    let (repo, _, files) = model_spec(language);
    let dir = model_dir(app, language)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("创建模型目录失败: {e}"))?;

    let total: u64 = files.iter().map(|f| f.size).sum();
    let mut done: u64 = 0;
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .user_agent("MCTier/2.5.0")
        .build()
        .map_err(|e| format!("初始化下载客户端失败: {e}"))?;

    // 支持通过环境变量 MCTIER_STT_MIRROR 覆盖下载源（逗号分隔，便于换镜像）
    let mirrors: Vec<String> = std::env::var("MCTIER_STT_MIRROR")
        .ok()
        .map(|m| {
            m.split(',')
                .map(|s| s.trim().trim_end_matches('/').to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
        })
        .filter(|v: &Vec<String>| !v.is_empty())
        .unwrap_or_else(|| STT_MIRRORS.iter().map(|s| s.to_string()).collect());

    // 记住最近成功的下载源，后续文件优先使用
    let mut working: Option<usize> = None;

    for file in &files {
        if cancel.load(Ordering::SeqCst) {
            return Ok(serde_json::json!({ "cancelled": true }));
        }
        let dest = dir.join(file.local);
        // 已下载且大小一致则跳过
        if let Ok(meta) = tokio::fs::metadata(&dest).await {
            if meta.len() == file.size {
                done += file.size;
                continue;
            }
        }

        // 依次尝试各下载源；同一文件内失败则换源重试
        let mut last_err = String::new();
        let mut ok = false;
        let mut order: Vec<usize> = Vec::new();
        if let Some(w) = working {
            order.push(w);
        }
        for i in 0..mirrors.len() {
            if !order.contains(&i) {
                order.push(i);
            }
        }

        // 本文件开始前的累计进度；换源重试时回退，避免进度虚高
        let done_before_file = done;
        for i in order {
            done = done_before_file;
            match download_one(
                &client,
                &mirrors[i],
                repo,
                file,
                &dest,
                &cancel,
                app,
                language,
                &mut done,
                total,
            )
            .await
            {
                Ok(true) => {
                    working = Some(i);
                    ok = true;
                    break;
                }
                Ok(false) => return Ok(serde_json::json!({ "cancelled": true })),
                Err(e) => {
                    last_err = format!("{e}（来源：{}）", mirrors[i]);
                }
            }
        }

        if !ok {
            return Err(format!("下载模型文件 {} 失败：{}", file.remote, last_err));
        }
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
    Ok(serde_json::json!({ "cancelled": false }))
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
    let (_, model_type, _) = model_spec(language);

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
    config.model_config.model_type = Some(model_type.to_string());
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
