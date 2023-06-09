import './basic';

// TODO:
//  План тестов

//  Типы
//  1. Проброс типов зависимостей из dependencies в init

//  Конструкторы
//  1. Синхронный конструктор
//  2. Асинхронный конструктор
//  3. Конструктор с асинками
//  4. Конструктор с генератором
//  5. Пустой конструктор с внешней инициализацией

//  Зависимости - древовидные. Первая инициализация.
//  1. Синхронный конструктор
//  2. Асинхронный конструктор
//  3. Конструктор с асинками
//  4. Конструктор с генератором
//  5. Пустой конструктор с внешней инициализацией

//  Зависимости - древовидные. Реинициализация при изменении одной из зависимостей
//  1. Синхронный конструктор
//  2. Асинхронный конструктор
//  3. Конструктор с асинками
//  4. Конструктор с генератором
//  5. Пустой конструктор с внешней инициализацией

//  Жизненный цикл
//  1. Destroy
//  2. Проверка утечек памяти (видимо придется в браузере, вручную)

//  Отслеживание ошибок. Единичный ресурс и с зависимостями. Восстановление состояния после ошибки.
//  1. Синхронный конструктор
//  2. Асинхронный конструктор
//  3. Конструктор с асинками
//  4. Конструктор с генератором
//  5. Пустой конструктор с внешней инициализацией

// Пограничные и сложные случаи
// 1. Множественный вызов метода инициализации (пока предыдущий вызов не успел отработать)
// 2. Множественный вызов метода ре-инициализации - с разными видами конструкторов
// 3.
