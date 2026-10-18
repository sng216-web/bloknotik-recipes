# Безопасный импорт утверждённого контента

Сайт статический. Серверного webhook, endpoint `/api/publish`, токена в браузере или собственного внешнего API здесь нет. Будущий n8n может вызвать официальный GitHub REST `repository_dispatch`. Workflows n8n в этой задаче не создавались и не менялись.

## Envelope

`ImportEnvelopeSchema` находится в `src/lib/import-content.ts`:

```ts
{
  schemaVersion: '1';
  importId: string; // UUID, устойчивый при повторе той же операции
  recipe: Recipe;  // строгая общая схема, status approved, demo false
}
```

Recipe должен содержать полный QA той же revision, источники и существующие локальные изображения. Не передавайте секреты, персональные данные reviewer или временные подписанные URL. Reviewer — неперсональный редакционный/service ID. Схема Notion и mapping внутреннего контракта редакции на этот Recipe согласуются отдельно; импортёр не пытается угадать свойства Notion.

QA содержит обязательный contentDigest, соответствующий материалу. Изменения после QA отклоняются; importer не пересчитывает hash, чтобы автоматически утвердить вход. Подробности hash-контракта — в content.md. Известные demo fixtures блокируются независимо от заявленного статуса.

Импорт не принимает published, draft, demo и неопределённые поля. Вход ограничен 512 KiB (у GitHub собственные более строгие ограничения dispatch, которые тоже надо соблюдать). HTTPS-ссылки остаются данными; importer их не загружает. Имена файлов определяются валидированным slug, filesystem symlinks и выход за корень репозитория отклоняются. Изображения должны быть заранее добавлены и проверены в public/images: разрешённый формат, landscape и реальные размеры, до 10 MiB и 40 миллионов пикселей.

## Локальная проверка

```bash
npm run content:import -- --file /absolute/path/to/approved-envelope.json
```

Результат записывается только в `content/incoming/<slug>.json`, а SHA-256 принятого payload — в `content/imports/<importId>.json`. Тот же importId с другим содержимым вызывает конфликт. Повторы проверяют сохранённую staging-запись; устаревшие revision и переназначение постоянного slug/ID отклоняются. Запись выполняется через временный файл и atomic rename. Внешнего постоянного журнала вне Git нет; до merge ветка PR является свидетельством принятого импорта.

Существующая опубликованная версия не заменяется и не скрывается. В первой поставке нет real envelope: единственные примеры рецептов — явно помеченные демо; их импорт намеренно отклоняется. Unit-тесты создают утверждённые синтетические объекты только в памяти и временной папке.

## Вызов из будущего n8n

Официальный endpoint GitHub:

```text
POST https://api.github.com/repos/sng216-web/bloknotik-recipes/dispatches
Accept: application/vnd.github+json
Authorization: Bearer <credential из n8n credential store>
Content-Type: application/json
```

Тело: объект с `event_type: "bloknotik-content-approved"` и `client_payload`, содержащим ImportEnvelope выше. Это реальный endpoint GitHub, а не API статического сайта. [Документация repository_dispatch](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event).

Нужен scoped GitHub credential с доступом только к этому репозиторию и `Contents: write` для dispatch; выдайте минимальные права согласно выбранному типу GitHub App/PAT и официальной документации. Не храните этот credential в source, payload, env.example или workflow n8n в публичном Git. Наличие approvals в JSON не криптографически доказывает редакционную проверку; отправитель с GitHub-доступом должен быть доверенным.

Workflow `Stage approved editorial content` берёт **код main**, читает событие из GITHUB_EVENT_PATH, валидирует данные, запускает проверки и browser-тесты. Входной JSON никогда не подставляется в shell. Git/gh вызываются с массивами аргументов, без shell-интерпретации текста материала.

После проверок создаётся ветка `content/import-<UUID>` и PR со staging-данными. Один concurrency group сериализует job; повтор того же importId сверяет digest существующей remote-ветки и не создаёт дубликат PR. Конфликт payload отклоняется, force push и auto-merge отсутствуют. Если PR закрыт, его повторное открытие — отдельное редакционное действие.

Если push успел пройти, а создание PR завершилось ошибкой API, повторный запуск создаст недостающий PR на той же проверенной ветке. Открытый PR повторно не создаётся, merged PR остаётся завершённым, закрытый без merge требует явного решения редактора.

## Ограничения GitHub

- Сначала workflow должен попасть в default branch. Владелец должен назначить main основной после review сайта.
- Actions должны быть разрешены; для auto-PR может потребоваться Settings → Actions → General → Allow GitHub Actions to create and approve pull requests. Importer использует краткоживущий GITHUB_TOKEN с contents/pull-requests write.
- PR от GITHUB_TOKEN не запускает новые workflows автоматически. Поэтому сам import job до создания PR выполняет полную проверку и браузерные тесты. Если нужны отдельные required checks на PR, запустите Site checks вручную на его ветке либо согласуйте отдельный GitHub App credential. Этот workflow не добавляет постоянные секреты.
- Если создание PR запрещено, push ветки остаётся доступным по логам; владелец может открыть PR вручную. Не считать такой запуск публикацией.
- Повторный dispatch должен сохранять importId. Для нового содержания или исправления использовать новый importId и увеличенную revision.

## Выпуск

После review staging применяется отдельная команда `content:publish` с подтверждённой датой. Она подготавливает изменение source для PR и не выполняет merge, деплой, обновление Notion или фиксацию статуса в n8n. Успех импорта не равен успеху публикации. Будущий внешний workflow должен дождаться успешного deployment и проверить публичный canonical URL прежде, чем сообщать об опубликованном материале.

## Контракт 2.0.0

Обе точки импорта также принимают SiteHandoff v2. Общая функция normalizeEditorialImport проверяет исходный QA/digest,
преобразует данные в существующий ImportEnvelope и сохраняет полный безопасный payload в recipe.editorial.
Обязательны обложка 16:9 и отдельный clean. См. [контракт и структуру хранения](data-contract.md).

Никаких новых n8n workflows или автоматических release операций эта поддержка не создаёт.
