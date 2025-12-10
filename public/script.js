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
        
        // Режим игры
        this.gameMode = null; // 'online' или 'local'
        
        // Для чата
        this.chatMessages = [];
        
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
                            <input type="radio" id="mode-online" name="mode" value="online">
                            <label for="mode-online" class="mode-label">
                                <i class="fas fa-globe"></i>
                                <div>
                                    <strong>Онлайн-игра</strong>
                                    <small>Игра по сети с друзьями</small>
                                    <div class="mode-details">
                                        <p><i class="fas fa-check"></i> 3 игрока: ведущий + 2 команды</p>
                                        <p><i class="fas fa-check"></i> Видеосвязь</p>
                                        <p><i class="fas fa-check"></i> Чат</p>
                                    </div>
                                </div>
                            </label>
                        </div>
                        
                        <div class="mode-option">
                            <input type="radio" id="mode-local" name="mode" value="local">
                            <label for="mode-local" class="mode-label">
                                <i class="fas fa-desktop"></i>
                                <div>
                                    <strong>Один компьютер</strong>
                                    <small>Игра на одном устройстве</small>
                                    <div class="mode-details">
                                        <p><i class="fas fa-check"></i> Все роли на одном экране</p>
                                        <p><i class="fas fa-check"></i> Без подключения к интернету</p>
                                        <p><i class="fas fa-check"></i> Для обучения и практики</p>
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <button id="select-mode" class="btn" style="background: #4CAF50; width: 100%; margin-top: 20px;">
                        <i class="fas fa-arrow-right"></i> Продолжить
                    </button>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const selectBtn = document.getElementById('select-mode');
            
            selectBtn.addEventListener('click', () => {
                const selectedMode = modal.querySelector('input[name="mode"]:checked')?.value;
                
                if (!selectedMode) {
                    alert('Пожалуйста, выберите режим игры');
                    return;
                }
                
                this.gameMode = selectedMode;
                modal.remove();
                resolve();
            });
            
            // Автовыбор при нажатии на опцию
            modal.querySelectorAll('.mode-option input').forEach(input => {
                input.addEventListener('change', () => {
                    selectBtn.style.display = 'block';
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
        
        // В локальном режиме ведущий может бросать кубик для демонстрации
        // Но в основном режиме - только игроки
        
        // Панель ведущего всегда видна
        const panel = document.getElementById('master-panel');
        if (panel) panel.style.display = 'block';
        
        // Обновляем кнопки для локального режима
        this.updateLocalRollButton();
    }

    async showRoleSelection() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'role-selection-modal';
            modal.innerHTML = `
                <div class="role-selection-content">
                    <h2><i class="fas fa-gamepad"></i> Подключение к игре</h2>
                    
                    <div class="connection-info">
                        <div class="server-status">
                            <i class="fas fa-server"></i>
                            <span>Сервер: ${this.serverUrl}</span>
                        </div>
                    </div>
                    
                    <!-- Ввод имени -->
                    <div class="name-input-section">
                        <label for="player-name"><i class="fas fa-user"></i> Введите ваше имя:</label>
                        <input type="text" id="player-name" placeholder="Ваше имя" maxlength="20" autocomplete="off">
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
                            <input type="text" id="room-code-input" placeholder="Введите 6-значный код" maxlength="6" autocomplete="off">
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
                    
                    <button id="back-to-mode" class="btn" style="background: #666; width: 100%; margin-top: 10px;">
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
            const roomCodeInput = modal.querySelector('#room-code-input');
            const statusDiv = modal.querySelector('#connection-status');
            const statusText = modal.querySelector('#status-text');
            const backBtn = modal.querySelector('#back-to-mode');
            
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
            
            // Показать/скрыть секции
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
                
                this.playerName = playerName;
                
                statusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Создаем комнату...';
                this.socket.emit('create-room', playerName);
            });
            
            // Присоединение к комнате
            joinBtn.addEventListener('click', () => {
                const playerName = nameInput.value.trim();
                const roomCode = roomCodeInput.value.trim().toUpperCase();
                const selectedRole = modal.querySelector('input[name="role"]:checked')?.value;
                
                if (!playerName) {
                    this.showAlert('Пожалуйста, введите имя');
                    return;
                }
                
                if (roomCode.length !== 6) {
                    this.showAlert('Код комнаты должен содержать 6 символов');
                    return;
                }
                
                if (!selectedRole) {
                    this.showAlert('Пожалуйста, выберите роль');
                    return;
                }
                
                this.playerName = playerName;
                this.role = selectedRole;
                this.roomCode = roomCode;
                
                statusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Присоединяемся к комнате...';
                this.socket.emit('join-room', {
                    roomCode: roomCode,
                    playerName: playerName,
                    role: selectedRole
                });
            });
            
            // Автоподключение при нажатии Enter
            nameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && this.role) {
                    if (this.role === 'master') {
                        createBtn.click();
                    } else {
                        roomCodeInput.focus();
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
                if (code.length === 6 && this.socket) {
                    this.socket.emit('check-room', code);
                }
            });
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
        
        if (this.gameMode === 'online') {
            this.setupChat();
        }
        
        this.drawBoard();
        this.updateScores();
        this.updatePieces();
        this.updateTurnIndicator();
        
        this.showNotification(`Игра началась! ${this.getWelcomeMessage()}`, 'info');
        
        console.log('🎮 Игра полностью инициализирована!');
    }

    getWelcomeMessage() {
        if (this.gameMode === 'local') {
            return 'Вы играете в локальном режиме';
        } else {
            return `Вы подключились как ${this.playerName} (${this.getRoleName()})`;
        }
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
        
        this.socket.on('dice-rolled', (data) => {
            this.handleDiceRolled(data);
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
        
        this.socket.on('new-message', (data) => {
            this.addChatMessage(data.sender, data.message, data.time);
        });
        
        this.socket.on('error', (error) => {
            this.showAlert(error.message || 'Произошла ошибка');
        });
        
        this.socket.on('room-status', (data) => {
            const roomStatus = modal.querySelector('#room-status');
            if (data.exists) {
                roomStatus.innerHTML = `<i class="fas fa-check-circle"></i> Комната найдена`;
                roomStatus.className = 'room-status found';
            } else {
                roomStatus.innerHTML = `<i class="fas fa-times-circle"></i> Комната не найдена`;
                roomStatus.className = 'room-status not-found';
            }
        });
    }

    handleDiceRolled(data) {
        this.diceResult = data.dice;
        const diceElement = document.getElementById('dice');
        if (diceElement) {
            diceElement.textContent = data.dice;
            diceElement.classList.add('rolling');
            
            setTimeout(() => {
                diceElement.classList.remove('rolling');
            }, 500);
        }
        
        const taskNames = {
            1: 'Кухня', 2: 'Бар', 3: 'Знания', 
            4: 'Ситуация', 5: 'Сервис', 6: 'Продажи'
        };
        
        const taskTypeElement = document.getElementById('task-type');
        if (taskTypeElement) {
            taskTypeElement.textContent = taskNames[data.dice];
        }
        
        // Показываем карточку только если:
        // 1. Это текущий игрок (который должен отвечать)
        // 2. Это ведущий (чтобы видеть вопрос)
        // 3. Это локальная игра (всем)
        
        const shouldShowCard = this.gameMode === 'local' || 
                              this.role === 'master' || 
                              (this.role === 'player1' && this.currentPlayer === 1) ||
                              (this.role === 'player2' && this.currentPlayer === 2);
        
        if (shouldShowCard) {
            setTimeout(() => this.drawCard(data.dice), 800);
        }
        
        if (this.gameMode === 'online') {
            this.showNotification(`${data.playerName} выбросил ${data.dice}!`, 'info');
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

    drawCard(type) {
        const cards = this.cards[type];
        if (!cards || cards.length === 0) return;
        
        const randomCard = cards[Math.floor(Math.random() * cards.length)];
        const modal = document.getElementById('card-modal');
        if (!modal) return;
        
        const cardContent = modal.querySelector('.card-content');
        if (!cardContent) return;
        
        document.getElementById('card-dice').textContent = type;
        document.getElementById('card-category').textContent = this.getCategoryName(type);
        document.getElementById('card-question').textContent = randomCard.question;
        document.getElementById('card-instruction').textContent = randomCard.instruction || '';
        
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

    updateLocalRollButton() {
        const rollBtn = document.getElementById('roll-dice');
        if (rollBtn) {
            rollBtn.innerHTML = `<i class="fas fa-dice"></i> Бросить кубик (Ход команды ${this.currentPlayer})`;
        }
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
        
        if (this.selectedPoints[1] === 0 && this.selectedPoints[2] === 0) {
            alert('Сначала выберите очки для команд!');
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
        
        const nextTurnBtn = document.getElementById('next-turn');
        if (nextTurnBtn) nextTurnBtn.disabled = false;
        
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

    setupEventListeners() {
        console.log('🔧 Настройка обработчиков событий...');
        
        const rollDiceBtn = document.getElementById('roll-dice');
        if (rollDiceBtn) {
            rollDiceBtn.addEventListener('click', () => this.rollDice());
        }
        
        const answerBtn = document.getElementById('answer-received');
        if (answerBtn) {
            // Текст устанавливается в drawCard
        }
        
        document.querySelectorAll('.point-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.pointsApplied || this.applyButtonClicked) return;
                
                const points = parseInt(e.target.dataset.points);
                const team = parseInt(e.target.dataset.team);
                this.selectPoints(team, points);
            });
        });
        
        const applyBtn = document.getElementById('apply-points');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applySelectedPoints());
        }
        
        const nextTurnBtn = document.getElementById('next-turn');
        if (nextTurnBtn) {
            nextTurnBtn.addEventListener('click', () => this.nextTurn());
        }
        
        window.addEventListener('resize', () => this.drawBoard());
        
        // Чат (только в онлайн-режиме)
        if (this.gameMode === 'online') {
            const sendMessageBtn = document.getElementById('send-message-btn');
            const chatInput = document.getElementById('chat-input');
            
            if (sendMessageBtn && chatInput) {
                sendMessageBtn.addEventListener('click', () => this.sendChatMessage());
                chatInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.sendChatMessage();
                    }
                });
            }
        }
        
        // Пинг серверу для поддержания соединения
        if (this.gameMode === 'online') {
            setInterval(() => {
                if (this.socket && this.socket.connected) {
                    this.socket.emit('ping');
                }
            }, 30000);
        }
    }

    setupChat() {
        // Создаем контейнер для чата только в онлайн-режиме
        if (this.gameMode !== 'online') return;
        
        if (!document.getElementById('chat-container')) {
            const chatContainer = document.createElement('div');
            chatContainer.id = 'chat-container';
            chatContainer.className = 'chat-container';
            chatContainer.innerHTML = `
                <div class="chat-header">
                    <h4><i class="fas fa-comments"></i> Чат игры</h4>
                    <button id="toggle-chat" class="chat-toggle">
                        <i class="fas fa-chevron-up"></i>
                    </button>
                </div>
                <div class="chat-messages" id="chat-messages">
                    <div class="chat-system-message">
                        <i class="fas fa-info-circle"></i> Чат подключен
                    </div>
                </div>
                <div class="chat-input">
                    <input type="text" id="chat-input" placeholder="Введите сообщение..." maxlength="200">
                    <button id="send-message-btn" class="send-btn">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            `;
            
            const gameContainer = document.querySelector('.game-container');
            if (gameContainer) {
                gameContainer.appendChild(chatContainer);
            }
            
            const toggleBtn = document.getElementById('toggle-chat');
            const chatMessages = document.getElementById('chat-messages');
            
            if (toggleBtn && chatMessages) {
                toggleBtn.addEventListener('click', () => {
                    const isHidden = chatMessages.style.display === 'none';
                    chatMessages.style.display = isHidden ? 'block' : 'none';
                    toggleBtn.innerHTML = isHidden ? 
                        '<i class="fas fa-chevron-up"></i>' : 
                        '<i class="fas fa-chevron-down"></i>';
                });
            }
        }
    }

    sendChatMessage() {
        if (this.gameMode !== 'online') return;
        
        const chatInput = document.getElementById('chat-input');
        if (!chatInput || !this.socket || !this.isConnected) return;
        
        const message = chatInput.value.trim();
        if (!message) return;
        
        this.socket.emit('send-message', message);
        chatInput.value = '';
        chatInput.focus();
    }

    addChatMessage(sender, message, timestamp) {
        if (this.gameMode !== 'online') return;
        
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender === this.playerName ? 'own-message' : ''}`;
        
        const time = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${sender === this.playerName ? 'Вы' : sender}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${message}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Остальные методы остаются без изменений (createBoard, generateBoardPositions, drawBoard, и т.д.)
    // Добавьте их из предыдущей версии кода...

    // ... (все остальные методы из предыдущей версии остаются без изменений)
}

// Запускаем игру
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
