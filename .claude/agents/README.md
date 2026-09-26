# Субагенти DevDigest

Карта набору субагентів проєкту. Повні інструкції — у файлах `<agent>.md` поруч; тут лише роль, межі та контракти між агентами.

## Зведена таблиця

| Агент | Відповідальність | Інструменти | Модель | Вхід | Вихід |
| --- | --- | --- | --- | --- | --- |
| [`researcher`](researcher.md) | Знайти й підтвердити відповідь на конкретне питання (репозиторій, зовнішні джерела або обидва) | Read, Grep, Glob, Bash (read-only), WebSearch, WebFetch | sonnet | Конкретне питання + за потреби пакет/версія/глибина | Звіт: висновки, докази (`path:line`, цитати), посилання, «Not found» |
| [`planner`](planner.md) | Перетворити задачу на Development Plan, який виконується без додаткових рішень | Read, Grep, Glob, Bash (read-only) | opus | Опис задачі (часто зі spec у `tasks/`) | План S1..Sn (або «Clarification needed») — головне повідомлення; зберігає його основна сесія, зазвичай у `tasks/<slug>/plan.md` |
| [`implementer`](implementer.md) | Виконати затверджений план, довести кожен крок перевіркою, чесно звітувати | Read, Grep, Glob, Edit, Write, Bash, Skill | sonnet | Шлях до затвердженого плану | Implementation report: статуси кроків, acceptance, запущені перевірки, відхилення, hand-off для рев'ю |

## Типовий потік

```
питання ──► researcher ──► звіт (факти, докази)
                              │ (за потреби, як вхід до планування)
задача  ──► planner ──► plan.md ──► [затвердження користувачем] ──► implementer ──► report ──► рев'ю
```

- `researcher` незалежний: викликається для питань, а `planner` не запускає його сам — зовнішні факти виносить у «Risks & open questions → researcher».
- Між `planner` і `implementer` обов'язковий крок — **затвердження плану користувачем**.
- Рев'ю архітектури й безпеки, а також `/pr-self-review` — окремі етапи після `implementer`; жоден з цих трьох агентів їх не виконує.

## Дозволи та межі

Ніхто з агентів не запускає subagents, не робить `git commit/push/checkout/reset/stash` і не чіпає `server/clones/**`, `**/node_modules/**`, lock-файли.

| Агент | Може | Не може |
| --- | --- | --- |
| `researcher` | Читати код і git-історію (`git log/show/blame/diff`, `ls`, `wc`, `head`); ходити в інтернет | Змінювати файли; перенаправлення `>`/`>>`, `tee`, `rm/mv/cp`; інсталяції, сервери, міграції; використовувати skills |
| `planner` | Читати код, специфікації, INSIGHTS; читати git-історію | Створювати/редагувати файли; запускати тести, міграції, сервери; ходити в інтернет; писати INSIGHTS (лише пропонує в «Risks») |
| `implementer` | Редагувати лише файли з «File inventory» плану; запускати typecheck/test пакетів, що зачеплені; викликати Skill (напр. `security`) | Виходити за inventory (виняток — мінімальна механічна зміна, яку треба вказати у «Deviations»); правити `server/src/db/migrations/**` вручну; додавати залежності без плану; запускати `gh pr`, `/pr-self-review`, `security-review`; ходити в інтернет |

Ліміт `implementer` на збій: 3 спроби на крок, далі `BLOCKED`.

## Попередньо завантажені skills

`planner` і `implementer` мають однаковий список (у frontmatter `skills:`):
`onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `react-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `zod`, `typescript-expert`, `engineering-insights`.

Свідомо **не** включено `security`: це окремий етап рев'ю. Якщо файл маршрутизується на `security`, `planner` читає `.claude/skills/security/` і виносить пункти в «Notes for reviewers → Security», а `implementer` завантажує skill через Skill tool і дотримується його правил у власному коді. `researcher` skills не використовує.

## Артефакти

| Артефакт | Створює | Споживає | Де живе |
| --- | --- | --- | --- |
| Research report | `researcher` | користувач, `planner` (через основну сесію) | повідомлення агента |
| Clarification needed | будь-який з трьох, коли вхід неясний (до 5 питань) | користувач | повідомлення агента |
| Development Plan | `planner` | користувач (затвердження), `implementer` | `tasks/<slug>/plan.md` (зберігає основна сесія) |
| Implementation report | `implementer` | користувач, рев'ювери | повідомлення агента |

Ключові розділи плану, на які спирається `implementer`: **Steps** (Files, Skills & rules, Tests, Acceptance, Verify), **File inventory** (межа дозволених змін), **Notes for reviewers** (hand-off для архітектурного й security-рев'ю).

## Джерела правил

Правила `planner` та `implementer` не вигадані окремо — вони відображають такі документи проєкту.

### Спільні для обох

| Джерело | Які правила з нього походять |
| --- | --- |
| `CLAUDE.md` (корінь) | Порядок читання `specs/ → docs/ → INSIGHTS.md → source`; виключення `server/clones/**`; заборона правити міграції вручну та lock-файли; pnpm для `server/`+`client/`, npm для `reviewer-core/`+`e2e/`; контракти спочатку в `@devdigest/shared`; поділ `*.it.test.ts` (DB) і hermetic-тестів; секрети не в git/БД; `docker compose down -v` заборонено |
| `.claude/skills/pr-self-review/routing.md` | Єдине джерело правди, який skill керує яким файлом; за ним `planner` прикріплює правила до кроків, а `implementer` обирає skills. Це гарантує, що самоперевірка перед PR не суперечитиме плану |
| `<pkg>/INSIGHTS.md` та кореневий `INSIGHTS.md` | Врахування відхилених підходів; `planner` називає застосовні записи, `implementer` читає ті, що процитовані в плані. Історія git як еталон реверднутих фіч (кореневий INSIGHTS) |
| `<pkg>/AGENTS.md` (`server/`, `client/`) | Іменування компонентів, модулів, locale-файлів |
| Skill `engineering-insights` | Формат і маршрутизація записів; `implementer` фіксує лише перевірені неочевидні знахідки, `planner` — лише пропонує |

### Лише `planner`

| Джерело | Які правила з нього походять |
| --- | --- |
| `<pkg>/specs/`, `<pkg>/docs/`, `tasks/<slug>/` | Що будуємо і як воно працює — читаються першими; acceptance зі spec переноситься в план |
| Skill `onion-architecture` | Шари routes → service → repository, ports/adapters, `platform/container.ts` як composition root; обов'язковий для серверних кроків |
| Skill `react-architecture` | Розташування компонентів, хуків, констант, даних; обов'язковий для клієнтських кроків |
| Skills `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `react-best-practices`, `next-best-practices`, `zod`, `typescript-expert` | Конкретні правила, які переписуються в поле «Skills & rules» кожного кроку |
| `TESTING.md` | Тестування поведінки на швах, happy path + один суттєвий edge, моки через `server/src/adapters/mocks.ts`, e2e лише при зміні головного user journey |
| `.claude/skills/security/` | Пункти для «Notes for reviewers → Security» |

### Лише `implementer`

| Джерело | Які правила з нього походять |
| --- | --- |
| Затверджений план (`tasks/<slug>/plan.md`) | File inventory як межа змін; Acceptance і Verify як критерії завершення |
| Skill `react-testing-library` | Написання клієнтських тестів |
| Skill `security` (за маршрутизацією) | Безпечний код у файлах, які на нього маршрутизуються |
| `TESTING.md`, команди з `CLAUDE.md` | Які перевірки запускати (`pnpm typecheck/test`, `npm run typecheck`/`npm test`), звірка `server/src/vendor/shared` ↔ `client/src/vendor/shared`, `pnpm db:generate` після зміни `schema.ts`, `*.it.test.ts` без Docker = SKIPPED, а не PASS |

## Коли який агент

- «Де/як це реалізовано, чому так, що вже пробували?» → `researcher`.
- «Як зробити фічу, що зачіпає `server/`, `client/` або `@devdigest/shared`?» → `planner`, потім (після затвердження) `implementer`.
- Тривіальна правка в один файл — агенти не потрібні.
