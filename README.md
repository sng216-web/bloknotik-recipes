# Блокнотик — публичный кулинарный сайт

Адаптивный контентный SEO-сайт на **Astro / TypeScript / Zod**, со статической генерацией. Главная, шесть категорий, шаблон рецепта, навигация, мобильное меню и поиск по опубликованным материалам. Публичный сайт отделён от внутренней AI-редакции.

**Реальных опубликованных рецептов сейчас нет.** На главной показан честный пустой каталог и отдельные демонстрации интерфейса. Демо имеют предупреждение и `noindex`, отсутствуют в поиске, RSS, sitemap и Recipe JSON-LD. Их ингредиенты и шаги тестовые и не предназначены для приготовления.

## Запуск

Node.js **24.x**, npm:

```bash
npm ci --ignore-scripts
npm run dev
```

Адрес по умолчанию: `http://localhost:4321/bloknotik-recipes/`. В агентских окружениях Astro может запускать сервер в фоне; `--ignore-lock` запускает одноразовый foreground-сервер, используемый браузерными тестами.

```bash
npm run check
npx playwright install --with-deps chromium
npm run test:browser
```

`check`: Astro/TypeScript, unit-тесты, сборка и проверка итоговых HTML, ссылок, XML, публичных индексов и размеров изображений. Browser-тесты проверяют desktop/mobile, доступность axe, навигацию, работу поиска и его защиту от HTML-инъекций. Синтетические утверждённые записи существуют только в тестовых временных каталогах/памяти.

Отдельно доступны `npm test`, `npm run typecheck`, `npm run build`, `npm run preview`, `npm run check:output`. Статический результат — `dist/`.

## Хостинг

Выбран GitHub Pages: сервер приложению не требуется. Исходная проверка выявила, что Pages **ещё не включён** (API 404), а default branch остаётся прежней проверочной веткой. Подготовлены `main` на исходном коммите и отдельная feature-ветка для PR. Фактическая публикация в рамках разработки не выполнялась.

Целевой URL по умолчанию: `https://sng216-web.github.io/bloknotik-recipes/`. Это **настроенная цель**, а не подтверждение действующего сайта. Владелец должен после review/merge выбрать `main` основной веткой и включить Settings → Pages → Source: GitHub Actions. Подробнее: [проверка и настройка хостинга](docs/hosting.md).

Для другого домена установите публичную переменную `SITE_URL`, например HTTPS-origin с завершающим `/`. Она задаёт canonical, Open Graph, RSS, sitemap и base path. Никаких ключей в этой переменной нет. При Pages workflow используется repository variable `SITE_URL` или значение по умолчанию; для локальной команды задайте env перед запуском. `env.example` служит примером, не загружается автоматически.

## Структура

```text
src/lib/recipe-schema.ts   единая строгая схема Recipe
src/lib/catalog.ts         валидация и выбор только опубликованного контента
src/lib/seo.ts             Recipe JSON-LD, RSS и sitemap
src/lib/import-content.ts  staging-импорт и валидация реальных изображений
src/content/recipes/       реальный контент, сейчас пустой
src/pages/                 страницы, RSS/XML/JSON и robots
src/components/            карточки, рецепт и пустое состояние
src/layouts/               SEO и общая навигация
src/styles/                адаптивный дизайн без внешних шрифтов
fixtures/recipes/          только явно отмеченные демо
public/images/             локальные широкоформатные WebP
content/incoming/          утверждённые импорты до публикации
content/imports/           idempotency ledger импорта
scripts/                   CLI импорта, подготовки выпуска и проверки сборки
tests/                     unit и browser-тесты
```

Каталоги `content/incoming` и `content/imports` создаются первым импортом. В них нет исходных реальных материалов.

## Контент и публикация

Полный контракт — [docs/content.md](docs/content.md). Обязательны slug, title, description, introduction, ingredients, steps, images, dates, category, status, revision, demo, sources и approval. Для approved/published требуется положительный QA той же revision. Любое изменение содержания требует новой revision и нового review.

Время, порции и калорийность необязательны и принимаются только с `confirmed: true`. Рейтинги и отзывы не моделируются. Schema.org Recipe создаётся только для опубликованных подтверждённых материалов; демо не получают никакой разметки Recipe.

RSS (`/rss.xml`) содержит только опубликованные статьи с постоянными абсолютными URL и действительными датами. Пока он пустой и валидный. Sitemap содержит настоящие страницы сайта и только реальные публикации; поиск использует отдельный статический индекс, исключающий демо, approved, draft, archived и будущие публикации. При подкаталоге Pages все пути, включая RSS, находятся внутри него.

## Безопасный импорт из будущего n8n

```bash
npm run content:import -- --file /path/to/approved-envelope.json
```

Importer принимает строгий ImportEnvelope с UUID importId и Recipe в статусе approved, проверяет QA, revision и реальные локальные изображения, сохраняет только staging. Он не скачивает URL, не выполняет входной текст как код, не публикует и не заменяет существующую страницу. Повторный importId допускается только для того же payload.

Для будущего n8n подготовлен GitHub Actions workflow `import-content.yml`. Он принимает официальное GitHub `repository_dispatch` событие, проверяет payload, прогоняет все проверки и открывает PR с staging-данными. Сами workflows n8n не создавались и не менялись. Credentials остаются в n8n и в краткоживущем GITHUB_TOKEN, не в этом репозитории. Формат, права и ограничения: [docs/import.md](docs/import.md).

После содержательного review редактор может отдельно подготовить реальный выпуск:

```bash
npm run content:publish -- --slug REAL_SLUG --published-at CONFIRMED_ISO_TIMESTAMP
```

Команда переносит утверждённую запись в каталог публикаций с подтверждённой датой; это изменение для PR, не деплой и не доказательство доступности страницы. Не запускайте её для демонстраций. После merge Pages workflow собирает и публикует сайт, если хостинг включён. Обновлять внешний статус редакции на «опубликовано» следует только после проверки фактического URL успешного деплоя.

## CI и документы

- `ci.yml`: полная проверка и browser-тесты на PR и main.
- `pages.yml`: проверка статической сборки и деплой только из main после merge, через pages/id-token права.
- `import-content.yml`: только staging и PR, без auto-merge.
- [Хостинг и исходное состояние](docs/hosting.md), [контент](docs/content.md), [импорт](docs/import.md), [изображения](docs/assets.md), [правила](AGENTS.md).
