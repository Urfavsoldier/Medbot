# Damumed Sandbox

Локальная медицинская демо-платформа для тестирования Chrome Extension MedBot. Это не AI-продукт, а реалистичная Damumed-like среда, над которой MedBot работает как внешний RPA-агент через DOM.

## Стек

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma ORM
- SQLite
- Простая credentials-аутентификация для локального демо

## Быстрый запуск

```bash
cd damumed-sandbox
npm install
npm run prisma:generate
npm run db:init
npm run dev
```

Откройте:

```text
http://localhost:3000
```

## Демо-доступ

```text
Логин: doctor@aqbobek.local
Пароль: demo12345
```

После входа перейдите в раздел `Пациенты` и откройте пациента `Иванов Андрей Сергеевич`.

## Маршруты

- `/login` — вход врача
- `/dashboard` — рабочий стол врача
- `/patients` — список пациентов
- `/patients/[id]` — карта пациента

## Что доступно в карте пациента

- `Первичный прием`
  - Жалобы
  - Анамнез
  - Объективный статус
  - Рекомендации
- `Выписной эпикриз`
  - Жалобы
  - Объективный статус
  - Рекомендации
- `Дневник процедур`
  - Список услуг
  - Поле `Результат процедуры`
  - Сохранение дневника
- `Расписание`
  - Сетка 9 рабочих дней
  - Время
  - Специалист
  - Процедура
  - Статус
  - Подтверждение расписания

## DOM-хуки для MedBot

Критические элементы имеют стабильные селекторы:

```text
data-testid="patient-search"
data-testid="patient-search-input"
data-testid="open-patient-ivanov"
data-testid="tab-primary-exam"
data-testid="tab-discharge-summary"
data-testid="tab-procedure-diary"
data-testid="tab-schedule"
data-testid="field-complaints"
data-testid="field-anamnesis"
data-testid="field-objective-status"
data-testid="field-recommendations"
data-testid="field-procedure-result"
data-testid="mark-completed-massage"
data-testid="mark-completed-lfk"
data-testid="mark-completed-psychologist"
data-testid="schedule-input"
data-testid="schedule-grid"
data-testid="confirm-schedule"
```

Также сохранены видимые русские подписи и реальные элементы `button`, `textarea`, `input`, `a`, чтобы расширение могло работать через текст, label, placeholder, aria-label и fallback-эвристики.

## Сценарии для демо MedBot

1. Голосовая навигация:
   - `Открой первичный прием Иванова`
   - MedBot должен открыть строку пациента и переключить вкладку `Первичный прием`.

2. Гранулярное заполнение:
   - `Жалобы на головную боль и слабость. Объективно тонус снижен. Назначить массаж и ЛФК.`
   - MedBot должен заполнить поля `Жалобы`, `Объективный статус`, `Рекомендации` отдельно.

3. Расписание:
   - `Сформируй расписание на 9 рабочих дней`
   - MedBot должен перейти в `Расписание`, вставить план в `schedule-input` и нажать `Подтвердить расписание`.

4. Завершение процедуры:
   - `Поставь выполнено по массажу`
   - MedBot должен найти услугу `Массаж` и нажать `Отметить выполнено`.

5. Дневник процедуры:
   - `Ребенок перенес процедуру спокойно`
   - MedBot должен перейти в `Дневник процедур` и заполнить поле `Результат процедуры`.

## Сброс базы

```bash
npm run db:reset
```

Команда заново применит Prisma schema и загрузит seed-данные.

Если локальная Prisma schema engine недоступна в вашей среде, используйте надежный demo fallback:

```bash
npm run db:init
```

Он создает SQLite-таблицы из локального bootstrap-скрипта и запускает Prisma seed.
