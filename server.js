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

// API для редактирования вопросов
app.get('/api/cards', (req, res) => {
  try {
    const cardsData = fs.readFileSync(path.join(__dirname, 'cards.json'), 'utf8');
    res.json(JSON.parse(cardsData));
  } catch (error) {
    res.status(500).json({ error: 'Не удалось загрузить вопросы' });
  }
});

app.post('/api/cards', (req, res) => {
  try {
    fs.writeFileSync(
      path.join(__dirname, 'cards.json'), 
      JSON.stringify(req.body, null, 2),
      'utf8'
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Не удалось сохранить вопросы' });
  }
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница администратора
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Хранилище комнат
const rooms = new Map();

// Очистка неактивных комнат каждые 5 минут
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 минут
  
  for (const [roomCode, room] of rooms.entries()) {
    if (now - room.lastActivity > timeout) {
      console.log(`🗑️ Удалена неактивная комната: ${roomCode}`);
      rooms.delete(roomCode);
      
      // Уведомляем всех в комнате
      io.to(roomCode).emit('room-closed', 'Комната удалена из-за неактивности');
      io.in(roomCode).socketsLeave(roomCode);
    }
  }
}, 5 * 60 * 1000);

io.on('connection', (socket) => {
  console.log('🎮 Новый игрок подключен:', socket.id);
  
  // Отправляем статистику при подключении
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
        gameStarted: false
      },
      createdAt: Date.now(),
      lastActivity: Date.now(),
      chatHistory: []
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

    // Обновляем статистику для всех
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

    // Проверяем, не присоединяется ли уже подключенный игрок
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

    // Отправляем историю чата новому игроку
    if (room.chatHistory.length > 0) {
      socket.emit('chat-history', room.chatHistory.slice(-50)); // Последние 50 сообщений
    }

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

    // Обновляем статистику для всех
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

    // Проверяем, началась ли игра
    if (!room.state.gameStarted) {
      socket.emit('error', { message: 'Игра еще не началась. Ожидайте подключения всех игроков.' });
      return;
    }

    // Только текущий игрок может бросать
    const currentPlayer = room.state.currentPlayer;
    const canRoll = 
      (role === 'player1' && currentPlayer === 1) ||
      (role === 'player2' && currentPlayer === 2);

    if (!canRoll) {
      socket.emit('error', { message: 'Сейчас не ваш ход' });
      return;
    }

    // Проверяем, не бросал ли уже кубик в этом ходе
    if (room.state.diceResult !== 0) {
      socket.emit('error', { message: 'Кубик уже брошен в этом ходе' });
      return;
    }

    const diceResult = Math.floor(Math.random() * 6) + 1;
    room.state.diceResult = diceResult;
    room.lastActivity = Date.now();

    // Отправляем результат всем в комнате
    io.to(roomCode).emit('dice-rolled', {
      dice: diceResult,
      player: currentPlayer,
      playerName: playerName,
      timestamp: new Date().toISOString(),
      taskType: getTaskName(diceResult)
    });

    // Добавляем сообщение в чат
    const chatMessage = {
      type: 'system',
      sender: 'Система',
      message: `${playerName} выбросил ${diceResult}!`,
      timestamp: new Date().toISOString()
    };
    room.chatHistory.push(chatMessage);
    io.to(roomCode).emit('new-message', chatMessage);

    console.log(`🎲 В комнате ${roomCode} выброшен ${diceResult} игроком ${playerName}`);
  });

  // Игрок завершил ответ
  socket.on('answer-completed', () => {
    const { roomCode, role, playerName } = socket.data;
    if (!roomCode) return;
    
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.lastActivity = Date.now();
    
    // Добавляем сообщение в чат
    const chatMessage = {
      type: 'system',
      sender: 'Система',
      message: `${playerName} завершил ответ`,
      timestamp: new Date().toISOString()
    };
    room.chatHistory.push(chatMessage);
    io.to(roomCode).emit('new-message', chatMessage);
    
    console.log(`✅ Игрок ${playerName} завершил ответ в комнате ${roomCode}`);
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
      room.state = { ...room.state, ...gameState };
      room.lastActivity = Date.now();
      
      // Отправляем обновление всем в комнате
      socket.to(roomCode).emit('game-updated', room.state);
      
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
        
        // Добавляем сообщение в чат
        const chatMessage = {
          type: 'system',
          sender: 'Система',
          message: `🎉 Победила команда ${winner} (${winnerName})! Игра завершена.`,
          timestamp: new Date().toISOString()
        };
        room.chatHistory.push(chatMessage);
        io.to(roomCode).emit('new-message', chatMessage);
        
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
      room.state.timer = 60;
      room.lastActivity = Date.now();
      
      const nextPlayerName = room.state.currentPlayer === 1 ? room.player1?.name : room.player2?.name;
      
      io.to(roomCode).emit('turn-changed', {
        currentPlayer: room.state.currentPlayer,
        playerName: nextPlayerName,
        timestamp: new Date().toISOString()
      });
      
      // Добавляем сообщение в чат
      const chatMessage = {
        type: 'system',
        sender: 'Система',
        message: `Теперь ходит ${nextPlayerName}`,
        timestamp: new Date().toISOString()
      };
      room.chatHistory.push(chatMessage);
      io.to(roomCode).emit('new-message', chatMessage);
      
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
        gameStarted: true
      };
      room.lastActivity = Date.now();
      
      io.to(roomCode).emit('game-reset', {
        message: 'Игра сброшена. Начинаем заново!',
        gameState: room.state,
        playerName: room.player1?.name
      });
      
      // Добавляем сообщение в чат
      const chatMessage = {
        type: 'system',
        sender: 'Система',
        message: 'Игра сброшена. Начинаем заново!',
        timestamp: new Date().toISOString()
      };
      room.chatHistory.push(chatMessage);
      io.to(roomCode).emit('new-message', chatMessage);
      
      console.log(`🔄 Игра сброшена в комнате ${roomCode}`);
    }
  });

  // Сообщения в чат
  socket.on('send-message', (message) => {
    const { roomCode, playerName } = socket.data;
    if (!roomCode || !playerName) {
      socket.emit('error', { message: 'Вы не в комнате' });
      return;
    }
    
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }
    
    // Проверяем длину сообщения
    if (message.length > 500) {
      socket.emit('error', { message: 'Сообщение слишком длинное (макс. 500 символов)' });
      return;
    }
    
    // Проверяем на спам (не более 5 сообщений за 10 секунд)
    const userMessages = room.chatHistory.filter(m => 
      m.sender === playerName && 
      Date.now() - new Date(m.timestamp).getTime() < 10000
    );
    
    if (userMessages.length >= 5) {
      socket.emit('error', { message: 'Слишком много сообщений. Подождите немного.' });
      return;
    }
    
    const chatMessage = {
      type: 'player',
      sender: playerName,
      message: message,
      timestamp: new Date().toISOString()
    };
    
    room.chatHistory.push(chatMessage);
    room.lastActivity = Date.now();
    
    // Отправляем всем в комнате
    io.to(roomCode).emit('new-message', chatMessage);
    
    console.log(`💬 Чат ${roomCode}: ${playerName}: ${message}`);
  });

  // Запрос истории чата
  socket.on('get-chat-history', () => {
    const { roomCode } = socket.data;
    if (!roomCode) return;
    
    const room = rooms.get(roomCode);
    if (room) {
      socket.emit('chat-history', room.chatHistory.slice(-100)); // Последние 100 сообщений
    }
  });

  // Пинг для поддержания соединения
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
      
      // Если остался только ведущий, помечаем игру как не начавшуюся
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
      
      // Если остался только ведущий, помечаем игру как не начавшейся
      if (!room.player1) {
        room.state.gameStarted = false;
      }
    }

    // Обновляем статистику
    io.emit('server-stats-update', {
      totalRooms: Array.from(rooms.keys()).length,
      activePlayers: io.engine.clientsCount
    });
  });

  // Обработка ошибок
  socket.on('error', (error) => {
    console.error('❌ Ошибка сокета:', error);
  });
});

// Генератор кода комнаты
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Проверяем уникальность кода
  if (rooms.has(code)) {
    return generateRoomCode(); // Рекурсивно генерируем новый код
  }
  
  return code;
}

// Получение названия задания по номеру кубика
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

// Обработка ошибок сервера
server.on('error', (error) => {
  console.error('❌ Ошибка сервера:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Получен SIGINT. Завершаем работу сервера...');
  
  // Отправляем всем клиентам сообщение о закрытии
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
});
