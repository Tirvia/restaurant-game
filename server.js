const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Настройка CORS для Socket.io
const io = socketIo(server, {
  cors: {
    origin: "*", // В продакшене заменить на домены фронтенда
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Раздаём статические файлы из папки public
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

// Очистка старых комнат каждые 10 минут
setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000; // 2 часа
  let deleted = 0;
  
  for (const [roomCode, room] of rooms.entries()) {
    if (room.lastActivity && (now - room.lastActivity > maxAge)) {
      rooms.delete(roomCode);
      deleted++;
    }
  }
  
  if (deleted > 0) {
    console.log(`🧹 Очищено ${deleted} неактивных комнат`);
  }
}, 10 * 60 * 1000);

io.on('connection', (socket) => {
  console.log('🎮 Новое подключение:', socket.id);

  // Создание комнаты (Ведущий)
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
      playerName,
      players: {
        master: playerName,
        player1: null,
        player2: null
      }
    });

    console.log(`✅ Комната создана: ${roomCode}, ведущий: ${playerName}`);
  });

  // Присоединение к комнате (Игроки)
  socket.on('join-room', ({ roomCode, playerName, role }) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Проверяем, доступна ли роль
    let assignedRole = role;
    let success = false;
    
    switch(role) {
      case 'player1':
        if (!room.player1) {
          room.player1 = { id: socket.id, name: playerName };
          success = true;
        }
        break;
      case 'player2':
        if (!room.player2) {
          room.player2 = { id: socket.id, name: playerName };
          success = true;
        }
        break;
      default:
        // Автоназначение роли
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

    // Обновляем активность комнаты
    room.lastActivity = Date.now();

    // Отправляем успешное подключение
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

    // Уведомляем всех в комнате о новом игроке
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

  // Проверка существования комнаты
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
  socket.on('roll-dice', () => {
    const { roomCode, role } = socket.data;
    if (!roomCode) return;
    
    const room = rooms.get(roomCode);
    if (!room) return;

    // Только текущий игрок или ведущий может бросать
    const currentPlayer = room.state.currentPlayer;
    const canRoll = 
      (role === 'master') ||
      (currentPlayer === 1 && role === 'player1') ||
      (currentPlayer === 2 && role === 'player2');

    if (!canRoll) {
      socket.emit('error', { message: 'Сейчас не ваш ход' });
      return;
    }

    const diceResult = Math.floor(Math.random() * 6) + 1;
    room.state.diceResult = diceResult;
    room.lastActivity = Date.now();

    io.to(roomCode).emit('dice-rolled', {
      dice: diceResult,
      player: currentPlayer,
      playerName: currentPlayer === 1 ? room.player1?.name : room.player2?.name
    });

    console.log(`🎲 В комнате ${roomCode} выброшен ${diceResult}`);
  });

  // Обновление состояния игры (от ведущего)
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

  // Чат
  socket.on('send-message', (message) => {
    const { roomCode, playerName } = socket.data;
    if (roomCode) {
      io.to(roomCode).emit('new-message', {
        sender: playerName,
        message: message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  // Отслеживание активности
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // Отключение
  socket.on('disconnect', () => {
    const { roomCode, role, playerName } = socket.data;
    console.log(`👋 Отключился: ${playerName || socket.id}, роль: ${role}`);
    
    if (!roomCode) return;
    
    const room = rooms.get(roomCode);
    if (!room) return;

    if (role === 'master') {
      // Удаляем комнату при отключении ведущего
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

// Порт из переменной окружения Railway или 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🌐 WebSocket доступен на ws://0.0.0.0:${PORT}`);
});