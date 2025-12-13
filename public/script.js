// Инициализация игры
class Game {
    constructor() {
        this.currentPlayer = 1;
        this.scores = { 1: 0, 2: 0 };
        this.positions = { 1: 0, 2: 0 };
        this.diceResult = 0;
        this.timer = 60;
        this.timerInterval = null;
        this.cards = {
            1: [], 2: [], 3: [], 4: [], 5: [], 6: []
        };
        
        this.selectedPoints = { 1: 0, 2: 0 };
        this.pointsApplied = false;
        this.applyButtonClicked = false;
        this.diceRolledInCurrentTurn = false;
        
        this.boardWidth = 800;
        this.boardHeight = 600;
        this.cellRadius = 20;
        
        this.specialZoneQueue = [];
        this.showingSpecialZone = false;
        
        this.triggeredZonesInTurn = {
            1: new Set(),
            2: new Set()
        };
        
        this.zoneSettings = {
            'grams': { 
                name: 'Зона граммовки', 
                positive: 2, 
                negative: -2,
                question: "Назовите точный вес ингредиента для этого блюда в граммах."
            },
            'description': { 
                name: 'Зона красочного описания', 
                positive: 1, 
                negative: -3,
                question: "Дайте красочное описание этого блюда или напитка, чтобы вызвать аппетит у гостя."
            },
            'allergy': { 
                name: 'Зона аллергии', 
                positive: 1, 
                negative: -5,
                question: "Можно ли убрать этот ингредиент из блюда без ущерба для вкуса? Почему?"
            }
        };
        
        // Свойства для онлайн-игры
        this.role = null;
        this.roomCode = null;
        this.playerName = '';
        this.socket = null;
        this.isConnected = false;
        this.serverUrl = window.location.origin;
        
        // Для синхронизации
        this.currentQuestion = null;
        this.currentQuestionCategory = null;
        
        // Режим игры
        this.gameMode = null; // 'online' или 'local'
        
        this.init();
    }

    async init() {
        console.log('🚀 Инициализация игры...');
        
        this.gameContainer = document.querySelector('.game-container');
        
        // Запрашиваем режим игры
        console.log('👤 Выбираем режим игры...');
        await this.showGameModeSelection();
        console.log('✅ Режим выбран:', this.gameMode);
        
        if (this.gameMode === 'online') {
            await this.showRoleSelection();
        } else {
            // Локальный режим
            this.role = 'local';
            this.playerName = 'Локальный игрок';
            this.startLocalGame();
        }
    }

    async showGameModeSelection() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'role-selection-modal';
            modal.innerHTML = `
                <div class="role-selection-content">
                    <h2><i class="fas fa-gamepad"></i> Выберите режим игры</h2>
                    
                    <div class="mode-options">
                        <div class="mode-option">
                            <button class="mode-btn" data-mode="online">
                                <i class="fas fa-globe"></i>
                                <div>
                                    <strong>Онлайн-игра</strong>
                                    <small>Игра по сети с друзьями</small>
                                </div>
                            </button>
                        </div>
                        
                        <div class="mode-option">
                            <button class="mode-btn" data-mode="local">
                                <i class="fas fa-desktop"></i>
                                <div>
                                    <strong>Один компьютер</strong>
                                    <small>Игра на одном устройстве</small>
                                </div>
                            </button>
                        </div>
                    </div>
                    
                    <div class="game-info">
                        <p><i class="fas fa-info-circle"></i> Для онлайн-игры нужно 3 человека: ведущий и 2 игрока</p>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const modeButtons = modal.querySelectorAll('.mode-btn');
            
            modeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.gameMode = btn.dataset.mode;
                    modal.remove();
                    resolve();
                });
            });
        });
    }

    startLocalGame() {
        console.log('🖥️ Запуск локальной игры...');
        
        // Скрываем видео контейнер
        document.querySelector('.video-container').style.display = 'none';
        
        // Настраиваем интерфейс для локальной игры
        this.setupLocalInterface();
        
        // Инициализируем остальные компоненты
        this.continueGameInitialization();
        
        this.showNotification('Локальная игра запущена! Вы играете на одном устройстве.', 'info');
    }

    setupLocalInterface() {
        // Скрываем видео и связанные элементы
        const videoContainer = document.querySelector('.video-container');
        if (videoContainer) videoContainer.style.display = 'none';
        
        // Панель ведущего всегда видна в локальном режиме
        const panel = document.getElementById('master-panel');
        if (panel) panel.style.display = 'block';
        
        // В локальном режиме все могут бросать кубик
        this.updateRollButton();
    }

    async showRoleSelection() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'role-selection-modal';
            modal.innerHTML = `
                <div class="role-selection-content">
                    <h2><i class="fas fa-gamepad"></i> Подключение к игре</h2>
                    
                    <!-- Ввод имени -->
                    <div class="name-input-section">
                        <label for="player-name"><i class="fas fa-user"></i> Введите ваше имя:</label>
                        <input type="text" id="player-name" placeholder="Ваше имя" maxlength="20" autocomplete="off" class="large-input">
                    </div>
                    
                    <!-- Выбор роли -->
                    <div class="role-options">
                        <h3><i class="fas fa-user-tag"></i> Выберите роль:</h3>
                        
                        <div class="role-option">
                            <input type="radio" id="role-master" name="role" value="master">
                            <label for="role-master" class="role-label">
                                <i class="fas fa-crown"></i>
                                <div>
                                    <strong>Ведущий</strong>
                                    <small>Создаёт комнату и управляет игрой</small>
                                </div>
                            </label>
                        </div>
                        
                        <div class="role-option">
                            <input type="radio" id="role-player1" name="role" value="player1">
                            <label for="role-player1" class="role-label">
                                <i class="fas fa-user-friends"></i>
                                <div>
                                    <strong>Игрок 1</strong>
                                    <small>Команда 1 (синие)</small>
                                </div>
                            </label>
                        </div>
                        
                        <div class="role-option">
                            <input type="radio" id="role-player2" name="role" value="player2">
                            <label for="role-player2" class="role-label">
                                <i class="fas fa-user-friends"></i>
                                <div>
                                    <strong>Игрок 2</strong>
                                    <small>Команда 2 (оранжевые)</small>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Секция для ведущего -->
                    <div id="master-section" class="role-section" style="display: none;">
                        <button id="create-room-btn" class="btn create-btn">
                            <i class="fas fa-plus-circle"></i> Создать новую комнату
                        </button>
                        <div id="room-info" class="room-info" style="display: none;">
                            <div class="room-code-display">
                                <i class="fas fa-door-open"></i>
                                <div>
                                    <p>Код комнаты:</p>
                                    <h3 id="room-code-display"></h3>
                                </div>
                            </div>
                            <p class="small">Поделитесь этим кодом с игроками</p>
                            <button id="copy-code-btn" class="btn copy-btn">
                                <i class="fas fa-copy"></i> Копировать код
                            </button>
                        </div>
                    </div>
                    
                    <!-- Секция для игроков -->
                    <div id="player-section" class="role-section" style="display: none;">
                        <div class="input-group">
                            <input type="text" id="room-code-input" placeholder="Введите 6-значный код комнаты" maxlength="6" autocomplete="off" class="large-input code-input">
                            <button id="join-room-btn" class="btn join-btn">
                                <i class="fas fa-sign-in-alt"></i> Присоединиться
                            </button>
                        </div>
                        <div id="room-status" class="room-status"></div>
                    </div>
                    
                    <!-- Статус подключения -->
                    <div id="connection-status" class="connection-status">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span id="status-text">Подключение к серверу...</span>
                    </div>
                    
                    <!-- Информация об игре -->
                    <div class="game-info">
                        <p><i class="fas fa-info-circle"></i> Для игры нужно 3 человека: ведущий и 2 игрока</p>
                    </div>
                    
                    <button id="back-to-mode" class="btn back-btn">
                        <i class="fas fa-arrow-left"></i> Назад к выбору режима
                    </button>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Элементы DOM
            const nameInput = document.getElementById('player-name');
            const roleInputs = modal.querySelectorAll('input[name="role"]');
            const masterSection = modal.querySelector('#master-section');
            const playerSection = modal.querySelector('#player-section');
            const createBtn = modal.querySelector('#create-room-btn');
            const joinBtn = modal.querySelector('#join-room-btn');
            const roomCodeInput = document.getElementById('room-code-input');
            const statusDiv = modal.querySelector('#connection-status');
            const statusText = modal.querySelector('#status-text');
            const backBtn = modal.querySelector('#back-to-mode');
            
            // Фокус на поле ввода имени
            setTimeout(() => nameInput.focus(), 100);
            
            // Кнопка "Назад"
            backBtn.addEventListener('click', () => {
                modal.remove();
                this.showGameModeSelection().then(() => {
                    if (this.gameMode === 'online') {
                        this.showRoleSelection().then(resolve);
                    }
                });
            });
            
            // Подключаемся к серверу
            this.setupSocketConnection(modal, resolve);
            
            // Показать/скрыть секции при выборе роли
            roleInputs.forEach(input => {
                input.addEventListener('change', () => {
                    this.role = input.value;
                    
                    if (this.role === 'master') {
                        masterSection.style.display = 'block';
                        playerSection.style.display = 'none';
                        statusText.textContent = 'Готов к созданию комнаты';
                    } else {
                        masterSection.style.display = 'none';
                        playerSection.style.display = 'block';
                        statusText.textContent = 'Введите код комнаты';
                        setTimeout(() => roomCodeInput.focus(), 100);
                    }
                });
            });
            
            // Создание комнаты
            createBtn.addEventListener('click', async () => {
                const playerName = nameInput.value.trim();
                if (!playerName) {
                    this.showAlert('Пожалуйста, введите ваше имя');
                    return;
                }
                
                if (!this.role) {
                    this.showAlert('Пожалуйста, выберите роль');
                    return;
                }
                
                this.playerName = playerName;
                
                statusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Создаем комнату...';
                this.socket.emit('create-room', playerName);
            });
            
            // Присоединение к комнате
            joinBtn.addEventListener('click', () => {
                const playerName = nameInput.value.trim();
                const roomCode = roomCodeInput.value.trim().toUpperCase();
                
                if (!playerName) {
                    this.showAlert('Пожалуйста, введите имя');
                    return;
                }
                
                if (roomCode.length !== 6) {
                    this.showAlert('Код комнаты должен содержать 6 символов');
                    return;
                }
                
                if (!this.role) {
                    this.showAlert('Пожалуйста, выберите роль');
                    return;
                }
                
                this.playerName = playerName;
                this.roomCode = roomCode;
                
                statusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Присоединяемся к комнате...';
                this.socket.emit('join-room', {
                    roomCode: roomCode,
                    playerName: playerName,
                    role: this.role
                });
            });
            
            // Автоподключение при нажатии Enter
            nameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const selectedRole = modal.querySelector('input[name="role"]:checked');
                    if (selectedRole) {
                        if (selectedRole.value === 'master') {
                            createBtn.click();
                        } else {
                            roomCodeInput.focus();
                        }
                    }
                }
            });
            
            roomCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    joinBtn.click();
                }
            });
            
            // Проверка комнаты при вводе кода
            roomCodeInput.addEventListener('input', () => {
                const code = roomCodeInput.value.trim().toUpperCase();
                roomCodeInput.value = code; // Автоматически переводим в верхний регистр
                if (code.length === 6 && this.socket) {
                    this.socket.emit('check-room', code);
                }
            });
        });
    }

    setupSocketConnection(modal, resolve) {
        console.log('🔌 Подключаемся к серверу:', this.serverUrl);
        
        const statusText = modal.querySelector('#status-text');
        const statusDiv = modal.querySelector('#connection-status');
        
        this.socket = io(this.serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        // Обработчики событий Socket.io
        this.socket.on('connect', () => {
            this.isConnected = true;
            statusText.innerHTML = '<i class="fas fa-check-circle"></i> Подключено к серверу';
            statusDiv.style.background = 'rgba(76, 175, 80, 0.2)';
            statusDiv.style.color = '#4CAF50';
            console.log('✅ Подключено к серверу');
        });
        
        this.socket.on('connect_error', (error) => {
            statusText.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Ошибка подключения`;
            statusDiv.style.background = 'rgba(244, 67, 54, 0.2)';
            statusDiv.style.color = '#f44336';
            console.error('❌ Ошибка подключения:', error);
        });
        
        this.socket.on('room-created', (data) => {
            this.roomCode = data.roomCode;
            this.playerName = data.playerName;
            
            modal.querySelector('#room-info').style.display = 'block';
            modal.querySelector('#room-code-display').textContent = data.roomCode;
            
            modal.querySelector('#copy-code-btn').addEventListener('click', () => {
                navigator.clipboard.writeText(data.roomCode);
                const copyBtn = modal.querySelector('#copy-code-btn');
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
                copyBtn.style.background = '#4CAF50';
                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                    copyBtn.style.background = '';
                }, 2000);
            });
            
            statusText.innerHTML = '<i class="fas fa-check-circle"></i> Комната создана!';
            
            setTimeout(() => {
                modal.remove();
                this.continueGameInitialization().then(resolve);
            }, 2000);
        });
        
        this.socket.on('join-success', (data) => {
            this.roomCode = data.roomCode;
            this.playerName = data.playerName;
            this.role = data.role;
            
            if (data.gameState) {
                this.currentPlayer = data.gameState.currentPlayer;
                this.scores = data.gameState.scores || this.scores;
                this.positions = data.gameState.positions || this.positions;
                this.diceResult = data.gameState.diceResult || 0;
            }
            
            statusText.innerHTML = '<i class="fas fa-check-circle"></i> Вы в игре!';
            
            setTimeout(() => {
                modal.remove();
                this.continueGameInitialization().then(resolve);
            }, 2000);
        });
        
        this.socket.on('player-joined', (data) => {
            this.showNotification(`${data.playerName} присоединился как ${this.getRoleNameFromType(data.role)}`, 'info');
            this.updateVideoPlaceholders(data.players);
        });
        
        this.socket.on('player-left', (data) => {
            this.showNotification(`${data.playerName} покинул игру`, 'warning');
            
            // Обновляем видео-плейсхолдеры
            if (data.role === 'player1') {
                document.querySelector('#video-team1 .video-placeholder p').textContent = 'Команда 1';
            } else if (data.role === 'player2') {
                document.querySelector('#video-team2 .video-placeholder p').textContent = 'Команда 2';
            }
        });
        
        this.socket.on('room-closed', (message) => {
            this.showNotification(message, 'error');
            setTimeout(() => {
                location.reload(); // Перезагружаем страницу
            }, 3000);
        });
        
        this.socket.on('dice-rolled', (data) => {
            this.diceResult = data.dice;
            const diceElement = document.getElementById('dice');
            if (diceElement) {
                diceElement.textContent = data.dice;
                diceElement.classList.add('rolling');
                
                setTimeout(() => {
                    diceElement.classList.remove('rolling');
                }, 500);
            }
            
            // Обновляем тип задачи
            const taskNames = {
                1: 'Кухня', 2: 'Бар', 3: 'Знания', 
                4: 'Ситуация', 5: 'Сервис', 6: 'Продажи'
            };
            
            const taskTypeElement = document.getElementById('task-type');
            if (taskTypeElement) {
                taskTypeElement.textContent = taskNames[data.dice];
            }
            
            this.showNotification(`${data.playerName} выбросил ${data.dice}!`, 'info');
        });
        
        this.socket.on('question-show', (data) => {
            // Все участники получают одинаковый вопрос
            this.showQuestion(data.question, data.category, data.instruction);
        });
        
        this.socket.on('game-updated', (gameState) => {
            this.scores = gameState.scores || this.scores;
            this.positions = gameState.positions || this.positions;
            this.currentPlayer = gameState.currentPlayer || this.currentPlayer;
            this.diceResult = gameState.diceResult || this.diceResult;
            
            this.updateScores();
            this.updatePieces();
            this.updateTurnIndicator();
            
            const diceElement = document.getElementById('dice');
            if (diceElement && this.diceResult > 0) {
                diceElement.textContent = this.diceResult;
            }
        });
        
        this.socket.on('turn-changed', (data) => {
            this.currentPlayer = data.currentPlayer;
            this.diceRolledInCurrentTurn = false;
            this.updateTurnIndicator();
            this.updateRollButton();
            this.showNotification(`Сейчас ходит ${data.playerName}`, 'info');
        });
        
        this.socket.on('error', (error) => {
            this.showAlert(error.message || 'Произошла ошибка');
        });
        
        this.socket.on('room-status', (data) => {
            const roomStatus = modal.querySelector('#room-status');
            if (data.exists) {
                roomStatus.innerHTML = `<i class="fas fa-check-circle"></i> Комната найдена`;
                roomStatus.className = 'room-status found';
                
                // Показываем информацию о занятости ролей
                if (data.players) {
                    let statusText = '';
                    if (data.players.player1) statusText += 'Игрок 1 занят, ';
                    if (data.players.player2) statusText += 'Игрок 2 занят';
                    if (statusText) {
                        roomStatus.innerHTML += `<br><small>${statusText}</small>`;
                    }
                }
            } else {
                roomStatus.innerHTML = `<i class="fas fa-times-circle"></i> Комната не найдена`;
                roomStatus.className = 'room-status not-found';
            }
        });
    }

    async continueGameInitialization() {
        console.log('🎥 Инициализируем видео...');
        if (this.gameMode === 'online') {
            await this.initVideo();
        }
        
        console.log('🃏 Загружаем карты...');
        await this.loadCards();
        
        console.log('🎲 Создаем игровое поле...');
        this.createBoard();
        
        this.createZoneLabels();
        this.setupEventListeners();
        this.setupRoleInterface();
        
        this.drawBoard();
        this.updateScores();
        this.updatePieces();
        this.updateTurnIndicator();
        
        this.showNotification(`Игра началась! ${this.getWelcomeMessage()}`, 'info');
        
        console.log('🎮 Игра полностью инициализирована!');
    }

    async initVideo() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 320 },
                    height: { ideal: 240 },
                    facingMode: "user"
                },
                audio: false
            });
            
            const videoElement = document.createElement('video');
            videoElement.autoplay = true;
            videoElement.muted = true;
            videoElement.playsInline = true;
            videoElement.srcObject = stream;
            
            const roleMap = {
                'master': 'video-master',
                'player1': 'video-team1',
                'player2': 'video-team2'
            };
            
            const containerId = roleMap[this.role];
            if (containerId) {
                const container = document.getElementById(containerId);
                if (container) {
                    const placeholder = container.querySelector('.video-placeholder');
                    if (placeholder) {
                        const icon = placeholder.querySelector('i');
                        if (icon) icon.style.display = 'none';
                        
                        const text = placeholder.querySelector('p');
                        if (text) {
                            text.innerHTML = this.role === 'master' 
                                ? `<i class="fas fa-crown"></i> ${this.playerName} (Ведущий)`
                                : `<i class="fas fa-user"></i> ${this.playerName} (Команда ${this.role === 'player1' ? '1' : '2'})`;
                        }
                        
                        videoElement.style.width = '100%';
                        videoElement.style.height = '100%';
                        videoElement.style.objectFit = 'cover';
                        videoElement.style.borderRadius = '10px';
                        placeholder.appendChild(videoElement);
                    }
                }
            }

        } catch (error) {
            console.log('Камера недоступна:', error);
            this.createDemoVideos();
        }
    }

    updateVideoPlaceholders(players) {
        if (players.master && this.role !== 'master') {
            const masterPlaceholder = document.querySelector('#video-master .video-placeholder p');
            if (masterPlaceholder) {
                masterPlaceholder.innerHTML = `<i class="fas fa-crown"></i> ${players.master}`;
            }
        }

        if (players.player1 && this.role !== 'player1') {
            const player1Placeholder = document.querySelector('#video-team1 .video-placeholder p');
            if (player1Placeholder) {
                player1Placeholder.innerHTML = `<i class="fas fa-user"></i> ${players.player1}`;
            }
        }

        if (players.player2 && this.role !== 'player2') {
            const player2Placeholder = document.querySelector('#video-team2 .video-placeholder p');
            if (player2Placeholder) {
                player2Placeholder.innerHTML = `<i class="fas fa-user"></i> ${players.player2}`;
            }
        }
    }

    createDemoVideos() {
        const demoColors = {
            'master': '#FF9800',
            'player1': '#2196F3',
            'player2': '#FF5722'
        };
        
        Object.entries(demoColors).forEach(([role, color]) => {
            if (role !== this.role) {
                const roleMap = {
                    'master': 'video-master',
                    'player1': 'video-team1',
                    'player2': 'video-team2'
                };
                
                const containerId = roleMap[role];
                if (containerId) {
                    const container = document.getElementById(containerId);
                    if (container) {
                        const placeholder = container.querySelector('.video-placeholder');
                        if (placeholder) {
                            placeholder.style.background = `linear-gradient(135deg, ${color} 0%, ${this.darkenColor(color, 30)} 100%)`;
                            
                            const icon = placeholder.querySelector('i');
                            if (icon) {
                                icon.style.display = 'block';
                                icon.style.color = 'white';
                            }
                        }
                    }
                }
            }
        });
    }

    darkenColor(color, percent) {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        
        return "#" + (
            0x1000000 +
            (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)
        ).toString(16).slice(1);
    }

    getRoleNameFromType(roleType) {
        switch(roleType) {
            case 'master': return 'Ведущий';
            case 'player1': return 'Игрок 1';
            case 'player2': return 'Игрок 2';
            default: return 'Игрок';
        }
    }

    async loadCards() {
        // Загрузка вопросов из файла cards.json
        try {
            const response = await fetch('cards.json');
            if (response.ok) {
                const cardsData = await response.json();
                this.cards = cardsData.categories || this.cards;
                if (cardsData.zones) {
                    this.zoneSettings.grams.question = cardsData.zones.grams || this.zoneSettings.grams.question;
                    this.zoneSettings.description.question = cardsData.zones.description || this.zoneSettings.description.question;
                    this.zoneSettings.allergy.question = cardsData.zones.allergy || this.zoneSettings.allergy.question;
                }
                console.log('✅ Вопросы загружены из cards.json');
                return;
            }
        } catch (error) {
            console.log('Файл cards.json не найден, используем демо-вопросы');
        }
        
        // Демо-вопросы
        const demoCards = {
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
        };
        
        for (let i = 1; i <= 6; i++) {
            this.cards[i] = demoCards[i] || [{ question: "Вопрос для категории " + i, instruction: "Ответьте на вопрос" }];
        }
    }

    createBoard() {
        const container = document.getElementById('cells-container');
        if (!container) return;
        
        container.innerHTML = '';
        const positions = this.generateBoardPositions();
        
        for (let i = 0; i <= 40; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.id = `cell-${i}`;
            cell.dataset.number = `Клетка ${i}`;
            
            if (i === 0) {
                cell.textContent = 'СТАРТ';
            } else if (i === 40) {
                cell.textContent = 'ФИНИШ';
                cell.classList.add('finish', 'finish-big');
            } else {
                cell.textContent = i;
            }
            
            if (i === 0) {
                cell.classList.add('start');
            } else if (i === 40) {
                // Уже добавили классы выше
            } else if (i >= 11 && i <= 14) {
                cell.classList.add('grams');
            } else if (i >= 19 && i <= 22) {
                cell.classList.add('description');
            } else if (i >= 33 && i <= 36) {
                cell.classList.add('allergy');
            } else if ((i >= 26 && i <= 32) || (i >= 37 && i <= 39)) {
                cell.classList.add('red');
            } else {
                cell.classList.add('normal');
            }
            
            if (positions[i]) {
                cell.style.left = positions[i].x + 'px';
                cell.style.top = positions[i].y + 'px';
            }
            
            container.appendChild(cell);
        }

        this.updatePieces();
    }

    createZoneLabels() {
        const container = document.getElementById('cells-container');
        if (!container) return;
        
        // Надпись для зоны граммовки
        const gramsLabel = document.createElement('div');
        gramsLabel.className = 'zone-label';
        gramsLabel.style.cssText = `
            position: absolute;
            color: #4CAF50;
            font-size: 16px;
            font-weight: bold;
            z-index: 5;
            transform: rotate(-90deg);
            transform-origin: left top;
            white-space: nowrap;
            background: rgba(0, 0, 0, 0.7);
            padding: 2px 8px;
            border-radius: 3px;
            letter-spacing: normal;
            font-family: Arial, sans-serif;
        `;
        gramsLabel.textContent = 'Зона граммовки ±2';
        gramsLabel.style.left = '140px';
        gramsLabel.style.top = '490px';
        container.appendChild(gramsLabel);
        
        // Надпись для зоны красочного описания
        const descLabel = document.createElement('div');
        descLabel.className = 'zone-label';
        descLabel.style.cssText = `
            position: absolute;
            color: #9C27B0;
            font-size: 16px;
            font-weight: bold;
            z-index: 5;
            white-space: nowrap;
            background: rgba(0, 0, 0, 0.7);
            padding: 2px 8px;
            border-radius: 3px;
            border: 1px solid rgba(156, 39, 176, 0.5);
            letter-spacing: normal;
            font-family: Arial, sans-serif;
        `;
        descLabel.textContent = 'Зона красочного описания +1/-3';
        descLabel.style.left = '220px';
        descLabel.style.top = '30px';
        container.appendChild(descLabel);
        
        // Надпись для зоны аллергии
        const allergyLabel = document.createElement('div');
        allergyLabel.className = 'zone-label';
        allergyLabel.style.cssText = `
            position: absolute;
            color: #E91E63;
            font-size: 16px;
            font-weight: bold;
            z-index: 5;
            white-space: nowrap;
            background: rgba(0, 0, 0, 0.7);
            padding: 2px 8px;
            border-radius: 3px;
            border: 1px solid rgba(233, 30, 99, 0.5);
            letter-spacing: normal;
            font-family: Arial, sans-serif;
        `;
        allergyLabel.textContent = 'Зона аллергии +1/-5';
        allergyLabel.style.left = '620px';
        allergyLabel.style.top = '420px';
        container.appendChild(allergyLabel);
    }

    generateBoardPositions() {
        const positions = [];
        
        // Оригинальные позиции клеток
        positions[0] = { x: 300, y: 200 };
        positions[1] = { x: 380, y: 200 };
        positions[2] = { x: 460, y: 200 };
        positions[3] = { x: 540, y: 200 };
        positions[4] = { x: 540, y: 270 };
        positions[5] = { x: 540, y: 340 };
        positions[6] = { x: 520, y: 400 };
        positions[7] = { x: 480, y: 460 };
        positions[8] = { x: 420, y: 480 };
        positions[9] = { x: 350, y: 480 };
        positions[10] = { x: 280, y: 480 };
        positions[11] = { x: 220, y: 460 };
        positions[12] = { x: 170, y: 400 };
        positions[13] = { x: 150, y: 330 };
        positions[14] = { x: 150, y: 260 };
        positions[15] = { x: 150, y: 190 };
        positions[16] = { x: 150, y: 120 };
        positions[17] = { x: 155, y: 50 };
        positions[18] = { x: 190, y: 5 };
        positions[19] = { x: 240, y: -30 };
        positions[20] = { x: 300, y: -50 };
        positions[21] = { x: 360, y: -50 };
        positions[22] = { x: 420, y: -50 };
        positions[23] = { x: 475, y: -30 };
        positions[24] = { x: 510, y: 15 };
        positions[25] = { x: 540, y: 70 };
        
        // Круговая часть
        const circleCenterX = 800;
        const circleCenterY = 180;
        const circleRadius = 160;
        
        const totalSteps = 14;
        const totalAngle = 360;
        const angleStep = totalAngle / totalSteps;
        
        positions[26] = {
            x: circleCenterX + circleRadius * Math.cos(-120 * Math.PI / 180),
            y: circleCenterY + circleRadius * Math.sin(-120 * Math.PI / 180)
        };

        for (let i = 27; i <= 39; i++) {
            const step = i - 26;
            const angle = -120 + (step * angleStep);
            const angleRad = angle * Math.PI / 180;
            
            positions[i] = {
                x: circleCenterX + circleRadius * Math.cos(angleRad),
                y: circleCenterY + circleRadius * Math.sin(angleRad)
            };
        }

        // Финиш
        positions[40] = { x: 790, y: 170 };

        // Масштабирование и смещение
        const scale = 0.7;
        const offsetX = 50;
        const offsetY = 100;

        for (let i = 0; i <= 40; i++) {
            if (positions[i]) {
                positions[i].x = positions[i].x * scale + offsetX;
                positions[i].y = positions[i].y * scale + offsetY;
            }
        }

        return positions;
    }

    drawBoard() {
        const canvas = document.getElementById('board-canvas');
        if (!canvas) return;
        
        const parent = canvas.parentElement;
        if (!parent) return;
        
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const positions = this.generateBoardPositions();
        
        // Рисуем линии между клетками
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;

        // Основная траектория
        ctx.beginPath();
        for (let i = 0; i < 26; i++) {
            if (positions[i] && positions[i + 1]) {
                if (i === 0) {
                    ctx.moveTo(positions[i].x + 20, positions[i].y + 20);
                }
                ctx.lineTo(positions[i + 1].x + 20, positions[i + 1].y + 20);
            }
        }
        ctx.stroke();
        
        // Линия от 25 к 26
        if (positions[25] && positions[26]) {
            ctx.beginPath();
            ctx.moveTo(positions[25].x + 20, positions[25].y + 20);
            ctx.lineTo(positions[26].x + 20, positions[26].y + 20);
            ctx.stroke();
        }
        
        // Круг
        ctx.beginPath();
        if (positions[26]) {
            ctx.moveTo(positions[26].x + 20, positions[26].y + 20);
        }
        
        for (let i = 26; i < 39; i++) {
            if (positions[i] && positions[i + 1]) {
                ctx.lineTo(positions[i + 1].x + 20, positions[i + 1].y + 20);
            }
        }
        ctx.stroke();
        
        // Линия от 39 к 40
        if (positions[39] && positions[40]) {
            ctx.beginPath();
            ctx.moveTo(positions[39].x + 20, positions[39].y + 20);
            ctx.lineTo(positions[40].x + 20, positions[40].y + 20);
            ctx.stroke();
        }
        
        console.log('✅ Игровое поле отрисовано');
    }

    setupEventListeners() {
        console.log('🔧 Настройка обработчиков событий...');

        // Кнопка броска кубика
        const rollDiceBtn = document.getElementById('roll-dice');
        if (rollDiceBtn) {
            rollDiceBtn.addEventListener('click', () => this.rollDice());
            console.log('✅ Обработчик для броска кубика установлен');
        }
        
        // Кнопка "Завершить ответ"
        const answerBtn = document.getElementById('answer-received');
        if (answerBtn) {
            answerBtn.textContent = 'Завершить ответ';
            answerBtn.addEventListener('click', () => this.stopTimerAndCloseCard());
        }
        
        // Кнопки очков (только для ведущего или локального режима)
        document.querySelectorAll('.point-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.gameMode === 'online' && this.role !== 'master') return;
                if (this.pointsApplied || this.applyButtonClicked) return;

                const points = parseInt(e.target.dataset.points);
                const team = parseInt(e.target.dataset.team);
                this.selectPoints(team, points);
            });
        });
        
        // Кнопка применения очков
        const applyBtn = document.getElementById('apply-points');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applySelectedPoints());
        }
        
        // Кнопка следующего хода
        const nextTurnBtn = document.getElementById('next-turn');
        if (nextTurnBtn) {
            nextTurnBtn.addEventListener('click', () => this.nextTurn());
        }
        
        // Обработчик изменения размера окна
        window.addEventListener('resize', () => this.drawBoard());
        
        // Пинг серверу каждые 30 секунд для поддержания соединения
        if (this.gameMode === 'online') {
            setInterval(() => {
                if (this.socket && this.socket.connected) {
                    this.socket.emit('ping');
                }
            }, 30000);
        }
        
        console.log('✅ Все обработчики событий установлены');
    }

    rollDice() {
        console.log('🎲 Бросок кубика...');
        
        // В онлайн-режиме: только текущий игрок может бросать
        // В локальном режиме: бросает тот, чей сейчас ход
        if (this.gameMode === 'online') {
            if (!this.socket || !this.isConnected) {
                alert('Нет подключения к серверу!');
                return;
            }
            
            const canRoll = (this.role === 'player1' && this.currentPlayer === 1) ||
                           (this.role === 'player2' && this.currentPlayer === 2);
            
            if (!canRoll) {
                alert('Сейчас не ваш ход!');
                return;
            }
            
            if (this.diceRolledInCurrentTurn) {
                alert('В этом ходе кубик уже брошен!');
                return;
            }
            
            this.socket.emit('roll-dice');
            this.diceRolledInCurrentTurn = true;
            
        } else {
            // Локальный режим
            if (this.diceRolledInCurrentTurn) {
                alert('В этом ходе кубик уже брошен!');
                return;
            }
            
            const diceElement = document.getElementById('dice');
            if (!diceElement) return;
            
            diceElement.classList.add('rolling');
            
            setTimeout(() => {
                this.diceResult = Math.floor(Math.random() * 6) + 1;
                diceElement.textContent = this.diceResult;
                diceElement.classList.remove('rolling');
                
                const taskNames = {
                    1: 'Кухня', 2: 'Бар', 3: 'Знания', 
                    4: 'Ситуация', 5: 'Сервис', 6: 'Продажи'
                };
                
                const taskTypeElement = document.getElementById('task-type');
                if (taskTypeElement) {
                    taskTypeElement.textContent = taskNames[this.diceResult];
                }
                
                this.diceRolledInCurrentTurn = true;
                setTimeout(() => this.drawCard(this.diceResult), 500);
            }, 1500);
        }
        
        this.updateRollButton();
    }

    drawCard(type) {
        const cards = this.cards[type];
        if (!cards || cards.length === 0) return;
        
        // Выбираем случайный вопрос
        const randomCard = cards[Math.floor(Math.random() * cards.length)];
        
        // Сохраняем текущий вопрос для синхронизации
        this.currentQuestion = randomCard;
        this.currentQuestionCategory = type;
        
        // В онлайн-режиме отправляем вопрос всем участникам
        if (this.gameMode === 'online' && this.socket && this.isConnected && this.role === 'master') {
            this.socket.emit('question-selected', {
                question: randomCard.question,
                category: type,
                instruction: randomCard.instruction
            });
        } else if (this.gameMode === 'online' && this.socket && this.isConnected) {
            // Если это игрок в онлайн-режиме, ждем вопроса от ведущего
            return;
        }
        
        // Показываем вопрос
        this.showQuestion(randomCard.question, type, randomCard.instruction);
    }

    showQuestion(question, category, instruction = '') {
        const modal = document.getElementById('card-modal');
        if (!modal) return;
        
        const cardContent = modal.querySelector('.card-content');
        if (!cardContent) return;
        
        document.getElementById('card-dice').textContent = category;
        document.getElementById('card-category').textContent = this.getCategoryName(category);
        document.getElementById('card-question').textContent = question;
        document.getElementById('card-instruction').textContent = instruction || '';
        
        // Настраиваем кнопку в зависимости от роли
        const answerBtn = document.getElementById('answer-received');
        
        if (this.role === 'master' || this.gameMode === 'local') {
            answerBtn.textContent = 'Приступить к оцениванию';
            answerBtn.onclick = () => {
                clearInterval(this.timerInterval);
                this.hideCard();
                this.showMasterPanel();
            };
        } else {
            answerBtn.textContent = 'Завершить ответ';
            answerBtn.onclick = () => this.stopTimerAndCloseCard();
        }
        
        modal.classList.add('active');
        
        setTimeout(() => {
            cardContent.classList.add('flipped');
            this.startTimer();
        }, 1000);
    }

    getCategoryName(type) {
        const names = {
            1: 'Кухня', 2: 'Бар', 3: 'Знания',
            4: 'Ситуация', 5: 'Сервис', 6: 'Продажи'
        };
        return names[type] || 'Неизвестная категория';
    }

    startTimer() {
        clearInterval(this.timerInterval);
        this.timer = 60;

        const timerElement = document.getElementById('timer');
        if (timerElement) timerElement.textContent = this.timer;

        this.timerInterval = setInterval(() => {
            this.timer--;
            if (timerElement) timerElement.textContent = this.timer;
            
            if (this.timer <= 0) {
                this.stopTimerAndCloseCard();
            }
        }, 1000);
    }

    stopTimerAndCloseCard() {
        clearInterval(this.timerInterval);
        this.hideCard();
        
        if (this.gameMode === 'online' && this.role !== 'master') {
            const rollBtn = document.getElementById('roll-dice');
            if (rollBtn) {
                rollBtn.disabled = true;
                rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Ожидайте оценки ведущего';
            }
            this.showNotification('Ответ отправлен ведущему. Ожидайте оценки...', 'info');
            
            // В онлайн-режиме уведомляем сервер, что ответ завершен
            if (this.socket && this.isConnected) {
                this.socket.emit('answer-completed');
            }
        } else {
            // В локальном режиме сразу показываем панель ведущего
            this.showMasterPanel();
        }
    }

    hideCard() {
        const modal = document.getElementById('card-modal');
        if (!modal) return;
        
        const cardContent = modal.querySelector('.card-content');
        if (cardContent) cardContent.classList.remove('flipped');

        setTimeout(() => {
            modal.classList.remove('active');
        }, 500);
    }

    showMasterPanel() {
        this.resetSelection();
        const panel = document.getElementById('master-panel');
        if (panel) {
            panel.style.display = 'block';
        }
        this.showNotification('Оцените ответ команд и примените очки', 'info');
    }

    resetSelection() {
        this.selectedPoints = { 1: 0, 2: 0 };
        this.pointsApplied = false;
        this.applyButtonClicked = false;
        
        this.updateSelectionDisplay(1);
        this.updateSelectionDisplay(2);

        // Разблокируем кнопки для ведущего или локального режима
        if (this.gameMode === 'local' || this.role === 'master') {
            document.querySelectorAll('.point-btn').forEach(btn => {
                btn.classList.remove('selected');
                btn.disabled = false;
            });
            
            const applyBtn = document.getElementById('apply-points');
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.style.opacity = '1';
            }
            
            const nextTurnBtn = document.getElementById('next-turn');
            if (nextTurnBtn) nextTurnBtn.disabled = false;
        } else {
            // Для игроков блокируем кнопки
            document.querySelectorAll('.point-btn').forEach(btn => {
                btn.classList.remove('selected');
                btn.disabled = true;
            });
            
            const applyBtn = document.getElementById('apply-points');
            if (applyBtn) {
                applyBtn.disabled = true;
                applyBtn.style.opacity = '0.6';
            }
            
            const nextTurnBtn = document.getElementById('next-turn');
            if (nextTurnBtn) nextTurnBtn.disabled = true;
        }
    }

    updateSelectionDisplay(team) {
        const element = document.getElementById(`team${team}-selection`);
        if (!element) return;
        
        const points = this.selectedPoints[team];
        element.innerHTML = points === 0 
            ? 'Выбрано: <span>0 очков</span>'
            : `Выбрано: <span>${points > 0 ? '+' : ''}${points} очков</span>`;
    }

    selectPoints(team, points) {
        if (this.gameMode === 'online' && this.role !== 'master') return;
        if (this.gameMode === 'local' && this.role !== 'local') return;
        
        document.querySelectorAll(`.point-btn[data-team="${team}"]`).forEach(btn => {
            btn.classList.remove('selected');
        });
        
        if (this.selectedPoints[team] === points) {
            this.selectedPoints[team] = 0;
        } else {
            this.selectedPoints[team] = points;
            document.querySelector(`.point-btn[data-team="${team}"][data-points="${points}"]`)?.classList.add('selected');
        }
        
        this.updateSelectionDisplay(team);
    }

    applySelectedPoints() {
        if (this.gameMode === 'online' && this.role !== 'master') {
            alert('Только ведущий может применять очки!');
            return;
        }
        
        if (this.applyButtonClicked) {
            alert('Очки уже применены в этом ходе!');
            return;
        }
        
        // Проверяем, есть ли выбранные очки
        const hasSelectedPoints = this.selectedPoints[1] !== 0 || this.selectedPoints[2] !== 0;
        
        if (!hasSelectedPoints) {
            // Если очки не выбраны, просто переходим к следующему ходу
            this.pointsApplied = true;
            this.applyButtonClicked = true;
            this.enableNextTurnButton();
            return;
        }
        
        for (let team of [1, 2]) {
            const points = this.selectedPoints[team];
            if (points !== 0) {
                this.scores[team] += points;
                this.movePiece(team, points);
            }
        }
        
        this.updateScores();
        this.pointsApplied = true;
        this.applyButtonClicked = true;
        
        // Блокируем кнопки
        document.querySelectorAll('.point-btn').forEach(btn => {
            btn.disabled = true;
        });
        
        const applyBtn = document.getElementById('apply-points');
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.style.opacity = '0.6';
        }
        
        this.enableNextTurnButton();
        
        // Отправляем обновленное состояние на сервер (в онлайн-режиме)
        if (this.gameMode === 'online' && this.socket && this.isConnected) {
            const gameState = {
                scores: this.scores,
                positions: this.positions,
                currentPlayer: this.currentPlayer,
                diceResult: this.diceResult
            };
            
            this.socket.emit('update-game', gameState);
        }
        
        // Проверяем победителя (позиция >= 40)
        for (let team of [1, 2]) {
            if (this.positions[team] >= 40) {
                this.showWinner(team);
            }
        }
    }

    enableNextTurnButton() {
        const nextTurnBtn = document.getElementById('next-turn');
        if (nextTurnBtn) {
            nextTurnBtn.disabled = false;
            nextTurnBtn.style.opacity = '1';
        }
    }

    movePiece(team, points) {
        const piece = document.getElementById(`piece${team}`);
        if (!piece) return;
        
        const newPosition = Math.max(0, Math.min(this.positions[team] + points, 40));
        
        this.animatePieceMovement(team, this.positions[team], newPosition, () => {
            this.positions[team] = newPosition;
            
            if (Math.abs(points) <= 6) {
                this.checkSpecialZone(team, newPosition);
            }
        });
    }

    animatePieceMovement(team, fromPosition, toPosition, callback) {
        const piece = document.getElementById(`piece${team}`);
        if (!piece) return;
        
        const positions = this.generateBoardPositions();
        const stepDelay = 300;
        const direction = toPosition > fromPosition ? 1 : -1;
        let currentStep = fromPosition + direction;
        
        const moveStep = () => {
            if ((direction > 0 && currentStep <= toPosition) || 
                (direction < 0 && currentStep >= toPosition)) {
                
                if (positions[currentStep]) {
                    piece.style.left = (positions[currentStep].x + 5) + 'px';
                    piece.style.top = (positions[currentStep].y + 5) + 'px';
                    piece.classList.add('moving');
                    
                    setTimeout(() => {
                        piece.classList.remove('moving');
                    }, 200);
                }
                
                currentStep += direction;
                setTimeout(moveStep, stepDelay);
            } else if (callback) {
                callback();
            }
        };
        
        moveStep();
    }

    checkSpecialZone(team, position) {
        const cell = document.getElementById(`cell-${position}`);
        if (!cell) return;
        
        let zoneType = null;
        
        if (cell.classList.contains('grams')) {
            zoneType = 'grams';
        } else if (cell.classList.contains('description')) {
            zoneType = 'description';
        } else if (cell.classList.contains('allergy')) {
            zoneType = 'allergy';
        }

        if (zoneType && !this.triggeredZonesInTurn[team].has(zoneType)) {
            this.triggeredZonesInTurn[team].add(zoneType);
            
            this.specialZoneQueue.push({
                team: team,
                zoneType: zoneType,
                position: position,
                priority: team === this.currentPlayer ? 1 : 2
            });
            
            this.specialZoneQueue.sort((a, b) => a.priority - b.priority);

            if (!this.showingSpecialZone) {
                this.showNextSpecialZone();
            }
        }
    }

    showNextSpecialZone() {
        if (this.specialZoneQueue.length === 0) {
            this.showingSpecialZone = false;
            return;
        }
        
        this.showingSpecialZone = true;
        const task = this.specialZoneQueue.shift();
        const zoneSettings = this.zoneSettings[task.zoneType];
        
        const modal = document.createElement('div');
        modal.className = 'special-zone-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 500px;
            background: white;
            border-radius: 20px;
            padding: 30px;
            color: #333;
            z-index: 1001;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            border: 5px solid ${this.getZoneColor(task.zoneType)};
        `;
        
        modal.innerHTML = `
            <h3 style="color: ${this.getZoneColor(task.zoneType)}; margin-bottom: 20px; text-align: center;">
                ${zoneSettings.name}
            </h3>
            <p style="font-size: 18px; margin-bottom: 15px; text-align: center;">
                Вопрос для команды ${task.team}
            </p>
            <div style="font-size: 16px; margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 10px;">
                ${zoneSettings.question}
            </div>
            <div style="text-align: center; margin-top: 30px;">
                <button id="special-correct" class="btn" style="background: #4CAF50; margin-right: 20px;">
                    Верно (+${zoneSettings.positive})
                </button>
                <button id="special-incorrect" class="btn" style="background: #f44336;">
                    Неверно (${zoneSettings.negative})
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('#special-correct').addEventListener('click', () => {
            this.movePiece(task.team, zoneSettings.positive);
            modal.remove();
            setTimeout(() => this.showNextSpecialZone(), 500);
        });

        modal.querySelector('#special-incorrect').addEventListener('click', () => {
            this.movePiece(task.team, zoneSettings.negative);
            modal.remove();
            setTimeout(() => this.showNextSpecialZone(), 500);
        });
    }

    getZoneColor(zoneType) {
        switch(zoneType) {
            case 'grams': return '#4CAF50';
            case 'description': return '#9C27B0';
            case 'allergy': return '#E91E63';
            default: return '#4CAF50';
        }
    }

    updatePieces() {
        const positions = this.generateBoardPositions();

        for (let team of [1, 2]) {
            const piece = document.getElementById(`piece${team}`);
            if (!piece) continue;

            const position = this.positions[team];
            if (positions[position]) {
                piece.style.left = (positions[position].x + 5) + 'px';
                piece.style.top = (positions[position].y + 5) + 'px';
            }
        }
    }

    updateScores() {
        const team1Score = document.querySelector('#team1-score .score');
        const team2Score = document.querySelector('#team2-score .score');
        
        if (team1Score) team1Score.textContent = this.scores[1];
        if (team2Score) team2Score.textContent = this.scores[2];
    }

    updateTurnIndicator() {
        document.querySelectorAll('.video-box').forEach(box => {
            box.classList.remove('current-turn');
        });
        
        document.querySelectorAll('.team-score').forEach(score => {
            score.classList.remove('current-turn');
        });

        document.querySelectorAll('.current-turn-indicator').forEach(indicator => {
            indicator.style.display = 'none';
        });

        const currentTeam = this.currentPlayer;
        const videoTeam = document.getElementById(`video-team${currentTeam}`);
        const teamScore = document.getElementById(`team${currentTeam}-score`);
        const turnIndicator = document.getElementById(`turn-indicator-${currentTeam}`);

        if (videoTeam) videoTeam.classList.add('current-turn');
        if (teamScore) teamScore.classList.add('current-turn');
        if (turnIndicator) turnIndicator.style.display = 'block';
    }

    updateRollButton() {
        const rollBtn = document.getElementById('roll-dice');
        if (!rollBtn) return;
        
        if (this.gameMode === 'local') {
            // В локальном режиме: бросает тот, чей сейчас ход
            const canRoll = !this.diceRolledInCurrentTurn;
            rollBtn.disabled = !canRoll;
            
            if (rollBtn.disabled) {
                rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Кубик уже брошен';
            } else {
                rollBtn.innerHTML = `<i class="fas fa-dice"></i> Бросить кубик (Ход команды ${this.currentPlayer})`;
            }
            
        } else if (this.gameMode === 'online') {
            const isPlayer1 = this.role === 'player1';
            const isPlayer2 = this.role === 'player2';
            const isMaster = this.role === 'master';
            
            // Только игроки могут бросать, ведущий - нет
            const canRoll = (isPlayer1 && this.currentPlayer === 1) ||
                           (isPlayer2 && this.currentPlayer === 2);
            const canRollNow = canRoll && !this.diceRolledInCurrentTurn;
            
            rollBtn.disabled = !canRollNow || isMaster;
            
            if (rollBtn.disabled) {
                if (isMaster) {
                    rollBtn.innerHTML = '<i class="fas fa-dice"></i> Бросок кубика (только игроки)';
                } else if (!canRoll) {
                    rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Ожидайте хода';
                } else if (this.diceRolledInCurrentTurn) {
                    rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Ожидайте оценки';
                }
            } else {
                rollBtn.innerHTML = '<i class="fas fa-dice"></i> Бросить кубик';
            }
        }
    }

    setupRoleInterface() {
        const isMaster = this.role === 'master';

        // Панель ведущего
        const panel = document.getElementById('master-panel');
        if (panel) {
            panel.style.display = isMaster ? 'block' : 'none';
        }

        // Колоды карт
        document.querySelectorAll('.deck').forEach(deck => {
            deck.style.cursor = 'default';
            deck.style.pointerEvents = 'none';
        });

        this.updateRollButton();

        // Показываем информацию о подключении (только в онлайн-режиме)
        if (this.gameMode === 'online') {
            const connectionInfo = document.createElement('div');
            connectionInfo.className = 'connection-info-bar';
            connectionInfo.innerHTML = `
                <div class="connection-status ${this.isConnected ? 'connected' : 'disconnected'}">
                    <i class="fas fa-circle"></i>
                    <span>${this.isConnected ? 'Подключено' : 'Не подключено'}</span>
                </div>
                <div class="room-info-bar">
                    <i class="fas fa-door-closed"></i>
                    <span>Комната: ${this.roomCode || 'Нет'}</span>
                </div>
                <div class="player-info-bar">
                    <i class="fas fa-user"></i>
                    <span>${this.playerName} (${this.getRoleName()})</span>
                </div>
            `;

            const topPanel = document.querySelector('.top-panel');
            if (topPanel) {
                topPanel.appendChild(connectionInfo);
            }
        }
    }

    getRoleName() {
        switch(this.role) {
            case 'master': return 'Ведущий';
            case 'player1': return 'Игрок 1 (Команда 1)';
            case 'player2': return 'Игрок 2 (Команда 2)';
            case 'local': return 'Локальный игрок';
            default: return 'Наблюдатель';
        }
    }

    nextTurn() {
        if (this.gameMode === 'online' && this.role !== 'master') {
            alert('Только ведущий может переходить к следующему ходу!');
            return;
        }
        
        // Отправляем запрос на смену хода на сервер (в онлайн-режиме)
        if (this.gameMode === 'online' && this.socket && this.isConnected) {
            this.socket.emit('next-turn');
        }
        
        // Обновляем локальное состояние
        const panel = document.getElementById('master-panel');
        if (panel) panel.style.display = 'none';
        
        this.triggeredZonesInTurn = { 1: new Set(), 2: new Set() };
        this.specialZoneQueue = [];
        this.showingSpecialZone = false;
        
        this.diceRolledInCurrentTurn = false;
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        
        this.updateTurnIndicator();
        this.updateRollButton();
        
        clearInterval(this.timerInterval);
        
        const timer = document.getElementById('timer');
        if (timer) timer.textContent = '60';
        
        const dice = document.getElementById('dice');
        if (dice) dice.textContent = '?';
        
        const taskType = document.getElementById('task-type');
        if (taskType) taskType.textContent = '';
        
        this.resetSelection();
        this.showNotification(`Сейчас ходит команда ${this.currentPlayer}`, 'info');
    }

    showWinner(team) {
        const fireworks = document.getElementById('fireworks');
        if (fireworks) fireworks.style.display = 'block';
        
        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                const firework = document.createElement('div');
                firework.style.position = 'fixed';
                firework.style.left = Math.random() * 100 + 'vw';
                firework.style.top = Math.random() * 100 + 'vh';
                firework.style.width = '5px';
                firework.style.height = '5px';
                firework.style.background = team === 1 ? '#2196F3' : '#FF5722';
                firework.style.borderRadius = '50%';
                firework.style.animation = 'firework 1s forwards';
                
                if (fireworks) fireworks.appendChild(firework);
                
                setTimeout(() => firework.remove(), 1000);
            }, i * 100);
        }
        
        setTimeout(() => {
            alert(`🎉 Победила Команда ${team}! 🎉`);
            if (fireworks) {
                fireworks.style.display = 'none';
                fireworks.innerHTML = '';
            }
        }, 3000);
    }

    showAlert(message) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert';
        alertDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <span>${message}</span>
            <button class="close-alert">&times;</button>
        `;
        
        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #f44336;
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            z-index: 10001;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideDown 0.3s ease-out;
        `;
        
        document.body.appendChild(alertDiv);
        
        alertDiv.querySelector('.close-alert').addEventListener('click', () => {
            alertDiv.remove();
        });
        
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.style.animation = 'slideUp 0.3s ease-out';
                setTimeout(() => alertDiv.remove(), 300);
            }
        }, 5000);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#f44336' : type === 'warning' ? '#FF9800' : '#2196F3'};
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            z-index: 10000;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
            display: flex;
            align-items: center;
            gap: 10px;
            max-width: 300px;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    getWelcomeMessage() {
        if (this.gameMode === 'local') {
            return 'Вы играете в локальном режиме';
        } else {
            return `Вы подключились как ${this.playerName} (${this.getRoleName()})`;
        }
    }
}

// Запускаем игру
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
