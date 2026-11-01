import { toggleLang, useLang } from '../lib/i18n'

/** 一键切换中英文：中文时显示 EN，英文时显示「中文」 */
export function LangToggle({ inline = false }: { inline?: boolean }) {
  const lang = useLang()
  return (
    <button
      className={'lang-toggle' + (inline ? ' lang-toggle-inline' : '')}
      onClick={toggleLang}
      aria-label={lang === 'zh' ? 'Switch to English' : '切换成中文'}
    >
      <i>{lang === 'zh' ? 'EN' : '中文'}</i>
    </button>
  )
}
