# Lvalue - Сервис проверки хостов и DNS резолвинга

![React](https://img.shields.io/badge/-React-61DAFB?logo=react&logoColor=white&style=for-the-badge)
![Vite](https://img.shields.io/badge/-Vite-646CFF?logo=vite&logoColor=white&style=for-the-badge)
![Tailwind](https://img.shields.io/badge/-Tailwind-06B6D4?logo=tailwindcss&logoColor=white&style=for-the-badge)

## О проекте

Lvalue - веб-сервис для комплексной проверки сетевой инфраструктуры. Выполняет сетевые диагностики и DNS проверки для сайтов, IP-адресов и хостов.

## Функциональность

- **HTTP/HTTPS проверки** - статус коды, заголовки, время ответа
- **TCP/UDP порты** - проверка доступности портов
- **Ping** - проверка доступности и задержек
- **DNS записи** - A, AAAA, MX, NS, TXT записи
- **Traceroute** - трассировка маршрута до сервера
- **Геолокация** - определение местоположения серверов

## Система агентов

**Добавление собственных агентов** (для зарегистрированных пользователей):
- Создание кастомных агентов через веб-интерфейс
- Ввод названия, IP-адреса и порта агента
- Автоматическая генерация Docker Compose конфигурации
- Использование собственных агентов для глубокого сканирования (nmap)

## Технологии

**Фронтенд:**
- React 19.1.1
- Vite 7.1.7
- Tailwind CSS 3.4.18
- React Router DOM 7.9.4
- TypeScript

**Утилиты:**
- lucide-react - иконки
- pigeon-maps - карты

## Установка и запуск

```bash
# Установка зависимостей
npm install

# Запуск dev сервера
npm run dev

# Сборка проекта
npm run build

# Превью продакшен версии
npm run preview

# Линтинг кода
npm run lint
```

## Деплой

```bash
# Деплой на GitHub Pages
npm run deploy
```

Проект доступен на: **https://checkhost.lvalue.dev**

## Структура проекта

```
lvalue/
├── src/                 # Исходный код
├── dist/               # Собранные файлы (продакшен)
├── public/             # Статические файлы
└── package.json        # Конфигурация проекта
```

## Особенности

- **TypeScript** - строгая типизация
- **ESLint** - контроль качества кода
- **Tailwind CSS** - утилитарные стили
- **Pigeon Maps** - легковесные карты
- **Lucide Icons** - современные иконки

## Скрипты

- `dev` - разработка с горячей перезагрузкой
- `build` - сборка для продакшена
- `preview` - предпросмотр собранного проекта
- `lint` - проверка кода
- `predeploy` - подготовка к деплою
- `deploy` - публикация на GitHub Pages

---

Разработано командой Lvalue
