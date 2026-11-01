import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { scheduleBackup, startAutoBackup } from './lib/cloudBackup'
import { onChange } from './lib/touch'

// 请浏览器把这份数据当「长期保留」，不要因为一阵子没用就清掉。
// iPhone 上不一定答应，答应了更保险；没答应也不影响使用。
navigator.storage?.persist?.().catch(() => {})

// 记完一笔 → 数据库按信号灯 → 几秒后自动传一份到云端（没开云备份就什么也不做）
onChange(scheduleBackup)
startAutoBackup()

// 离线缓存只在打包后的版本里开；开发时的热更新不能被它缓存住
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
