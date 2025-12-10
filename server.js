[file name]: server.js
[file content begin]
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

// Загрузка вопросов
let cardsData = {};
try {
  const cardsPath = path.join(__dirname, 'public', 'cards.json');
  const rawData = fs.readFileSync(cardsPath, 'utf8');
  cardsData = JSON.parse(rawData);
  console.log('✅ Вопросы загружены из cards.json');
} catch (error) {
  console.error('❌ Ошибка загрузки вопросов:', error.message);
  cardsData = {
    categories: {
      "1": [{ question: "Демо вопрос 1", instruction: "Инструкция 1" }],
      "2": [{ question: "Демо вопрос 2", instruction: "Инструкция 2" }],
      "3": [{ question: "Демо вопрос 3", instruction: "Инструкция 3" }],
      "4": [{ question: "Демо вопрос 4", instruction: "Инструкция 4" }],
      "5": [{ question: "Демо вопрос 5", instruction: "Инструкция 5" }],
      "6": [{ question: "Демо вопрос 6", instruction: "Инструкция 6" }]
    }
  };
}

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
        diceResult: 0,
        currentQuestion: null
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
    
    // Выбираем случайный вопрос из категории
    const category = diceResult.toString();
    const questions = cardsData.categories[category];
    let randomQuestion = null;
    
    if (questions && questions.length > 0) {
      randomQuestion = questions[Math.floor(Math.random() * questions.length)];
    } else {
      randomQuestion = {
        question: `Вопрос для категории ${diceResult}`,
        instruction: "Ответьте на вопрос"
      };
    }
    
    // Добавляем dice к вопросу для отображения
    randomQuestion.dice = diceResult;
    
    room.state.diceResult = diceResult;
    room.state.currentQuestion = randomQuestion;
    room.lastActivity = Date.now();

    // Отправляем результат всем в комнате
    io.to(roomCode).emit('dice-rolled', {
      dice: diceResult,
      player: currentPlayer,
      playerName: currentPlayer === 1 ? room.player1?.name : room.player2?.name,
      question: randomQuestion
    });

    // Также отправляем отдельное событие с вопросом для синхронизации
    io.to(roomCode).emit('question-updated', randomQuestion);
    
    // Обновляем состояние игры у всех
    io.to(roomCode).emit('game-updated', room.state);

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
    if (!roomCode || (role !== 'master' && role !== 'local')) return;
    
    const room = rooms.get(roomCode);
    if (room) {
      room.state = { ...room.state, ...gameState };
      room.lastActivity = Date.now();
      io.to(roomCode).emit('game-updated', room.state);
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
      room.state.currentQuestion = null;
      room.lastActivity = Date.now();
      
      io.to(roomCode).emit('turn-changed', {
        currentPlayer: room.state.currentPlayer,
        playerName: room.state.currentPlayer === 1 ? room.player1?.name : room.player2?.name
      });
      
      // Обновляем состояние игры у всех
      io.to(roomCode).emit('game-updated', room.state);
    }
  });

  // Сообщения в чат
  socket.on('send-message', (data) => {
    const { roomCode, playerName } = socket.data;
    if (roomCode && playerName) {
      io.to(roomCode).emit('new-message', {
        sender: playerName,
        message: data.message || data,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  // Ping для поддержания соединения
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
[file content end]
