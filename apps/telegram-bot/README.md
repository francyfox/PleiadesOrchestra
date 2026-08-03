# telegram-bot

Telegram-адаптер (транспорт) в гексагональной архитектуре — тонкий слой поверх `@repo/core`,
который делает весь LLM/память/скиллы harness.

### Стек
- Telegram Bot API framework — [GramIO](https://gramio.dev/) (long polling)
- Плагины GramIO — [Auto answer callback query](https://gramio.dev/plugins/official/auto-answer-callback-query), [Auto-retry](https://gramio.dev/plugins/official/auto-retry.html)

## Разработка

```bash
bun dev
```

## Переменные окружения

См. `.env.example`.
