const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

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

// API для проверки здоровья
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    rooms: Array.from(rooms.keys()).length
  });
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Хранилище комнат
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('🎮 Новый игрок подключен:', socket.id);

  // Создание комнаты
  socket.on('create-room', (playerName) => {
    const roomCode = generateRoomCode();
    
    rooms.set(roomCode, {
      master: { id: socket.id, name: playerName },
      player1: null,
      player2: null,
      state: {
        currentPlayer: 1,
        scores: { 1: 0, 2: 0 },
        positions: { 1: 0, 2: 0 },
        diceResult: 0
      },
      lastActivity: Date.now()
    });

    socket.join(roomCode);
    socket.data = {
      roomCode,
      role: 'master',
      playerName,
      id: socket.id
    };

    socket.emit('room-created', {
      roomCode,
      role: 'master',
      playerName
    });

    console.log(`✅ Комната создана: ${roomCode}, ведущий: ${playerName}`);
  });

  // Присоединение к комнате
  socket.on('join-room', ({ roomCode, playerName, role }) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    let assignedRole = role;
    let success = false;
    
    if (role === 'player1' && !room.player1) {
      room.player1 = { id: socket.id, name: playerName };
      success = true;
    } else if (role === 'player2' && !room.player2) {
      room.player2 = { id: socket.id, name: playerName };
      success = true;
    } else {
      // Автоназначение
      if (!room.player1) {
        assignedRole = 'player1';
        room.player1 = { id: socket.id, name: playerName };
        success = true;
      } else if (!room.player2) {
        assignedRole = 'player2';
        room.player2 = { id: socket.id, name: playerName };
        success = true;
      }
    }

    if (!success) {
      socket.emit('error', { message: 'Комната заполнена' });
      return;
    }

    socket.join(roomCode);
    socket.data = {
      roomCode,
      role: assignedRole,
      playerName,
      id: socket.id
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
      }
    });

    // Уведомляем всех
    io.to(roomCode).emit('player-joined', {
      playerName,
      role: assignedRole,
      players: {
        master: room.master.name,
        player1: room.player1?.name,
        player2: room.player2?.name
      }
    });

    console.log(`✅ ${playerName} присоединился как ${assignedRole} в комнату ${roomCode}`);
  });

  // Проверка комнаты
  socket.on('check-room', (roomCode) => {
    const room = rooms.get(roomCode);
    socket.emit('room-status', {
      exists: !!room,
      players: room ? {
        master: !!room.master,
        player1: !!room.player1,
        player2: !!room.player2
      } : null
    });
  });

  // Бросок кубика
 // В событии roll-dice замените текущий код на:
socket.on('roll-dice', () => {
    const { roomCode, role } = socket.data;
    if (!roomCode) return;
    
    const room = rooms.get(roomCode);
    if (!room) return;

    // Только текущий игрок может бросать
    const currentPlayer = room.state.currentPlayer;
    const canRoll = 
        (role === 'player1' && currentPlayer === 1) ||
        (role === 'player2' && currentPlayer === 2);

    if (!canRoll) {
        socket.emit('error', { message: 'Сейчас не ваш ход' });
        return;
    }

    const diceResult = Math.floor(Math.random() * 6) + 1;
    
    // Выбираем случайную карточку из соответствующей категории
    const categories = {
        1: ['Кухня', [/* вопросы для кухни */]],
        2: ['Бар', [/* вопросы для бара */]],
        3: ['Знания', [/* вопросы для знаний */]],
        4: ['Ситуация', [/* вопросы для ситуации */]],
        5: ['Сервис', [/* вопросы для сервиса */]],
        6: ['Продажи', [/* вопросы для продаж */]]
    };
    
    // Здесь должна быть ваша логика выбора карточки
    // Для примера, просто отправляем категорию
    room.state.diceResult = diceResult;
    room.state.currentCardCategory = diceResult;
    room.lastActivity = Date.now();

    // Отправляем результат всем в комнате
    io.to(roomCode).emit('dice-rolled', {
        dice: diceResult,
        player: currentPlayer,
        playerName: currentPlayer === 1 ? room.player1?.name : room.player2?.name,
        cardCategory: diceResult
    });

    console.log(`🎲 В комнате ${roomCode} выброшен ${diceResult}`);
});
  // Игрок завершил ответ
  socket.on('answer-completed', () => {
    const { roomCode, role } = socket.data;
    if (!roomCode) return;
    
    console.log(`✅ Игрок ${role} завершил ответ в комнате ${roomCode}`);
  });

  // Обновление состояния игры
  socket.on('update-game', (gameState) => {
    const { roomCode, role } = socket.data;
    if (!roomCode || role !== 'master') return;
    
    const room = rooms.get(roomCode);
    if (room) {
      room.state = gameState;
      room.lastActivity = Date.now();
      socket.to(roomCode).emit('game-updated', gameState);
    }
  });

  // Следующий ход
  socket.on('next-turn', () => {
    const { roomCode, role } = socket.data;
    if (!roomCode || role !== 'master') return;
    
    const room = rooms.get(roomCode);
    if (room) {
      room.state.currentPlayer = room.state.currentPlayer === 1 ? 2 : 1;
      room.state.diceResult = 0;
      room.lastActivity = Date.now();
      
      io.to(roomCode).emit('turn-changed', {
        currentPlayer: room.state.currentPlayer,
        playerName: room.state.currentPlayer === 1 ? room.player1?.name : room.player2?.name
      });
    }
  });

  // Сообщения в чат
// Сообщения в чат
socket.on('send-message', (message) => {
    const { roomCode, playerName } = socket.data;
    if (roomCode && playerName) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        io.to(roomCode).emit('new-message', {
            sender: playerName,
            message: message,
            time: time
        });
    }
});

  // Отключение
  socket.on('disconnect', () => {
    const { roomCode, role, playerName } = socket.data;
    console.log(`👋 Отключился: ${playerName || socket.id}, роль: ${role}`);
    
    if (!roomCode) return;
    
    const room = rooms.get(roomCode);
    if (!room) return;

    if (role === 'master') {
      // Удаляем комнату
      rooms.delete(roomCode);
      io.to(roomCode).emit('room-closed', 'Ведущий покинул игру');
      console.log(`🗑️ Комната ${roomCode} удалена`);
    } else if (role === 'player1') {
      room.player1 = null;
      io.to(roomCode).emit('player-left', { role: 'player1', playerName });
    } else if (role === 'player2') {
      room.player2 = null;
      io.to(roomCode).emit('player-left', { role: 'player2', playerName });
    }
  });
});

// Генератор кода комнаты
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🌐 WebSocket доступен на ws://0.0.0.0:${PORT}`);
});
// Обновите обработчик update-game:
socket.on('update-game', (gameState) => {
    const { roomCode, role } = socket.data;
    if (!roomCode || role !== 'master') return;
    
    const room = rooms.get(roomCode);
    if (room) {
        room.state = gameState;
        room.lastActivity = Date.now();
        // Рассылаем обновление всем в комнате
        io.to(roomCode).emit('game-updated', gameState);
    }
});

