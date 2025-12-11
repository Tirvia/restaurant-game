<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Админ-панель игры</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Arial', sans-serif;
            background: #1a1a1a;
            color: white;
            padding: 20px;
        }

        .admin-container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding: 20px;
            background: #2a2a2a;
            border-radius: 10px;
            border-left: 5px solid #4CAF50;
        }

        .header h1 {
            color: #4CAF50;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: #2a2a2a;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            transition: transform 0.3s;
        }

        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.3);
        }

        .stat-card i {
            font-size: 40px;
            margin-bottom: 15px;
            color: #4CAF50;
        }

        .stat-card h3 {
            font-size: 14px;
            color: #aaa;
            margin-bottom: 10px;
            text-transform: uppercase;
        }

        .stat-card .value {
            font-size: 36px;
            font-weight: bold;
            color: white;
        }

        .rooms-list {
            background: #2a2a2a;
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 30px;
        }

        .rooms-header {
            background: #333;
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #444;
        }

        .room-item {
            padding: 15px 20px;
            border-bottom: 1px solid #444;
            display: grid;
            grid-template-columns: 100px 150px 150px 150px 150px 150px auto;
            gap: 15px;
            align-items: center;
        }

        .room-item:last-child {
            border-bottom: none;
        }

        .room-item:hover {
            background: #333;
        }

        .room-code {
            font-weight: bold;
            color: #4CAF50;
            font-family: monospace;
            font-size: 18px;
        }

        .player-status {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }

        .player-status.connected {
            background: rgba(76, 175, 80, 0.2);
            color: #4CAF50;
        }

        .player-status.disconnected {
            background: rgba(244, 67, 54, 0.2);
            color: #f44336;
        }

        .game-status {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }

        .game-status.active {
            background: rgba(33, 150, 243, 0.2);
            color: #2196F3;
        }

        .game-status.waiting {
            background: rgba(255, 193, 7, 0.2);
            color: #FFC107;
        }

        .controls {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }

        .btn {
            padding: 10px 20px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s;
        }

        .btn:hover {
            background: #45a049;
            transform: translateY(-2px);
        }

        .btn.refresh {
            background: #2196F3;
        }

        .btn.refresh:hover {
            background: #1976D2;
        }

        .btn.clear {
            background: #f44336;
        }

        .btn.clear:hover {
            background: #d32f2f;
        }

        .server-info {
            background: #2a2a2a;
            padding: 20px;
            border-radius: 10px;
            margin-top: 30px;
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }

        .info-item {
            display: flex;
            flex-direction: column;
        }

        .info-label {
            font-size: 12px;
            color: #aaa;
            margin-bottom: 5px;
        }

        .info-value {
            font-size: 16px;
            font-weight: bold;
            color: white;
        }

        @media (max-width: 768px) {
            .room-item {
                grid-template-columns: 1fr;
                gap: 10px;
            }
            
            .stat-card .value {
                font-size: 28px;
            }
        }
    </style>
</head>
<body>
    <div class="admin-container">
        <div class="header">
            <h1><i class="fas fa-cogs"></i> Админ-панель игры</h1>
            <div class="controls">
                <button id="refresh-btn" class="btn refresh">
                    <i class="fas fa-sync-alt"></i> Обновить
                </button>
                <button id="clear-rooms-btn" class="btn clear">
                    <i class="fas fa-trash"></i> Очистить неактивные
                </button>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <i class="fas fa-door-open"></i>
                <h3>Активных комнат</h3>
                <div class="value" id="total-rooms">0</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-gamepad"></i>
                <h3>Активных игр</h3>
                <div class="value" id="active-games">0</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-users"></i>
                <h3>Подключенных игроков</h3>
                <div class="value" id="active-players">0</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-hourglass-half"></i>
                <h3>Ожидающих комнат</h3>
                <div class="value" id="waiting-rooms">0</div>
            </div>
        </div>

        <div class="rooms-list">
            <div class="rooms-header">
                <h2><i class="fas fa-list"></i> Активные комнаты</h2>
                <span id="rooms-count">0 комнат</span>
            </div>
            <div id="rooms-container">
                <!-- Комнаты будут загружены здесь -->
            </div>
        </div>

        <div class="server-info">
            <h3><i class="fas fa-server"></i> Информация о сервере</h3>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Статус</span>
                    <span class="info-value" id="server-status">Запущен</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Время работы</span>
                    <span class="info-value" id="uptime">0 сек</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Порт</span>
                    <span class="info-value" id="server-port">3000</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Последнее обновление</span>
                    <span class="info-value" id="last-update">-</span>
                </div>
            </div>
        </div>
    </div>

    <script>
        let lastUpdate = null;

        async function loadStats() {
            try {
                const response = await fetch('/stats');
                const data = await response.json();
                
                // Обновляем статистику
                document.getElementById('total-rooms').textContent = data.totalRooms;
                document.getElementById('active-games').textContent = data.activeGames;
                document.getElementById('waiting-rooms').textContent = data.waitingRooms;
                document.getElementById('rooms-count').textContent = `${data.totalRooms} комнат`;
                
                // Обновляем время работы
                document.getElementById('uptime').textContent = `${Math.floor(data.uptime)} сек`;
                
                // Обновляем список комнат
                updateRoomsList(data.rooms);
                
                lastUpdate = new Date();
                document.getElementById('last-update').textContent = lastUpdate.toLocaleTimeString();
                
            } catch (error) {
                console.error('Ошибка загрузки статистики:', error);
                document.getElementById('server-status').textContent = 'Ошибка';
                document.getElementById('server-status').style.color = '#f44336';
            }
        }

        function updateRoomsList(rooms) {
            const container = document.getElementById('rooms-container');
            
            if (rooms.length === 0) {
                container.innerHTML = `
                    <div class="room-item" style="text-align: center; grid-template-columns: 1fr;">
                        <p>Нет активных комнат</p>
                    </div>
                `;
                return;
            }
            
            let html = '';
            
            rooms.forEach(room => {
                const isGameActive = room.player1 !== 'Ожидает' && room.player2 !== 'Ожидает';
                
                html += `
                    <div class="room-item">
                        <div class="room-code">${room.code}</div>
                        <div>
                            <div style="font-weight: bold;">${room.master}</div>
                            <small>Ведущий</small>
                        </div>
                        <div>
                            <div>${room.player1}</div>
                            <span class="player-status ${room.player1 !== 'Ожидает' ? 'connected' : 'disconnected'}">
                                ${room.player1 !== 'Ожидает' ? 'Подключен' : 'Ожидает'}
                            </span>
                        </div>
                        <div>
                            <div>${room.player2}</div>
                            <span class="player-status ${room.player2 !== 'Ожидает' ? 'connected' : 'disconnected'}">
                                ${room.player2 !== 'Ожидает' ? 'Подключен' : 'Ожидает'}
                            </span>
                        </div>
                        <div>
                            <span class="game-status ${isGameActive ? 'active' : 'waiting'}">
                                ${isGameActive ? 'Игра идет' : 'Ожидание'}
                            </span>
                        </div>
                        <div>
                            <div>Счет: ${room.state.scores[1]}:${room.state.scores[2]}</div>
                            <small>Ход: команда ${room.state.currentPlayer}</small>
                        </div>
                        <div>
                            <small>Создана: ${room.created}</small>
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        }

        async function clearInactiveRooms() {
            if (!confirm('Удалить все неактивные комнаты?')) return;
            
            try {
                const response = await fetch('/clear-rooms', { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    alert(`Удалено ${result.cleaned} неактивных комнат`);
                    loadStats();
                }
            } catch (error) {
                console.error('Ошибка очистки комнат:', error);
                alert('Ошибка при очистке комнат');
            }
        }

        // Загружаем статистику при загрузке страницы
        document.addEventListener('DOMContentLoaded', () => {
            loadStats();
            
            // Автообновление каждые 10 секунд
            setInterval(loadStats, 10000);
            
            // Кнопка обновления
            document.getElementById('refresh-btn').addEventListener('click', loadStats);
            
            // Кнопка очистки неактивных комнат
            document.getElementById('clear-rooms-btn').addEventListener('click', clearInactiveRooms);
            
            // Получаем порт сервера
            document.getElementById('server-port').textContent = window.location.port || 3000;
        });
    </script>
</body>
</html>
