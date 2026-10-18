# Хостинг и исходное состояние

## Проверенные факты до разработки

- Репозиторий `sng216-web/bloknotik-recipes` публичный, доступ к Git push есть.
- Единственная исходная ветка: `audit/github-access-20261017T171932Z`, SHA `33f94b4f60d5732fbbd367f2f62138b3ec2dc823`, пустое дерево.
- GitHub выбрал эту проверочную ветку основной при первом push. Файлов сайта, workflows и environments не было.
- API Pages: HTTP 404 `Not Found`; metadata `has_pages: false`, hostname/homepage не назначены. Pages пока не работает.
- API `actions/permissions`: HTTP 403 `Resource not accessible by integration`. Это ограничение чтения административных настроек текущим GitHub App, а не отказ push.
- Rulesets отсутствуют. При разработке существующие refs не перезаписывались и история не менялась.

Перед изменениями создана удалённая резервная ветка `backup/pre-site-20261017T234411Z` на исходном SHA. Рабочая ветка `feat/bloknotik-recipe-site`; `main` создана на том же исходном SHA для базы PR. Прежняя default branch не изменялась.

## Почему Astro и Pages

Astro генерирует HTML для контентных страниц, не отправляя клиенту приложение целиком. На клиенте выполняется только поиск; рецепты и навигация доступны без JavaScript. Нужны только статические файлы, что подходит для публичного SEO-сайта и GitHub Pages.

Pages не исполняет Node.js, PHP, webhook или базу данных. Поэтому импорт выполняется GitHub Actions и создаёт PR, а не POST endpoint сайта. Поиск — по сгенерированному JSON, без серверного индекса. При большом каталоге потребуется пересмотреть объём индекса.

## Действия владельца после review

1. Проверить и слить PR в `main`.
2. Settings → Branches / General → Default branch: назначить `main`. Это также нужно для repository_dispatch/workflow_dispatch, которые GitHub загружает с default branch.
3. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. Разрешить Actions для этого репозитория, если они запрещены политикой. Для контентного importer также включить возможность Actions создавать pull requests, если она выключена. Для CI write-права не нужны.
5. Запустить `Deploy static site to Pages` на main либо дождаться push в main. Дождаться успешного deployment и проверить главную, изображения, `/rss.xml`, `/sitemap.xml`, `/robots.txt` по фактическому URL.

Политики billing/Actions, Pages и PR automation могут ограничивать запуск; их состояние нельзя полностью вывести из недоступного API. При отказе workflow сохраняет точную ошибку; её надо проверить в Actions. Расширять права интеграции для чтения этих настроек не требуется для обычного Git push.

Целевой адрес по умолчанию: `https://sng216-web.github.io/bloknotik-recipes/`. До успешного deployment не считать его работающей публикацией.

## Собственный домен

Задайте repository variable `SITE_URL` как полный HTTPS URL с завершающим `/`; домен подключите в Pages и DNS отдельно. Корневой домен использует `/`, проектный Pages — `/bloknotik-recipes/`. База, canonical и все индексные адреса выводятся из одного значения. Не используйте localhost, тестовый домен или временный preview URL для production-сборки.

Для проверки другого base локально:

```bash
SITE_URL=https://example.org/ npm run build
SITE_URL=https://example.org/ npm run check:output
```

`SITE_URL` должен быть одинаков для build и check:output. После проверки верните стандартную сборку. Browser-тесты сейчас используют стандартный project-base URL; обычный CI проверяет его независимо от переменной Pages deployment.

Контент со временем публикации в будущем исключается при сборке. В статическом хостинге он не появится автоматически по часам; нужен новый build. Подготовка RSS не означает принятие фида Дзеном: актуальные правила площадки проверяются отдельно.
