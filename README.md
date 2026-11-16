# Trello-lite

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Vue](https://img.shields.io/badge/Vue-3-42B883?logo=vue.js&logoColor=white)](https://vuejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)

Fullstack-канбан: доски, колонки и карточки с drag&drop, ролями доступа и синхронизацией между открытыми вкладками в реальном времени.

Проект собран как pnpm-монорепо: NestJS + Prisma на бэкенде, Vue 3 + Pinia на фронтенде и общий пакет с Zod-схемами и контрактами API — одна и та же валидация и типы используются на обеих сторонах.

## Возможности

- **Auth**: регистрация и вход, access + refresh JWT, ротация refresh-токенов, reuse detection, «тихое» восстановление сессии, защищённый роутинг.
- **Доски**: CRUD, три колонки по умолчанию, роли `owner` / `editor` / `viewer`.
- **Колонки**: создание, переименование и удаление, `Decimal`-позиции для вставки без переписывания.
- **Карточки**: CRUD, drag&drop, транзакционное перемещение с optimistic locking по `version` и откатом при `409`.
- **Realtime**: Socket.IO с JWT в handshake, комнаты по доске, presence без дублей по вкладкам, события колонок, карточек и участников.
- **Шаринг**: ссылка с ролью `editor` или `viewer`, идемпотентное присоединение, owner-only управление ссылкой.
- **Участники**: список, смена роли, удаление и выход из доски; права применяются мгновенно, удалённый выходит из WS-комнаты.
- **Общие контракты**: Zod-схемы, DTO и имена WS-событий в `packages/shared`.

## Стек

| Слой      | Технологии                                                |
| --------- | --------------------------------------------------------- |
| Монорепо  | pnpm workspaces, TypeScript                               |
| API       | NestJS 11, Fastify adapter, Prisma 6                      |
| БД        | PostgreSQL 16                                             |
| Auth      | Argon2id, JWT access + refresh, HttpOnly cookie, rotation |
| Валидация | Zod (схемы общие для API и web)                           |
| Реалтайм  | Socket.IO 4, комнаты по доске, presence                   |
| Тесты     | Vitest + Supertest (интеграционные, на реальной БД)        |
| Web       | Vue 3, Vite, Pinia, Vue Router, vee-validate + Zod        |
| Стили     | Tailwind CSS 4                                            |

## Инженерные решения

- **Транзакционный `/move`.** Перемещение карточки блокирует строку доски и карточки целевой колонки (`SELECT … FOR UPDATE`), сверяет `expectedVersion` и проверяет, что переданные соседи действительно стоят рядом. Конфликт возвращается как `409`, клиент перечитывает доску. Позиции — `Decimal(20,6)`, вставка между карточками не переписывает колонку. Отдельный тест двигает 50 карточек параллельно и проверяет уникальность позиций.
- **Оптимистичный UI.** После drag&drop клиент сразу переставляет карточку, отправляет `/move` с `expectedVersion` и откатывает состояние при `409`. Источник истины — WS-событие после коммита, а не HTTP-ответ.
- **Безопасные сессии.** Access-токен живёт 15 минут и хранится только в памяти Pinia. Refresh-токен — в `HttpOnly` cookie; в БД лежит лишь его SHA-256-хеш и `jti`. Каждый refresh атомарно отзывает предыдущий токен, повторное использование отзывает все сессии пользователя.
- **Авторизованный realtime.** Gateway проверяет JWT в `handshake.auth.token`, а `board.subscribe` — членство в доске. Чужую доску подписать нельзя. Смена роли и удаление участника рассылаются в комнату, удалённый немедленно выводится из неё, даже если его access-токен ещё действует.
- **Единые контракты.** Схемы регистрации, логина, досок, карточек и участников описаны в `packages/shared` и используются и в NestJS, и в формах Vue. Имена WS-событий и payload-типы тоже общие — рассинхрон ловится на `typecheck`.

## Структура

```text
.
├─ apps/
│  ├─ api/              # NestJS + Prisma (порт 3001)
│  │  ├─ src/
│  │  └─ test/          # интеграционные тесты на Vitest + Supertest
│  └─ web/              # Vue 3 + Vite (порт 5173)
├─ packages/
│  └─ shared/           # Zod-схемы, DTO, константы WS-событий
├─ docker-compose.yml   # PostgreSQL 16 для локальной разработки
└─ pnpm-workspace.yaml
```

## Быстрый старт

Требования: Node.js 20+, pnpm 9+, PostgreSQL 16 (или Docker).

```bash
# 1. Зависимости
pnpm install

# 2. База данных: локальный контейнер или свой PostgreSQL 16
docker compose up -d

# 3. Переменные окружения API
cp apps/api/.env.example apps/api/.env
# отредактируйте DATABASE_URL и JWT-секреты

# 4. Миграции
pnpm db:migrate

# 5. API + web
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3001/api
- Проверка БД: http://localhost:3001/api/health

Если `pnpm` не установлен: `corepack enable` или `npm i -g pnpm`.

Если API и web запускаются на разных origin, укажите `VITE_API_URL` в `apps/web/.env` и добавьте origin фронтенда в `CORS_ORIGIN`. Для cross-site cookie потребуется `COOKIE_SAME_SITE=none` и `COOKIE_SECURE=true` (HTTPS).

<details>
<summary>PostgreSQL на Windows, разработка в WSL</summary>

В WSL `localhost` указывает на саму WSL, а не на Windows. Если PostgreSQL запущен на Windows:

1. В `DATABASE_URL` укажите IP Windows-хоста — шлюз WSL по умолчанию:
   `ip route show default | awk '{print $3}'` (например, `172.23.48.1`).
2. Разрешите входящие подключения к порту `5432` в брандмауэре Windows.
3. Добавьте подсеть WSL в `pg_hba.conf`, например `host all all 172.16.0.0/12 scram-sha-256`, и перезагрузите конфиг (`SELECT pg_reload_conf();`).

После перезапуска WSL IP шлюза может измениться — обновите `DATABASE_URL`.

</details>

### Переменные API

| Переменная                 | Назначение                         | По умолчанию            |
| -------------------------- | ---------------------------------- | ----------------------- |
| `DATABASE_URL`             | Строка подключения PostgreSQL      | —                       |
| `PORT`                     | Порт API                           | `3001`                  |
| `CORS_ORIGIN`              | Разрешённые origin через запятую   | `http://localhost:5173` |
| `JWT_ACCESS_SECRET`        | Секрет access-токена, 32+ символа  | —                       |
| `JWT_REFRESH_SECRET`       | Секрет refresh-токена, 32+ символа | —                       |
| `ACCESS_TOKEN_TTL_MINUTES` | Время жизни access-токена          | `15`                    |
| `REFRESH_TOKEN_TTL_DAYS`   | Время жизни refresh-сессии         | `30`                    |
| `COOKIE_SECURE`            | Отправлять cookie только по HTTPS  | `false`                 |
| `COOKIE_SAME_SITE`         | `lax`, `strict` или `none`         | `lax`                   |
| `RATE_LIMIT_MAX`           | Запросов в минуту с одного IP      | `120`                   |

## Тесты

```bash
pnpm test        # все интеграционные тесты API
```

Тесты идут на реальной PostgreSQL из `apps/api/.env`, создают собственные данные и удаляют их после себя. Запуск файлов последовательный, чтобы не пересекаться по БД.

| Файл                                | Что проверяет                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `test/cards-move.e2e-spec.ts`       | CRUD карточек, версии и `409`, позиции на краях и в середине, 50 параллельных перемещений, права viewer |
| `test/board-members.e2e-spec.ts`    | список участников, смена роли с мгновенным эффектом, удаление и выход, возврат по share-ссылке    |
| `test/realtime.e2e-spec.ts`         | отказ без токена и с поддельным JWT, подписка на чужую доску, presence без дублей, доставка и отписка, member-события и вывод из комнаты |

## API

Префикс — `/api`. Ошибки: `{ statusCode, message, fieldErrors? }`.

### Auth

| Метод  | Путь             | Доступ         | Описание                                         |
| ------ | ---------------- | -------------- | ------------------------------------------------ |
| `POST` | `/auth/register` | public         | Создать аккаунт и сессию                         |
| `POST` | `/auth/login`    | public         | Войти                                            |
| `POST` | `/auth/refresh`  | refresh cookie | Ротировать refresh-токен и получить новый access |
| `POST` | `/auth/logout`   | refresh cookie | Отозвать текущую refresh-сессию                  |
| `GET`  | `/auth/me`       | Bearer access  | Текущий пользователь                             |

<details>
<summary>Пример запроса и ответа</summary>

```bash
curl -i -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Анна","email":"anna@example.com","password":"password123"}'

curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "9f1c…",
    "email": "anna@example.com",
    "name": "Анна",
    "createdAt": "2026-11-13T10:00:00.000Z"
  }
}
```

</details>

### Доски, колонки и участники

| Метод    | Путь                          | Доступ    | Описание                               |
| -------- | ----------------------------- | --------- | -------------------------------------- |
| `GET`    | `/boards`                     | участник  | Доски пользователя с числом колонок    |
| `POST`   | `/boards`                     | user      | Создать доску (3 колонки по умолчанию) |
| `GET`    | `/boards/:id`                 | участник  | Доска с колонками                      |
| `GET`    | `/boards/:id/share`           | owner     | Текущая share-ссылка или `null`        |
| `POST`   | `/boards/:id/share`           | owner     | Создать/обновить share-ссылку          |
| `GET`    | `/boards/:id/members`         | участник  | Список участников с ролями             |
| `PATCH`  | `/boards/:id/members/:userId` | owner     | Сменить роль участника                 |
| `DELETE` | `/boards/:id/members/:userId` | owner/self | Удалить участника или покинуть доску   |
| `POST`   | `/boards/join`                | user      | Присоединиться по `{ shareToken }`     |
| `PATCH`  | `/boards/:id`                 | editor    | Переименовать доску                    |
| `DELETE` | `/boards/:id`                 | owner     | Удалить доску каскадно                 |
| `POST`   | `/boards/:boardId/columns`    | editor    | Добавить колонку в конец               |
| `PATCH`  | `/columns/:id`                | editor    | Переименовать колонку                  |
| `DELETE` | `/columns/:id`                | editor    | Удалить колонку                        |

При создании доски владелец автоматически становится участником с ролью `editor`. Позиции колонок — `Decimal` с шагом 1000, чтобы позже вставлять колонки между существующими без переписывания всей доски.

### Карточки

| Метод    | Путь                       | Доступ   | Описание                          |
| -------- | -------------------------- | -------- | --------------------------------- |
| `POST`   | `/columns/:columnId/cards` | editor   | Создать карточку в конце колонки  |
| `GET`    | `/cards/:id`               | участник | Получить карточку                 |
| `PATCH`  | `/cards/:id`               | editor   | Изменить заголовок и описание     |
| `DELETE` | `/cards/:id`               | editor   | Удалить карточку                  |
| `POST`   | `/cards/:id/move`          | editor   | Переместить карточку в транзакции |

`GET /boards/:id` возвращает колонки вместе с карточками, отсортированными по `position`.

<details>
<summary>Контракт перемещения карточки</summary>

```json
POST /api/cards/:id/move
{
  "toColumnId": "uuid",
  "beforeCardId": "uuid | null",
  "afterCardId": "uuid | null",
  "expectedVersion": 3
}
```

`beforeCardId` — карточка, после которой должна встать перемещаемая; `afterCardId` — карточка, перед которой она должна встать. Для перемещения в конец колонки достаточно `beforeCardId`, для перемещения в начало — `afterCardId`, для пустой колонки оба поля `null`.

Транзакция:

1. Блокирует строку доски (`SELECT … FOR UPDATE`) — это сериализует изменения карточек в рамках одной доски.
2. Блокирует перемещаемую карточку и карточки целевой колонки (`FOR UPDATE`) и сверяет `expectedVersion`.
3. Проверяет, что переданные соседи действительно стоят рядом. Если порядок уже изменился — `409 Conflict`.
4. Вычисляет новую позицию: середину между соседями, `±1000` на краях или `1000` в пустой колонке.
5. Меняет `column_id`, `position` и инкрементирует `version`; в той же транзакции обновляет `updated_at` доски.

</details>

### Шаринг и роли

Владелец открывает диалог «Поделиться» и выбирает роль ссылки: `editor` (изменять доску, колонки и карточки) или `viewer` (только смотреть). API хранит случайный токен из 32 байт (`base64url`) в `boards.share_token` вместе с `boards.share_role`; ссылка имеет вид `/join/<token>`.

`POST /boards/:id/share` принимает `{ "role": "editor" | "viewer", "regenerate"?: boolean }` и возвращает `{ token, role }`. Без `regenerate` повторный вызов сохраняет текущий токен и меняет только роль, с `regenerate: true` — выпускает новый и инвалидирует старую ссылку. `GET /boards/:id/share` доступен только владельцу.

`POST /boards/join` идемпотентен: роль из ссылки применяется только при первом присоединении, существующая роль не меняется; владелец остаётся владельцем. `viewer` получает realtime-события, но любые мутации API возвращают `403`.

Диалог «Участники» доступен всем участникам доски и показывает `{ userId, name, email, role, isOwner, joinedAt }[]`. Владелец меняет роли и удаляет участников, участник может только покинуть доску. Роль владельца изменить нельзя, владелец не может выйти — доску нужно удалить целиком. Изменения рассылаются через `board.member.updated` / `board.member.removed`; удалённый сразу теряет доступ к API и выводится из WS-комнаты, а вернуться может по актуальной share-ссылке.

## Realtime (Socket.IO)

Один экземпляр API, комнаты `board:<boardId>`. Клиент подключается к `origin` (Vite проксирует `/socket.io` с `ws: true`) и передаёт access-токен в `handshake.auth.token`. Gateway проверяет JWT, а `board.subscribe` дополнительно проверяет членство в доске через `board_members`.

- Клиент → сервер: `board.subscribe`, `board.unsubscribe`.
- Сервер → клиент: `board.joined`, `column.created/updated/deleted`, `card.created/updated/moved/deleted`, `board.member.updated/removed`, `presence.updated`.

События отправляются после успешного коммита транзакции, поэтому подписчики не видят откаченное состояние. Presence считает уникальных пользователей — несколько вкладок одного пользователя не раздувают счётчик; после reconnect подписка восстанавливается автоматически.

## Как устроена авторизация

- **Argon2id** с memory cost 19 MiB, time cost 2, parallelism 1.
- **Access JWT** живёт 15 минут и передаётся в `Authorization: Bearer`. Guard проверяет подпись и тип токена, затем загружает пользователя из БД.
- **Refresh JWT** живёт 30 дней и передаётся в `HttpOnly` cookie. В БД хранится только SHA-256-хеш токена и `jti`, поэтому утечка БД не даёт готовых сессий.
- **Rotation**: каждый `/auth/refresh` атомарно отзывает текущий токен (`UPDATE … WHERE revoked_at IS NULL`) и выдаёт новую пару. Параллельные refresh-запросы в одной вкладке дедуплицируются на клиенте.
- **Reuse detection**: повторное использование уже отозванного refresh-токена отзывает все активные сессии пользователя.
- **Frontend**: access-токен в памяти Pinia, refresh-cookie используется для «тихого» восстановления сессии после перезагрузки. Axios-интерцептор при `401` делает один refresh и повторяет исходный запрос; при неудаче очищает сессию и редиректит на `/login`.
- **Rate limit**: глобально через `@fastify/rate-limit`, 120 запросов/мин на IP по умолчанию.

Cookie не используется для access-токена, поэтому CSRF-риск сведён к `/api/auth/refresh|logout`: они защищены `SameSite=Lax` и проверкой разрешённого origin.

## Команды

```bash
pnpm dev             # shared build + API и web параллельно
pnpm dev:api         # только API
pnpm dev:web         # только web
pnpm build           # production-сборка всех пакетов
pnpm typecheck       # проверка типов
pnpm test            # интеграционные тесты API (нужна PostgreSQL)
pnpm db:generate     # prisma generate
pnpm db:migrate      # prisma migrate dev
pnpm db:studio       # Prisma Studio
```

## Ограничения и планы

- Realtime рассчитан на один экземпляр API: комнаты и presence хранятся в памяти.
- Share-токен хранится в БД в открытом виде — это криптостойкий bearer-секрет, но в продакшене его стоит хешировать.
- При исчерпании точности `Decimal(20,6)` `/move` вернёт `409`: фоновая ребалансировка позиций пока не реализована.
- Нет CI и фронтенд-тестов.

