package top.pmh13.mctier

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.net.VpnService
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import androidx.activity.result.contract.ActivityResultContracts
import com.easytier.jni.EasyTierJNI
import androidx.compose.runtime.remember
import top.pmh13.mctier.ui.MctierApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 开启 edge-to-edge：让 statusBars/navigationBars/ime 等 WindowInsets 只计一次，
        // 配合 adjustResize 修复聊天输入框被键盘顶得过高的问题
        WindowCompat.setDecorFitsSystemWindows(window, false)
        Log.i("MCTier", "EasyTier native available=${EasyTierJNI.available}, error=${EasyTierJNI.loadErrorMessage}")
        val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {}
        val vpnPermission = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode != Activity.RESULT_OK) {
                // 用户可以稍后再次点加入大厅触发系统授权流程。
            }
        }
        // 合规：仅在用户已同意隐私政策/用户协议后才申请权限并初始化需采集设备信息的能力。
        fun requestStartupPermissions() {
            runCatching { permissions.launch(arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS)) }
            runCatching { VpnService.prepare(this)?.let { vpnPermission.launch(it) } }
        }
        if (top.pmh13.mctier.ui.ConsentStore.isAgreed(applicationContext)) {
            requestStartupPermissions()
        }
        // 启动即应用已保存的主题（深/浅色 + 主色），避免冷启动闪烁
        run {
            val s = MctierRepository.get(applicationContext).state.value.settings
            top.pmh13.mctier.ui.applyAppTheme(s.themeMode, s.themePrimary)
            top.pmh13.mctier.ui.applyAppLanguage(s.language)
        }
        // 处理冷启动时的 deep link
        handleDeepLink(intent)
        setContent {
            val repository = remember { MctierRepository.get(applicationContext) }
            MctierApp(repository = repository, onConsentGranted = { requestStartupPermissions() })
        }
    }

    override fun onResume() {
        super.onResume()
        runCatching { MctierRepository.get(applicationContext).setAppForeground(true) }
    }

    override fun onPause() {
        super.onPause()
        // 进入后台(如切到游戏)：标记非前台，使消息弹幕即使在聊天室界面也能飘出
        runCatching { MctierRepository.get(applicationContext).setAppForeground(false) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    /** 解析 mctier://join?name=&pwd= 并预填加入表单（仅填表，不自动连接；非法参数安全忽略） */
    private fun handleDeepLink(intent: Intent?) {
        val data: Uri = intent?.data ?: return
        if (data.scheme != "mctier") return
        runCatching {
            // 从原始 query 自行解析并正确还原空格：
            // - 安卓端 URLEncoder 生成的链接把空格编成裸 '+'（真正的 '+' 会编成 %2B）；
            // - 桌面端 encodeURIComponent 生成的链接空格是 %20、'+' 是 %2B，绝不产生裸 '+'。
            // 因此查询串中任何裸 '+' 都代表空格，可对 name/pwd 统一把 '+'→%20 后再做标准 %XX 解码，
            // 既修复带空格大厅名被读成 "My+Lobby" 进错大厅，又不会破坏含 '+'(%2B) 的密码。
            val raw = data.encodedQuery.orEmpty()
            val params = raw.split("&").mapNotNull { part ->
                val idx = part.indexOf('=')
                if (idx <= 0) return@mapNotNull null
                part.substring(0, idx) to part.substring(idx + 1)
            }.toMap()
            val name = params["name"]?.let { Uri.decode(it.replace("+", "%20")) }.orEmpty()
            val pwd = params["pwd"]?.let { Uri.decode(it.replace("+", "%20")) }.orEmpty()
            if (name.isNotBlank()) {
                MctierRepository.get(applicationContext).applyDeepLink(name, pwd)
            }
        }
    }
}
