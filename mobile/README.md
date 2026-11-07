# IDEAL FLOOR CRM Mobile

Нативное мобильное приложение для существующей IDEAL FLOOR CRM.

## Архитектура

- React Native + Expo SDK 58
- Expo Router
- Тот же API: https://dealer-crm.onrender.com
- Тот же MongoDB backend
- JWT-авторизация существующих пользователей CRM
- SecureStore для токена
- react-native-maps + Expo Location для работы в поле

## Что уже работает

- вход текущим логином/паролем CRM;
- проверка сохранённой сессии через `/api/auth/me`;
- главная с продажами и план/факт;
- список дилеров и поиск;
- нативная карточка дилера;
- быстрый завершённый визит с телефона;
- карта реальных дилеров по координатам;
- определение текущего местоположения;
- продажи по месяцам;
- права пользователя учитываются;
- защищённый выход из аккаунта;
- ссылки на пока ещё не перенесённые нативно модули веб-CRM.

## Локальный запуск

Expo SDK 58 требует современный Node.js (22.13+).

```bash
cd mobile
npm install
npx expo install --fix
npx expo-doctor
npx expo start
```

Для Android development build:

```bash
npx expo run:android
```

## APK для внутреннего тестирования

После подключения проекта к Expo/EAS:

```bash
npx eas-cli build --platform android --profile preview
```

Профиль `preview` собирает APK, который можно установить сотрудникам напрямую.

## Google Play

```bash
npx eas-cli build --platform android --profile production
```

Профиль `production` создаёт AAB для Google Play.

## API URL

По умолчанию приложение использует production CRM.

При необходимости можно переопределить:

```bash
EXPO_PUBLIC_API_URL=https://dealer-crm.onrender.com npx expo start
```

## Следующие этапы

1. Нативное редактирование карточки дилера.
2. Фото/камера и загрузка фотоотчёта.
3. Маршруты и список визитов на день.
4. Push-уведомления.
5. Рекламации.
6. Цены и создание/отправка КП.
7. Цех.
8. Offline-кэш и очередь синхронизации.
9. Биометрический вход.
