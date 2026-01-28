const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Настройка CORS для Socket.io
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Раздаём статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Отдельный маршрут для admin.html (он в корневой папке)
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Middleware для парсинга JSON
app.use(express.json());

// API для проверки здоровья
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    rooms: Array.from(rooms.keys()).length,
    players: Array.from(rooms.values()).reduce((acc, room) => {
      return acc + (room.player1 ? 1 : 0) + (room.player2 ? 1 : 0) + 1;
    }, 0),
    uptime: process.uptime()
  });
});

// API для получения статистики
app.get('/stats', (req, res) => {
  const stats = {
    totalRooms: Array.from(rooms.keys()).length,
    activeGames: Array.from(rooms.values()).filter(room => 
      room.player1 && room.player2
    ).length,
    waitingRooms: Array.from(rooms.values()).filter(room => 
      !room.player1 || !room.player2
    ).length,
    rooms: Array.from(rooms.entries()).map(([code, room]) => ({
      code,
      master: room.master.name,
      player1: room.player1?.name || 'Ожидает',
      player2: room.player2?.name || 'Ожидает',
      state: room.state,
      created: new Date(room.createdAt).toLocaleString()
    }))
  };
  res.json(stats);
});

// API для очистки неактивных комнат
app.post('/clear-rooms', (req, res) => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000;
  let cleaned = 0;
  
  for (const [roomCode, room] of rooms.entries()) {
    if (now - room.lastActivity > timeout) {
      rooms.delete(roomCode);
      cleaned++;
      io.to(roomCode).emit('room-closed', 'Комната удалена из-за неактивности');
      io.in(roomCode).socketsLeave(roomCode);
    }
  }
  
  res.json({ success: true, cleaned });
});

// Загружаем карточки
let cardsData = {};
try {
  const cardsFile = fs.readFileSync(path.join(__dirname, 'public', 'cards.json'), 'utf8');
  cardsData = JSON.parse(cardsFile);
  console.log('✅ Карточки загружены на сервере');
} catch (error) {
  console.error('❌ Ошибка загрузки карточек:', error);
  cardsData = {
    categories: {
      1: [
        { question: "Как правильно приготовить борщ?", instruction: "Опишите основные шаги" },
        { question: "Назовите 5 основных ингредиентов для салата Цезарь", instruction: "Перечислите ингредиенты" }
      ],
      2: [
        { question: "Как приготовить коктейль Мохито?", instruction: "Опишите шаги приготовления" },
        { question: "Что такое Манхэттен коктейль?", instruction: "Опишите состав и способ приготовления" }
      ],
      3: [
        { question: "Какая температура подачи красного вина?", instruction: "Назовите оптимальную температуру" },
        { question: "Что означает термин 'сомаелье'?", instruction: "Дайте определение" }
      ],
      4: [
        { question: "Гость жалуется на холодное блюдо. Ваши действия?", instruction: "Опишите решение" },
        { question: "Клиент просит заменить ингредиент из-за аллергии", instruction: "Как поступить?" }
      ],
      5: [
        { question: "Как правильно сервировать стол?", instruction: "Опишите основные правила" },
        { question: "В какой последовательности подавать приборы?", instruction: "Объясните порядок" }
      ],
      6: [
        { question: "Как предложить гостю дорогое вино?", instruction: "Опишите технику продаж" },
        { question: "Как увеличить средний чек?", instruction: "Назовите 3 способа" }
      ]
    }
  };
}

// Хранилище комнат
const rooms = new Map();
const timers = new Map();

// Функция для обновления таймера
function updateTimer(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || !room.state.timerRunning) return;
  
  if (room.state.timer > 0) {
    room.state.timer--;
    io.to(roomCode).emit('timer-update', {
      timer: room.state.timer,
      running: true
    });
  } else {
    // Время вышло
    room.state.timerRunning = false;
    clearInterval(timers.get(roomCode));
    timers.delete(roomCode);
    
    // Уведомляем всех, что время вышло
    io.to(roomCode).emit('timer-ended');
    
    // Если отвечал игрок, помечаем ответ как завершенный
    if (room.state.waitingForAnswer) {
      room.state.waitingForAnswer = false;
      
      // Уведомляем ведущего, что игрок завершил ответ (по таймеру)
      const masterSocket = io.sockets.sockets.get(room.master.id);
      if (masterSocket) {
        masterSocket.emit('answer-completed-by-player');
      }
    }
  }
}

// Функция для старта таймера
function startTimer(roomCode, duration = 60) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  // Останавливаем старый таймер
  if (timers.has(roomCode)) {
    clearInterval(timers.get(roomCode));
    timers.delete(roomCode);
  }
  
  room.state.timer = duration;
  room.state.timerRunning = true;
  
  // Отправляем начальное значение всем
  io.to(roomCode).emit('timer-update', {
    timer: room.state.timer,
    running: true
  });
  
  // Запускаем новый таймер
  const timer = setInterval(() => updateTimer(roomCode), 1000);
  timers.set(roomCode, timer);
}

// Функция для остановки таймера
function stopTimer(roomCode) {
  const room = rooms.get(roomCode);
  if (room) {
    room.state.timerRunning = false;
  }
  
  if (timers.has(roomCode)) {
    clearInterval(timers.get(roomCode));
    timers.delete(roomCode);
  }
  
  io.to(roomCode).emit('timer-update', {
    timer: 60,
    running: false
  });
}

// Очистка неактивных комнат каждые 5 минут
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000;
  
  for (const [roomCode, room] of rooms.entries()) {
    if (now - room.lastActivity > timeout) {
      console.log(`🗑️ Удалена неактивная комната: ${roomCode}`);
      rooms.delete(roomCode);
      
      // Останавливаем таймер
      if (timers.has(roomCode)) {
        clearInterval(timers.get(roomCode));
        timers.delete(roomCode);
      }
      
      io.to(roomCode).emit('room-closed', 'Комната удалена из-за неактивности');
      io.in(roomCode).socketsLeave(roomCode);
    }
  }
}, 5 * 60 * 1000);

io.on('connection', (socket) => {
  console.log('🎮 Новый игрок подключен:', socket.id);
  
  socket.emit('server-stats', {
    totalRooms: Array.from(rooms.keys()).length,
    activePlayers: io.engine.clientsCount
  });

  // Создание комнаты
  socket.on('create-room', (playerName) => {
    const roomCode = generateRoomCode();
    
    rooms.set(roomCode, {
      master: { 
        id: socket.id, 
        name: playerName,
        joinedAt: Date.now()
      },
      player1: null,
      player2: null,
      state: {
        currentPlayer: 1,
        scores: { 1: 0, 2: 0 },
        positions: { 1: 0, 2: 0 },
        diceResult: 0,
        timer: 60,
        timerRunning: false,
        gameStarted: false,
        waitingForAnswer: false,
        currentQuestion: null,
        currentQuestionCategory: null
      },
      createdAt: Date.now(),
      lastActivity: Date.now()
    });

    socket.join(roomCode);
    socket.data = {
      roomCode,
      role: 'master',
      playerName,
      id: socket.id,
      joinedAt: Date.now()
    };

    socket.emit('room-created', {
      roomCode,
      role: 'master',
      playerName,
      timestamp: new Date().toISOString()
    });

    io.emit('server-stats-update', {
      totalRooms: Array.from(rooms.keys()).length
    });

    console.log(`✅ Комната создана: ${roomCode}, ведущий: ${playerName}`);
  });

  // Присоединение к комнате
  socket.on('join-room', ({ roomCode, playerName, role }) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { 
        code: 'ROOM_NOT_FOUND', 
        message: 'Комната не найдена' 
      });
      return;
    }

    if (room.master.id === socket.id) {
      socket.emit('error', { 
        code: 'ALREADY_IN_ROOM', 
        message: 'Вы уже являетесь ведущим этой комнаты' 
      });
      return;
    }

    if (room.player1?.id === socket.id || room.player2?.id === socket.id) {
      socket.emit('error', { 
        code: 'ALREADY_IN_ROOM', 
        message: 'Вы уже присоединились к этой комнате' 
      });
      return;
    }

    let assignedRole = role;
    let success = false;
    
    if (role === 'player1' && !room.player1) {
      room.player1 = { 
        id: socket.id, 
        name: playerName,
        joinedAt: Date.now()
      };
      success = true;
    } else if (role === 'player2' && !room.player2) {
      room.player2 = { 
        id: socket.id, 
        name: playerName,
        joinedAt: Date.now()
      };
      success = true;
    } else {
      // Автоназначение
      if (!room.player1) {
        assignedRole = 'player1';
        room.player1 = { 
          id: socket.id, 
          name: playerName,
          joinedAt: Date.now()
        };
        success = true;
      } else if (!room.player2) {
        assignedRole = 'player2';
        room.player2 = { 
          id: socket.id, 
          name: playerName,
          joinedAt: Date.now()
        };
        success = true;
      }
    }

    if (!success) {
      socket.emit('error', { 
        code: 'ROOM_FULL', 
        message: 'Комната заполнена' 
      });
      return;
    }

    socket.join(roomCode);
    socket.data = {
      roomCode,
      role: assignedRole,
      playerName,
      id: socket.id,
      joinedAt: Date.now()
    };

    room.lastActivity = Date.now();

    // Успешное подключение
    socket.emit('join-success', {
      roomCode,
      role: assignedRole,
      playerName,
      gameState: room.state,
      players: {
        master: room.master.name,
        player1: room.player1?.name || null,
        player2: room.player2?.name || null
      },
      timestamp: new Date().toISOString()
    });

    // Уведомляем всех в комнате
    io.to(roomCode).emit('player-joined', {
      playerName,
      role: assignedRole,
      players: {
        master: room.master.name,
        player1: room.player1?.name,
        player2: room.player2?.name
      },
      timestamp: new Date().toISOString()
    });

    // Если комната заполнена, уведомляем о начале игры
    if (room.player1 && room.player2 && !room.state.gameStarted) {
      room.state.gameStarted = true;
      io.to(roomCode).emit('game-started', {
        message: 'Игра началась! Все игроки подключены.',
        currentPlayer: room.state.currentPlayer,
        playerName: room.state.currentPlayer === 1 ? room.player1?.name : room.player2?.name
      });
    }

    io.emit('server-stats-update', {
      totalRooms: Array.from(rooms.keys()).length,
      activePlayers: io.engine.clientsCount
    });

    console.log(`✅ ${playerName} присоединился как ${assignedRole} в комнату ${roomCode}`);
  });

  // Проверка комнаты
  socket.on('check-room', (roomCode) => {
    const room = rooms.get(roomCode);
    if (room) {
      socket.emit('room-status', {
        exists: true,
        code: roomCode,
        players: {
          master: room.master.name,
          player1: room.player1?.name,
          player2: room.player2?.name
        },
        slots: {
          master: !!room.master,
          player1: !room.player1,
          player2: !room.player2
        },
        gameStarted: room.state.gameStarted,
        created: new Date(room.createdAt).toLocaleString()
      });
    } else {
      socket.emit('room-status', {
        exists: false,
        code: roomCode
      });
    }
  });

  // Получение информации о комнате
  socket.on('get-room-info', () => {
    const { roomCode } = socket.data;
    if (!roomCode) {
      socket.emit('error', { message: 'Вы не в комнате' });
      return;
    }
    
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }
    
    socket.emit('room-info', {
      code: roomCode,
      master: room.master.name,
      player1: room.player1?.name || 'Ожидает',
      player2: room.player2?.name || 'Ожидает',
      gameState: room.state,
      created: new Date(room.createdAt).toLocaleString(),
      lastActivity: new Date(room.lastActivity).toLocaleString()
    });
  });

  // Бросок кубика
  socket.on('roll-dice', () => {
    const { roomCode, role, playerName } = socket.data;
    if (!roomCode) {
      socket.emit('error', { message: 'Вы не в комнате' });
      return;
    }
    
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    if (!room.state.gameStarted) {
      socket.emit('error', { message: 'Игра еще не началась. Ожидайте подключения всех игроков.' });
      return;
    }

    const currentPlayer = room.state.currentPlayer;
    const canRoll = 
      (role === 'player1' && currentPlayer === 1) ||
      (role === 'player2' && currentPlayer === 2);

    if (!canRoll) {
      socket.emit('error', { message: 'Сейчас не ваш ход' });
      return;
    }

    if (room.state.diceResult !== 0) {
      socket.emit('error', { message: 'Кубик уже брошен в этом ходе' });
      return;
    }

    const diceResult = Math.floor(Math.random() * 6) + 1;
    room.state.diceResult = diceResult;
    room.state.waitingForAnswer = true;
    room.lastActivity = Date.now();

    // Выбираем случайный вопрос
    let questionData = null;
    if (cardsData.categories && cardsData.categories[diceResult]) {
      const questions = cardsData.categories[diceResult];
      if (questions && questions.length > 0) {
        const randomIndex = Math.floor(Math.random() * questions.length);
        questionData = questions[randomIndex];
      }
    }

    if (!questionData) {
      questionData = {
        question: `Вопрос для категории ${diceResult}`,
        instruction: "Ответьте на вопрос"
      };
    }

    // Сохраняем вопрос в состоянии
    room.state.currentQuestion = questionData.question;
    room.state.currentQuestionCategory = diceResult;

    // Отправляем результат всем в комнате
    io.to(roomCode).emit('dice-rolled', {
      dice: diceResult,
      player: currentPlayer,
      playerName: playerName,
      timestamp: new Date().toISOString(),
      taskType: getTaskName(diceResult)
    });

    // Отправляем вопрос всем в комнате
    io.to(roomCode).emit('question-show', {
      question: questionData.question,
      category: diceResult,
      instruction: questionData.instruction || '',
      forPlayer: currentPlayer,
      isAnsweringPlayer: (role === 'player1' && currentPlayer === 1) || (role === 'player2' && currentPlayer === 2)
    });

    // Запускаем таймер для всех
    startTimer(roomCode);

    console.log(`🎲 В комнате ${roomCode} выброшен ${diceResult} игроком ${playerName}`);
  });

  // Игрок завершил ответ (нажал кнопку "Завершить ответ")
  socket.on('answer-completed', () => {
    const { roomCode, role, playerName } = socket.data;
    if (!roomCode) return;
    
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.state.waitingForAnswer = false;
    room.lastActivity = Date.now();
    
    // Останавливаем таймер
    stopTimer(roomCode);
    
    // Скрываем карточку только у отвечающего игрока
    socket.emit('hide-card');
    
    // Уведомляем ведущего, что игрок завершил ответ
    const masterSocket = io.sockets.sockets.get(room.master.id);
    if (masterSocket) {
      masterSocket.emit('answer-completed-by-player');
    }
    
    console.log(`✅ Игрок ${playerName} завершил ответ в комнате ${roomCode}`);
  });

  // Ведущий начал оценивание (нажал "Приступить к оцениванию")
  socket.on('start-evaluation', () => {
    const { roomCode, role } = socket.data;
    if (!roomCode || role !== 'master') return;
    
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.lastActivity = Date.now();
    
    // Уведомляем всех, КРОМЕ ведущего, что нужно скрыть карточку
    socket.to(roomCode).emit('master-started-evaluation');
    
    // Уведомляем самого ведущего, что он может скрыть карточку и показать панель
    socket.emit('master-finished-evaluation');
    
    console.log(`👑 Ведущий начал оценивание в комнате ${roomCode}`);
  });

  // Специальная зона (ведущий отправил вопрос зоны)
  socket.on('special-zone', (data) => {
    const { roomCode, ...zoneData } = data;
    const { role } = socket.data;
    
    if (!roomCode || role !== 'master') return;
    
    // Отправляем вопрос зоны всем в комнате
    io.to(roomCode).emit('special-zone', zoneData);
    
    console.log(`🎯 Ведущий отправил специальную зону в комнате ${roomCode}: ${zoneData.zoneName}`);
  });

  // Результат специальной зоны (ведущий оценил ответ)
  socket.on('special-zone-result', (data) => {
    const { roomCode, team, points } = data;
    const { role } = socket.data;
    
    if (!roomCode || role !== 'master') return;
    
    const room = rooms.get(roomCode);
    if (!room) return;
    
    // Обновляем позицию фишки
    const newPosition = Math.max(0, Math.min(room.state.positions[team] + points, 40));
    room.state.positions[team] = newPosition;
    
    // Обновляем очки (если положительные очки)
    if (points > 0) {
      room.state.scores[team] += points;
    }
    
    room.lastActivity = Date.now();
    
    // Отправляем обновленное состояние всем
    io.to(roomCode).emit('game-updated', room.state);
    
    // Отправляем результат зоны всем
    io.to(roomCode).emit('special-zone-result', { team, points });
    
    // Проверяем победителя
    if (newPosition >= 40) {
      const winnerName = team === 1 ? room.player1?.name : room.player2?.name;
      io.to(roomCode).emit('game-over', {
        winner: team,
        winnerName,
        scores: room.state.scores,
        message: `🎉 Победила команда ${team} (${winnerName})!`
      });
    }
    
    console.log(`🎯 Результат специальной зоны в комнате ${roomCode}: команда ${team} получила ${points} очков`);
  });

  // Обновление состояния игры
  socket.on('update-game', (gameState) => {
    const { roomCode, role } = socket.data;
    if (!roomCode || role !== 'master') {
      socket.emit('error', { message: 'Только ведущий может обновлять состояние игры' });
      return;
    }
    
    const room = rooms.get(roomCode);
    if (room) {
      // Обновляем позиции и очки
      room.state.scores = gameState.scores || room.state.scores;
      room.state.positions = gameState.positions || room.state.positions;
      room.state.currentPlayer = gameState.currentPlayer || room.state.currentPlayer;
      room.lastActivity = Date.now();
      
      // Отправляем обновление всем в комнате
      io.to(roomCode).emit('game-updated', room.state);
      
      // Проверяем победителя
      if (room.state.positions[1] >= 40 || room.state.positions[2] >= 40) {
        const winner = room.state.positions[1] >= 40 ? 1 : 2;
        const winnerName = winner === 1 ? room.player1?.name : room.player2?.name;
        
        io.to(roomCode).emit('game-over', {
          winner,
          winnerName,
          scores: room.state.scores,
          message: `🎉 Победила команда ${winner} (${winnerName})!`
        });
        
        console.log(`🏆 Игра завершена в комнате ${roomCode}, победитель: команда ${winner}`);
      }
    }
  });

  // Следующий ход
  socket.on('next-turn', () => {
    const { roomCode, role } = socket.data;
    if (!roomCode || role !== 'master') {
      socket.emit('error', { message: 'Только ведущий может переходить к следующему ходу' });
      return;
    }
    
    const room = rooms.get(roomCode);
    if (room) {
      room.state.currentPlayer = room.state.currentPlayer === 1 ? 2 : 1;
      room.state.diceResult = 0;
      room.state.waitingForAnswer = false;
      room.state.currentQuestion = null;
      room.state.currentQuestionCategory = null;
      room.lastActivity = Date.now();
      
      // Останавливаем таймер
      stopTimer(roomCode);
      
      const nextPlayerName = room.state.currentPlayer === 1 ? room.player1?.name : room.player2?.name;
      
      io.to(roomCode).emit('turn-changed', {
        currentPlayer: room.state.currentPlayer,
        playerName: nextPlayerName,
        timestamp: new Date().toISOString()
      });
      
      console.log(`🔄 В комнате ${roomCode} ход передан игроку ${nextPlayerName}`);
    }
  });

  // Сброс игры
  socket.on('reset-game', () => {
    const { roomCode, role } = socket.data;
    if (!roomCode || role !== 'master') {
      socket.emit('error', { message: 'Только ведущий может сбрасывать игру' });
      return;
    }
    
    const room = rooms.get(roomCode);
    if (room) {
      room.state = {
        currentPlayer: 1,
        scores: { 1: 0, 2: 0 },
        positions: { 1: 0, 2: 0 },
        diceResult: 0,
        timer: 60,
        timerRunning: false,
        gameStarted: true,
        waitingForAnswer: false,
        currentQuestion: null,
        currentQuestionCategory: null
      };
      room.lastActivity = Date.now();
      
      // Останавливаем таймер
      stopTimer(roomCode);
      
      io.to(roomCode).emit('game-reset', {
        message: 'Игра сброшена. Начинаем заново!',
        gameState: room.state,
        playerName: room.player1?.name
      });
      
      console.log(`🔄 Игра сброшена в комнате ${roomCode}`);
    }
  });

  // Пинг
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // Отключение
  socket.on('disconnect', (reason) => {
    const { roomCode, role, playerName } = socket.data;
    console.log(`👋 Отключился: ${playerName || socket.id}, роль: ${role}, причина: ${reason}`);
    
    if (!roomCode) return;
    
    const room = rooms.get(roomCode);
    if (!room) return;

    room.lastActivity = Date.now();

    if (role === 'master') {
      // Останавливаем таймер
      if (timers.has(roomCode)) {
        clearInterval(timers.get(roomCode));
        timers.delete(roomCode);
      }
      
      // Удаляем комнату
      rooms.delete(roomCode);
      io.to(roomCode).emit('room-closed', {
        message: 'Ведущий покинул игру. Комната удалена.',
        reason: 'master_left'
      });
      io.in(roomCode).socketsLeave(roomCode);
      
      console.log(`🗑️ Комната ${roomCode} удалена (ведущий отключился)`);
    } else if (role === 'player1') {
      room.player1 = null;
      io.to(roomCode).emit('player-left', { 
        role: 'player1', 
        playerName,
        message: `${playerName} покинул игру`,
        timestamp: new Date().toISOString()
      });
      
      if (!room.player2) {
        room.state.gameStarted = false;
      }
    } else if (role === 'player2') {
      room.player2 = null;
      io.to(roomCode).emit('player-left', { 
        role: 'player2', 
        playerName,
        message: `${playerName} покинул игру`,
        timestamp: new Date().toISOString()
      });
      
      if (!room.player1) {
        room.state.gameStarted = false;
      }
    }

    io.emit('server-stats-update', {
      totalRooms: Array.from(rooms.keys()).length,
      activePlayers: io.engine.clientsCount
    });
  });

  // Ошибки
  socket.on('error', (error) => {
    console.error('❌ Ошибка сокета:', error);
  });
});

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  
  return code;
}

function getTaskName(diceNumber) {
  const tasks = {
    1: 'Кухня',
    2: 'Бар',
    3: 'Знания',
    4: 'Ситуация',
    5: 'Сервис',
    6: 'Продажи'
  };
  return tasks[diceNumber] || 'Неизвестное задание';
}

server.on('error', (error) => {
  console.error('❌ Ошибка сервера:', error);
});

process.on('SIGINT', () => {
  console.log('🛑 Получен SIGINT. Завершаем работу сервера...');
  
  io.emit('server-shutdown', {
    message: 'Сервер выключается. Игра будет завершена.',
    timestamp: new Date().toISOString()
  });
  
  setTimeout(() => {
    server.close(() => {
      console.log('✅ Сервер успешно остановлен');
      process.exit(0);
    });
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log('🛑 Получен SIGTERM. Завершаем работу сервера...');
  
  io.emit('server-shutdown', {
    message: 'Сервер выключается. Игра будет завершена.',
    timestamp: new Date().toISOString()
  });
  
  setTimeout(() => {
    server.close(() => {
      console.log('✅ Сервер успешно остановлен');
      process.exit(0);
    });
  }, 1000);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🌐 HTTP доступен на http://0.0.0.0:${PORT}`);
  console.log(`🔗 WebSocket доступен на ws://0.0.0.0:${PORT}`);
  console.log(`📊 Статистика доступна на http://0.0.0.0:${PORT}/stats`);
  console.log(`❤️  Проверка здоровья на http://0.0.0.0:${PORT}/health`);
  console.log(`👑 Админ-панель доступна на http://0.0.0.0:${PORT}/admin.html`);
});
