import React from 'react';
import ReactDOM from 'react-dom/client';
// antd v5 官方 React 19 兼容补丁：没有它时 antd 的静态 message / notification /
// Modal.confirm 会静默失败（react-dom v19 已移除旧 render API），提示完全不显示
import '@ant-design/v5-patch-for-react-19';
import App from './App';
import { initializeStore } from './stores';
import './i18n';

// 初始化应用 Store
initializeStore();

// 主题主色配置已移除，统一使用品牌绿；清理历史遗留的自定义主色，避免旧的橙色等残留
try {
  localStorage.removeItem('mctier_theme_primary');
  document.documentElement.style.removeProperty('--mctier-primary');
} catch { /* ignore */ }

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
