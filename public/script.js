[file name]: script.js
[file content begin]
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
        this.currentQuestion = null;
        
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
        
        this.role = null;
        this.roomCode = null;
        this.playerName = '';
        this.socket = null;
        this.isConnected = false;
        this.serverUrl = window.location.origin;
        
        this.gameMode = null;
        
        this.chatMessages = [];
        
        this.init();
    }

    async init() {
        console.log('🚀 Инициализация игры...');
        
        this.gameContainer = document.querySelector('.game-container');
        
        console.log('👤 Выбираем режим игры...');
        await this.showGameModeSelection();
        console.log('✅ Режим выбран:', this.gameMode);
        
        if (this.gameMode === 'online') {
            await this.showRoleSelection();
        } else {
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
                                        <p><i class="fas fa-check"></i> 3 игроков: ведущий + 2 команды</p>
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
            
            modal.querySelectorAll('.mode-option input').forEach(input => {
                input.addEventListener('change', () => {
                    selectBtn.style.display = 'block';
                });
            });
        });
    }

    startLocalGame() {
        console.log('🖥️ Запуск локальной игры...');
        
        const videoContainer = document.querySelector('.video-container');
        if (videoContainer) videoContainer.style.display = 'none';
        
        this.setupLocalInterface();
        
        this.continueGameInitialization();
        
        this.showNotification('Локальная игра запущена! Вы играете на одном устройстве.', 'info');
    }

    setupLocalInterface() {
        const videoContainer = document.querySelector('.video-container');
        if (videoContainer) videoContainer.style.display = 'none';
        
        const panel = document.getElementById('master-panel');
        if (panel) panel.style.display = 'block';
        
        this.updateLocalRollButton();
        
        const nextTurnBtn = document.getElementById('next-turn');
        if (nextTurnBtn) {
            nextTurnBtn.disabled = false;
        }
        
        const applyBtn = document.getElementById('apply-points');
        if (applyBtn) {
            applyBtn.onclick = () => this.applySelectedPoints();
        }
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
                        <input type="text" id="player-name" placeholder="Ваше имя" maxlength="20" autocomplete="off" 
                               style="width: 100%; padding: 15px; font-size: 18px; margin: 10px 0; border: 2px solid #4CAF50; border-radius: 10px; background: #333; color: white;">
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
                            <input type="text" id="room-code-input" placeholder="Введите 6-значный код комнаты" maxlength="6" autocomplete="off"
                                   style="width: 100%; padding: 15px; font-size: 18px; border: 2px solid #2196F3; border-radius: 10px; background: #333; color: white; margin-bottom: 10px;">
                            <button id="join-room-btn" class="btn join-btn" style="width: 100%; padding: 15px; font-size: 18px;">
                                <i class="fas fa-sign-in-alt"></i> Присоединиться к комнате
                            </button>
                        </div>
                        <div id="room-status" class="room-status"></div>
                    </div>
                    
                    <!-- Статус подключения -->
                    <div id="connection-status" class="connection-status">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span id="status-text">Подключение к серверу...</span>
                    </div>
                    
                    <button id="back-to-mode" class="btn" style="background: #666; width: 100%; margin-top: 10px; padding: 12px;">
                        <i class="fas fa-arrow-left"></i> Назад к выбору режима
                    </button>
                </div>
            `;
            
            document.body.appendChild(modal);
            
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
            
            backBtn.addEventListener('click', () => {
                modal.remove();
                this.showGameModeSelection().then(() => {
                    if (this.gameMode === 'online') {
                        this.showRoleSelection().then(resolve);
                    }
                });
            });
            
            this.setupSocketConnection(modal, resolve);
            
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
                this.currentPlayer = data.gameState.currentPlayer || this.currentPlayer;
                this.scores = data.gameState.scores || this.scores;
                this.positions = data.gameState.positions || this.positions;
                this.diceResult = data.gameState.diceResult || 0;
                this.currentQuestion = data.gameState.currentQuestion || null;
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
            this.currentQuestion = gameState.currentQuestion || null;
            
            this.updateScores();
            this.updatePieces();
            this.updateTurnIndicator();
            
            const diceElement = document.getElementById('dice');
            if (diceElement && this.diceResult > 0) {
                diceElement.textContent = this.diceResult;
            }
            
            if (this.currentQuestion && this.shouldShowCardForCurrentPlayer()) {
                setTimeout(() => this.drawCardFromServer(this.currentQuestion), 500);
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
        
        this.socket.on('question-updated', (data) => {
            this.currentQuestion = data;
            if (this.shouldShowCardForCurrentPlayer()) {
                setTimeout(() => this.drawCardFromServer(data), 500);
            }
        });
        
        this.socket.on('room-closed', (message) => {
            this.showAlert(message);
            window.location.reload();
        });
    }

    shouldShowCardForCurrentPlayer() {
        if (this.gameMode === 'local') return true;
        
        return this.role === 'master' || 
               (this.role === 'player1' && this.currentPlayer === 1) ||
               (this.role === 'player2' && this.currentPlayer === 2);
    }

    handleDiceRolled(data) {
        this.diceResult = data.dice;
        this.currentQuestion = data.question;
        
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
        
        if (this.shouldShowCardForCurrentPlayer()) {
            setTimeout(() => {
                this.drawCardFromServer(data.question);
            }, 800);
        }
        
        if (this.gameMode === 'online') {
            this.showNotification(`${data.playerName} выбросил ${data.dice}!`, 'info');
        }
    }

    async loadCards() {
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

    drawCardFromServer(questionData) {
        const modal = document.getElementById('card-modal');
        if (!modal) return;
        
        const cardContent = modal.querySelector('.card-content');
        if (!cardContent) return;
        
        document.getElementById('card-dice').textContent = questionData.dice || this.diceResult;
        document.getElementById('card-category').textContent = this.getCategoryName(questionData.dice || this.diceResult);
        document.getElementById('card-question').textContent = questionData.question;
        document.getElementById('card-instruction').textContent = questionData.instruction || '';
        
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

    drawCard(type) {
        const cards = this.cards[type];
        if (!cards || cards.length === 0) return;
        
        const randomCard = cards[Math.floor(Math.random() * cards.length)];
        randomCard.dice = type;
        
        const modal = document.getElementById('card-modal');
        if (!modal) return;
        
        const cardContent = modal.querySelector('.card-content');
        if (!cardContent) return;
        
        document.getElementById('card-dice').textContent = type;
        document.getElementById('card-category').textContent = this.getCategoryName(type);
        document.getElementById('card-question').textContent = randomCard.question;
        document.getElementById('card-instruction').textContent = randomCard.instruction || '';
        
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
            
            if (this.socket && this.isConnected) {
                this.socket.emit('answer-completed');
            }
        } else {
            this.showMasterPanel();
        }
    }

    rollDice() {
        console.log('🎲 Бросок кубика...');
        
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
        
        if (this.applyButtonClicked && this.selectedPoints[1] !== 0 && this.selectedPoints[2] !== 0) {
            alert('Очки уже применены в этом ходе!');
            return;
        }
        
        if (this.selectedPoints[1] === 0 && this.selectedPoints[2] === 0) {
            if (this.gameMode === 'local') {
                this.pointsApplied = true;
                this.applyButtonClicked = true;
                this.enableNextTurnButton();
                this.showNotification('Очки не были начислены. Переход к следующему ходу.', 'info');
                return;
            } else {
                alert('Сначала выберите очки для команд или нажмите "Следующий ход"!');
                return;
            }
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
        
        document.querySelectorAll('.point-btn').forEach(btn => {
            btn.disabled = true;
        });
        
        const applyBtn = document.getElementById('apply-points');
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.style.opacity = '0.6';
        }
        
        this.enableNextTurnButton();
        
        if (this.gameMode === 'online' && this.socket && this.isConnected) {
            const gameState = {
                scores: this.scores,
                positions: this.positions,
                currentPlayer: this.currentPlayer,
                diceResult: this.diceResult,
                currentQuestion: this.currentQuestion
            };
            
            this.socket.emit('update-game', gameState);
        }
        
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

    nextTurn() {
        if (this.gameMode === 'online' && this.role !== 'master') {
            alert('Только ведущий может переходить к следующему ходу!');
            return;
        }
        
        if (this.gameMode === 'local' || this.pointsApplied || this.applyButtonClicked) {
            if (this.gameMode === 'online' && this.socket && this.isConnected) {
                this.socket.emit('next-turn');
            }
            
            const panel = document.getElementById('master-panel');
            if (panel) panel.style.display = 'none';
            
            this.triggeredZonesInTurn = { 1: new Set(), 2: new Set() };
            this.specialZoneQueue = [];
            this.showingSpecialZone = false;
            
            this.diceRolledInCurrentTurn = false;
            this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
            this.pointsApplied = false;
            this.applyButtonClicked = false;
            this.currentQuestion = null;
            
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
        } else {
            alert('Сначала примените очки или нажмите "Следующий ход" еще раз для пропуска начисления очков');
        }
    }

    setupEventListeners() {
        console.log('🔧 Настройка обработчиков событий...');
        
        const rollDiceBtn = document.getElementById('roll-dice');
        if (rollDiceBtn) {
            rollDiceBtn.addEventListener('click', () => this.rollDice());
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
        
        if (this.gameMode === 'online') {
            setInterval(() => {
                if (this.socket && this.socket.connected) {
                    this.socket.emit('ping');
                }
            }, 30000);
        }
    }

    setupChat() {
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
                <div class="chat-messages" id="chat-messages" style="display: block;">
                    <div class="chat-system-message">
                        <i class="fas fa-info-circle"></i> Чат подключен. Добро пожаловать, ${this.playerName}!
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
            
            this.addChatMessage('Система', `Вы присоединились как ${this.playerName} (${this.getRoleName()})`, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
    }

    sendChatMessage() {
        if (this.gameMode !== 'online') return;
        
        const chatInput = document.getElementById('chat-input');
        if (!chatInput || !this.socket || !this.isConnected) {
            console.error('Чат не инициализирован или нет подключения');
            return;
        }
        
        const message = chatInput.value.trim();
        if (!message) return;
        
        this.socket.emit('send-message', {
            roomCode: this.roomCode,
            message: message,
            sender: this.playerName
        });
        
        chatInput.value = '';
        chatInput.focus();
    }

    addChatMessage(sender, message, timestamp) {
        if (this.gameMode !== 'online') return;
        
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) {
            console.error('Элемент чата не найден');
            return;
        }
        
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

    createBoard() {
        this.canvas = document.getElementById('board-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.boardWidth = this.canvas.width;
        this.boardHeight = this.canvas.height;
        
        this.cells = this.generateBoardPositions();
    }

    generateBoardPositions() {
        const cells = [];
        const totalCells = 40;
        const padding = 80;
        const availableWidth = this.boardWidth - padding * 2;
        const availableHeight = this.boardHeight - padding * 2;
        
        for (let i = 0; i < totalCells; i++) {
            let x, y;
            
            if (i < 10) {
                x = padding + (i * availableWidth / 9);
                y = padding;
            } else if (i < 20) {
                x = padding + availableWidth;
                y = padding + ((i - 10) * availableHeight / 9);
            } else if (i < 30) {
                x = padding + availableWidth - ((i - 20) * availableWidth / 9);
                y = padding + availableHeight;
            } else {
                x = padding;
                y = padding + availableHeight - ((i - 30) * availableHeight / 9);
            }
            
            cells.push({
                x: x,
                y: y,
                number: i,
                type: this.getCellType(i)
            });
        }
        
        return cells;
    }

    getCellType(number) {
        if (number === 0) return 'start';
        if (number === 39) return 'finish';
        
        const specialCells = {
            3: 'grams',
            8: 'description',
            13: 'allergy',
            18: 'red',
            23: 'grams',
            28: 'description',
            33: 'allergy',
            38: 'red'
        };
        
        return specialCells[number] || 'normal';
    }

    drawBoard() {
        if (!this.canvas) return;
        
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.boardWidth = this.canvas.width;
        this.boardHeight = this.canvas.height;
        
        this.cells = this.generateBoardPositions();
        
        this.ctx.clearRect(0, 0, this.boardWidth, this.boardHeight);
        
        this.ctx.strokeStyle = '#4CAF50';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        
        const cells = this.cells;
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const nextCell = cells[(i + 1) % cells.length];
            
            if (i === 0) {
                this.ctx.moveTo(cell.x, cell.y);
            }
            
            this.ctx.lineTo(nextCell.x, nextCell.y);
        }
        
        this.ctx.stroke();
        
        this.createCellsContainer();
        this.drawCells();
        this.updatePieces();
    }

    createCellsContainer() {
        const container = document.getElementById('cells-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.cells.forEach((cell, index) => {
            const cellDiv = document.createElement('div');
            cellDiv.className = `cell ${cell.type}`;
            cellDiv.style.left = `${cell.x - 20}px`;
            cellDiv.style.top = `${cell.y - 20}px`;
            cellDiv.dataset.number = index;
            cellDiv.dataset.type = cell.type;
            
            const numberSpan = document.createElement('span');
            numberSpan.className = 'cell-number';
            numberSpan.textContent = index;
            cellDiv.appendChild(numberSpan);
            
            if (cell.type === 'finish') {
                cellDiv.classList.add('finish-big');
                const finishText = document.createElement('div');
                finishText.className = 'finish-text';
                finishText.innerHTML = 'Ф<br>И<br>Н<br>И<br>Ш';
                finishText.style.cssText = `
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 10px;
                    font-weight: bold;
                    line-height: 1;
                    text-align: center;
                    color: #000;
                `;
                cellDiv.appendChild(finishText);
            }
            
            container.appendChild(cellDiv);
        });
    }

    drawCells() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            const number = parseInt(cell.dataset.number);
            const type = cell.dataset.type;
            
            cell.title = `Клетка ${number}: ${this.getCellTypeName(type)}`;
        });
    }

    getCellTypeName(type) {
        const names = {
            'start': 'Старт',
            'finish': 'Финиш',
            'grams': 'Зона граммовки',
            'description': 'Зона красочного описания',
            'allergy': 'Зона аллергии',
            'red': 'Красная зона',
            'normal': 'Обычная клетка'
        };
        return names[type] || type;
    }

    createZoneLabels() {
        const zoneLabels = [
            { type: 'grams', name: 'Граммовка', color: '#4CAF50' },
            { type: 'description', name: 'Описание', color: '#9C27B0' },
            { type: 'allergy', name: 'Аллергия', color: '#E91E63' },
            { type: 'red', name: 'Красная зона', color: '#f44336' }
        ];
        
        const container = document.getElementById('cells-container');
        
        zoneLabels.forEach(zone => {
            const label = document.createElement('div');
            label.className = 'zone-label';
            label.innerHTML = `<span style="color: ${zone.color}; font-weight: bold;">${zone.name}</span>`;
            label.style.position = 'absolute';
            label.style.pointerEvents = 'none';
            label.style.zIndex = '5';
            
            const cells = this.cells.filter(cell => cell.type === zone.type);
            if (cells.length > 0) {
                const firstCell = cells[0];
                label.style.left = `${firstCell.x - 40}px`;
                label.style.top = `${firstCell.y - 40}px`;
                container.appendChild(label);
            }
        });
    }

    updatePieces() {
        const piece1 = document.getElementById('piece1');
        const piece2 = document.getElementById('piece2');
        
        if (!piece1 || !piece2) return;
        
        const position1 = this.positions[1] % 40;
        const position2 = this.positions[2] % 40;
        
        const cell1 = this.cells[position1];
        const cell2 = this.cells[position2];
        
        if (cell1) {
            piece1.style.left = `${cell1.x - 15}px`;
            piece1.style.top = `${cell1.y - 15}px`;
            piece1.textContent = '1';
        }
        
        if (cell2) {
            piece2.style.left = `${cell2.x - 15}px`;
            piece2.style.top = `${cell2.y - 15}px`;
            piece2.textContent = '2';
        }
    }

    movePiece(team, steps) {
        this.positions[team] += steps;
        
        if (this.positions[team] < 0) {
            this.positions[team] = 0;
        }
        
        const piece = document.getElementById(`piece${team}`);
        if (piece) {
            piece.classList.add('moving');
            setTimeout(() => {
                piece.classList.remove('moving');
            }, 500);
        }
        
        this.updatePieces();
        
        const position = this.positions[team] % 40;
        const cellType = this.cells[position]?.type;
        
        if (cellType && ['grams', 'description', 'allergy', 'red'].includes(cellType)) {
            if (!this.triggeredZonesInTurn[team].has(position)) {
                this.triggeredZonesInTurn[team].add(position);
                this.handleSpecialZone(team, cellType);
            }
        }
    }

    handleSpecialZone(team, zoneType) {
        this.specialZoneQueue.push({ team, zoneType });
        
        if (!this.showingSpecialZone) {
            this.showNextSpecialZone();
        }
    }

    showNextSpecialZone() {
        if (this.specialZoneQueue.length === 0) {
            this.showingSpecialZone = false;
            return;
        }
        
        this.showingSpecialZone = true;
        const { team, zoneType } = this.specialZoneQueue.shift();
        
        const zone = this.zoneSettings[zoneType];
        if (!zone) return;
        
        const modal = document.createElement('div');
        modal.className = 'special-zone-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px;
            border-radius: 15px;
            z-index: 2000;
            color: #333;
            text-align: center;
            border: 5px solid ${this.getZoneColor(zoneType)};
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            max-width: 500px;
            width: 90%;
        `;
        
        modal.innerHTML = `
            <h3 style="color: ${this.getZoneColor(zoneType)}; margin-bottom: 20px;">
                <i class="fas fa-star"></i> ${zone.name} - Команда ${team}
            </h3>
            <p style="font-size: 18px; margin-bottom: 20px;">${zone.question}</p>
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 30px;">
                <button class="zone-btn good-btn" style="background: #4CAF50;">
                    <i class="fas fa-thumbs-up"></i> Хорошо (+${zone.positive})
                </button>
                <button class="zone-btn bad-btn" style="background: #f44336;">
                    <i class="fas fa-thumbs-down"></i> Плохо (${zone.negative})
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.good-btn').addEventListener('click', () => {
            this.scores[team] += zone.positive;
            this.updateScores();
            modal.remove();
            this.showNextSpecialZone();
        });
        
        modal.querySelector('.bad-btn').addEventListener('click', () => {
            this.scores[team] += zone.negative;
            this.updateScores();
            modal.remove();
            this.showNextSpecialZone();
        });
    }

    getZoneColor(zoneType) {
        const colors = {
            'grams': '#4CAF50',
            'description': '#9C27B0',
            'allergy': '#E91E63',
            'red': '#f44336'
        };
        return colors[zoneType] || '#333';
    }

    updateScores() {
        document.getElementById('team1-score').querySelector('.score').textContent = this.scores[1];
        document.getElementById('team2-score').querySelector('.score').textContent = this.scores[2];
        
        if (this.gameMode === 'online' && this.socket && this.isConnected) {
            const gameState = {
                scores: this.scores,
                positions: this.positions,
                currentPlayer: this.currentPlayer,
                diceResult: this.diceResult,
                currentQuestion: this.currentQuestion
            };
            
            this.socket.emit('update-game', gameState);
        }
    }

    updateTurnIndicator() {
        document.getElementById('turn-indicator-1').style.display = this.currentPlayer === 1 ? 'block' : 'none';
        document.getElementById('turn-indicator-2').style.display = this.currentPlayer === 2 ? 'block' : 'none';
        
        const team1Score = document.getElementById('team1-score');
        const team2Score = document.getElementById('team2-score');
        
        if (team1Score && team2Score) {
            team1Score.classList.toggle('current-turn', this.currentPlayer === 1);
            team2Score.classList.toggle('current-turn', this.currentPlayer === 2);
        }
    }

    selectPoints(team, points) {
        if (this.pointsApplied || this.applyButtonClicked) return;
        
        this.selectedPoints[team] = points;
        
        const selectionElement = document.getElementById(`team${team}-selection`);
        if (selectionElement) {
            selectionElement.innerHTML = `Выбрано: <span>${points > 0 ? '+' : ''}${points} очков</span>`;
        }
        
        document.querySelectorAll(`.point-btn[data-team="${team}"]`).forEach(btn => {
            btn.classList.remove('selected');
        });
        
        const selectedBtn = document.querySelector(`.point-btn[data-team="${team}"][data-points="${points}"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
        }
    }

    showMasterPanel() {
        const panel = document.getElementById('master-panel');
        if (panel) {
            panel.style.display = 'block';
        }
    }

    hideCard() {
        const modal = document.getElementById('card-modal');
        if (modal) {
            modal.classList.remove('active');
            const cardContent = modal.querySelector('.card-content');
            if (cardContent) {
                cardContent.classList.remove('flipped');
            }
        }
    }

    startTimer() {
        clearInterval(this.timerInterval);
        this.timer = 60;
        const timerElement = document.getElementById('timer');
        
        if (timerElement) {
            timerElement.textContent = this.timer;
        }
        
        this.timerInterval = setInterval(() => {
            this.timer--;
            
            if (timerElement) {
                timerElement.textContent = this.timer;
                
                if (this.timer <= 10) {
                    timerElement.style.color = '#f44336';
                } else {
                    timerElement.style.color = 'white';
                }
            }
            
            if (this.timer <= 0) {
                clearInterval(this.timerInterval);
                this.hideCard();
                
                if (this.role === 'master' || this.gameMode === 'local') {
                    this.showMasterPanel();
                } else {
                    this.stopTimerAndCloseCard();
                }
            }
        }, 1000);
    }

    showWinner(team) {
        clearInterval(this.timerInterval);
        
        const fireworks = document.getElementById('fireworks');
        if (fireworks) {
            fireworks.style.display = 'block';
            fireworks.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 3000; display: flex; justify-content: center; align-items: center;">
                    <div style="background: white; padding: 40px; border-radius: 20px; text-align: center; border: 10px solid gold;">
                        <h1 style="color: #333; font-size: 48px; margin-bottom: 20px;">🎉 ПОБЕДА! 🎉</h1>
                        <h2 style="color: #${team === 1 ? '2196F3' : 'FF5722'}; font-size: 36px;">
                            Команда ${team} победила!
                        </h2>
                        <p style="font-size: 24px; margin: 20px 0;">Счёт: ${this.scores[1]} - ${this.scores[2]}</p>
                        <button onclick="location.reload()" style="background: #4CAF50; color: white; border: none; padding: 15px 30px; font-size: 18px; border-radius: 10px; cursor: pointer; margin-top: 20px;">
                            Новая игра
                        </button>
                    </div>
                </div>
            `;
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : type === 'warning' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    showAlert(message) {
        alert(message);
    }

    getCategoryName(type) {
        const names = {
            1: 'Кухня',
            2: 'Бар',
            3: 'Знания',
            4: 'Ситуация',
            5: 'Сервис',
            6: 'Продажи'
        };
        return names[type] || `Категория ${type}`;
    }

    getRoleName() {
        const names = {
            'master': 'Ведущий',
            'player1': 'Игрок 1',
            'player2': 'Игрок 2',
            'local': 'Локальный игрок'
        };
        return names[this.role] || this.role;
    }

    getRoleNameFromType(role) {
        const names = {
            'master': 'Ведущий',
            'player1': 'Игрок 1',
            'player2': 'Игрок 2'
        };
        return names[role] || role;
    }

    async initVideo() {
        if (this.gameMode !== 'online') return;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
            });
            
            const videoElement = document.createElement('video');
            videoElement.srcObject = stream;
            videoElement.autoplay = true;
            videoElement.muted = true;
            
            const placeholder = document.querySelector(`#video-${this.role === 'player1' ? 'team1' : this.role === 'player2' ? 'team2' : 'master'} .video-placeholder`);
            if (placeholder) {
                placeholder.innerHTML = '';
                placeholder.appendChild(videoElement);
            }
            
            console.log('✅ Видео поток активирован');
        } catch (error) {
            console.warn('⚠️ Не удалось получить доступ к камере:', error);
        }
    }

    updateVideoPlaceholders(players) {
        const placeholders = {
            master: document.querySelector('#video-master p'),
            team1: document.querySelector('#video-team1 p'),
            team2: document.querySelector('#video-team2 p')
        };
        
        if (placeholders.master && players.master) {
            placeholders.master.textContent = players.master;
        }
        if (placeholders.team1 && players.player1) {
            placeholders.team1.textContent = players.player1;
        }
        if (placeholders.team2 && players.player2) {
            placeholders.team2.textContent = players.player2;
        }
    }

    setupRoleInterface() {
        if (this.gameMode === 'online') {
            if (this.role === 'master') {
                document.getElementById('master-panel').style.display = 'block';
            } else {
                document.getElementById('master-panel').style.display = 'none';
            }
        }
    }

    resetSelection() {
        this.selectedPoints = { 1: 0, 2: 0 };
        
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
        if (nextTurnBtn) {
            nextTurnBtn.disabled = true;
            nextTurnBtn.style.opacity = '0.6';
        }
        
        const team1Selection = document.getElementById('team1-selection');
        const team2Selection = document.getElementById('team2-selection');
        if (team1Selection) team1Selection.innerHTML = 'Выбрано: <span>0 очков</span>';
        if (team2Selection) team2Selection.innerHTML = 'Выбрано: <span>0 очков</span>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
[file content end]
