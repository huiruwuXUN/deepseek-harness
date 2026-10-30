/** `ask` namespace dictionaries (the composer ask chip's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'chip.label': '问答',
  'chip.on.aria': '问答模式已开启，按下关闭',
  'chip.on.title': '问答模式已开启 — 点击关闭（/ask off）',
  'chip.exitFailed': '退出问答模式失败',
} satisfies Record<string, string>

/** The ask namespace key union. */
export type AskKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'chip.label': 'Ask',
  'chip.on.aria': 'Ask mode on, press to turn off',
  'chip.on.title': 'Ask mode on — click to turn off (/ask off)',
  'chip.exitFailed': 'Failed to exit ask mode',
} satisfies Record<AskKey, string>

/** Japanese copy, checked against the English keys. */
export const ja = {
  'chip.label': '質問',
  'chip.on.aria': '質問モードはオンです。押すとオフになります',
  'chip.on.title': '質問モードはオンです — クリックでオフ (/ask off)',
  'chip.exitFailed': '質問モードを終了できませんでした',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'chip.label': 'Consultar',
  'chip.on.aria': 'Modo de consulta activado, presione para apagar',
  'chip.on.title': 'Modo de consulta activado: haga clic para desactivar (/ask off)',
  'chip.exitFailed': 'No se pudo salir del modo de consulta',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'chip.label': 'Question',
  'chip.on.aria': 'Mode question activé, appuyez pour désactiver',
  'chip.on.title': 'Mode question activé — cliquez pour désactiver (/ask off)',
  'chip.exitFailed': 'Échec de la sortie du mode question',
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'chip.label': 'Fragen',
  'chip.on.aria': 'Fragemodus ein, zum Ausschalten drücken',
  'chip.on.title': 'Fragemodus ein – zum Ausschalten klicken (/ask off)',
  'chip.exitFailed': 'Der Fragemodus konnte nicht beendet werden',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'chip.label': 'Вопросы',
  'chip.on.aria': 'Режим вопросов включен. Нажмите, чтобы выключить.',
  'chip.on.title': 'Режим вопросов включен — нажмите, чтобы выключить (/ask off)',
  'chip.exitFailed': 'Не удалось выйти из режима вопросов.',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'chip.label': 'Perguntar',
  'chip.on.aria': 'Modo de perguntas ativado, pressione para desligar',
  'chip.on.title': 'Modo de perguntas ativado – clique para desligar (/ask off)',
  'chip.exitFailed': 'Falha ao sair do modo de perguntas',
} satisfies Record<keyof typeof en, string>
