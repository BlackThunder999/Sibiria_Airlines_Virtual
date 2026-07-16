// Админ-панель NobuChirp
// Пароль проверяется через бесплатную функцию Supabase
// В коде пароля нет

var SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
var SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';

window.openNobuAdmin = function(user, apiFn, toastFn, profileFn, escFn, $Fn) {

    var $ = $Fn;
    var api = apiFn;
    var toast = toastFn;
    var profile = profileFn;
    var esc = escFn;

    var password = prompt('Пароль администратора:');
    if (!password) return;

    toast('Проверка пароля...');

    // Отправляем пароль на проверку в Supabase
    fetch(SUPABASE_URL + '/rest/v1/rpc/check_admin_password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY
        },
        body: JSON.stringify({ input_password: password })
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (!data.success) {
            toast('Неверный пароль');
            return;
        }

        toast('Доступ разрешён');

        var modal = $('#adminModal');
        if (modal) modal.style.display = 'flex';

        loadPanel();

        async function loadPanel() {
            var box = $('#adminModalContent');
            box.innerHTML = '<div class="feed-loading">Загрузка...</div>';

            try {
                var reports = await api('GET', 'reports?order=created_at.desc&limit=30');
                var bans = await api('GET', 'users?is_banned=eq.true&select=*');

                var rHTML = '';
                if (reports && reports.length) {
                    for (var i = 0; i < reports.length; i++) {
                        var r = reports[i];
                        rHTML += '<div style="padding:8px 0;border-bottom:1px solid #2a2a2a;font-size:12px;">' +
                            '<b>' + esc(r.from_username) + '</b> → пост <code>' + (r.chirp_id||'').substring(0,8) + '</code><br>' +
                            'Причина: ' + esc(r.reason) + '<br>' +
                            '<button class="admin-btn danger" data-del="' + r.chirp_id + '">Удалить пост</button></div>';
                    }
                } else {
                    rHTML = '<p style="color:#888;">Жалоб нет</p>';
                }

                var bHTML = '';
                if (bans && bans.length) {
                    for (var j = 0; j < bans.length; j++) {
                        var b = bans[j];
                        var exp = b.ban_expires ? new Date(b.ban_expires).toLocaleDateString('ru-RU') : 'Навсегда';
                        bHTML += '<div style="padding:8px 0;border-bottom:1px solid #2a2a2a;font-size:12px;">' +
                            '<b>' + esc(b.username) + '</b> — ' + esc(b.ban_reason||'Без причины') + '<br>' +
                            'До: ' + exp + '<br>' +
                            '<button class="admin-btn success" data-unban="' + b.id + '">Разбанить</button></div>';
                    }
                } else {
                    bHTML = '<p style="color:#888;">Банов нет</p>';
                }

                box.innerHTML =
                    '<div class="modal-header"><h3>Админ-панель</h3><button class="modal-close" id="admClose">&times;</button></div>' +

                    '<div class="admin-section"><h4>Бан пользователя</h4>' +
                    '<div class="admin-row"><input id="banUser" placeholder="Никнейм"><select id="banDur">' +
                    '<option value="1">1 день</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="forever">Навсегда</option></select></div>' +
                    '<input class="admin-input" id="banReason" placeholder="Причина бана">' +
                    '<button class="admin-btn danger" id="banBtn">Забанить</button></div>' +

                    '<div class="admin-section"><h4>Предупреждение</h4>' +
                    '<input class="admin-input" id="warnUser" placeholder="Никнейм">' +
                    '<input class="admin-input" id="warnReason" placeholder="Причина">' +
                    '<button class="admin-btn warn" id="warnBtn">Предупредить</button></div>' +

                    '<div class="admin-section"><h4>Верификация</h4>' +
                    '<input class="admin-input" id="verifyUser" placeholder="Никнейм">' +
                    '<button class="admin-btn info" id="verifyBtn">Выдать галочку</button></div>' +

                    '<div class="admin-section"><h4>Удалить пост</h4>' +
                    '<input class="admin-input" id="delPost" placeholder="ID поста">' +
                    '<button class="admin-btn danger" id="delBtn">Удалить</button></div>' +

                    '<div class="admin-section"><h4>Посмотреть профиль</h4>' +
                    '<input class="admin-input" id="viewUser" placeholder="Никнейм">' +
                    '<button class="admin-btn info" id="viewBtn">Смотреть</button></div>' +

                    '<div class="admin-section"><h4>Жалобы</h4>' + rHTML + '</div>' +
                    '<div class="admin-section"><h4>Активные баны</h4>' + bHTML + '</div>';

                // Закрыть
                document.getElementById('admClose').onclick = function() {
                    document.getElementById('adminModal').style.display = 'none';
                };

                // Бан
                document.getElementById('banBtn').onclick = async function() {
                    var u = document.getElementById('banUser').value.trim();
                    var dur = document.getElementById('banDur').value;
                    var r = document.getElementById('banReason').value.trim();
                    if (!u) { toast('Введите никнейм'); return; }
                    var users = await api('GET', 'users?username=eq.' + encodeURIComponent(u) + '&select=*');
                    if (!users || !users.length) { toast('Пользователь не найден'); return; }
                    var exp = null;
                    if (dur !== 'forever') {
                        var d = new Date();
                        d.setDate(d.getDate() + parseInt(dur));
                        exp = d.toISOString();
                    }
                    await api('PATCH', 'users?id=eq.' + users[0].id, {
                        is_banned: true,
                        ban_reason: r || 'Нарушение правил',
                        ban_expires: exp
                    });
                    toast('Пользователь забанен');
                    loadPanel();
                };

                // Предупреждение
                document.getElementById('warnBtn').onclick = async function() {
                    var u = document.getElementById('warnUser').value.trim();
                    var r = document.getElementById('warnReason').value.trim();
                    if (!u) { toast('Введите никнейм'); return; }
                    var users = await api('GET', 'users?username=eq.' + encodeURIComponent(u) + '&select=*');
                    if (!users || !users.length) { toast('Пользователь не найден'); return; }
                    await api('POST', 'warnings', {
                        user_id: users[0].id,
                        username: users[0].username,
                        reason: r || 'Нарушение правил'
                    });
                    toast('Предупреждение выдано');
                    loadPanel();
                };

                // Верификация
                document.getElementById('verifyBtn').onclick = async function() {
                    var u = document.getElementById('verifyUser').value.trim();
                    if (!u) { toast('Введите никнейм'); return; }
                    var users = await api('GET', 'users?username=eq.' + encodeURIComponent(u) + '&select=*');
                    if (!users || !users.length) { toast('Пользователь не найден'); return; }
                    await api('PATCH', 'users?id=eq.' + users[0].id, { is_verified: true });
                    toast('Галочка выдана');
                    loadPanel();
                };

                // Удалить пост
                document.getElementById('delBtn').onclick = async function() {
                    var id = document.getElementById('delPost').value.trim();
                    if (!id) { toast('Введите ID поста'); return; }
                    await api('DELETE', 'chirps?id=eq.' + id);
                    toast('Пост удалён');
                    loadPanel();
                };

                // Посмотреть профиль
                document.getElementById('viewBtn').onclick = async function() {
                    var u = document.getElementById('viewUser').value.trim();
                    if (!u) { toast('Введите никнейм'); return; }
                    var users = await api('GET', 'users?username=eq.' + encodeURIComponent(u) + '&select=*');
                    if (!users || !users.length) { toast('Пользователь не найден'); return; }
                    document.getElementById('adminModal').style.display = 'none';
                    profile(users[0].id);
                };

                // Удалить пост из жалоб
                var delBtns = document.querySelectorAll('[data-del]');
                for (var k = 0; k < delBtns.length; k++) {
                    delBtns[k].onclick = async function() {
                        await api('DELETE', 'chirps?id=eq.' + this.dataset.del);
                        toast('Пост удалён');
                        loadPanel();
                    };
                }

                // Разбанить
                var unbanBtns = document.querySelectorAll('[data-unban]');
                for (var m = 0; m < unbanBtns.length; m++) {
                    unbanBtns[m].onclick = async function() {
                        await api('PATCH', 'users?id=eq.' + this.dataset.unban, {
                            is_banned: false,
                            ban_reason: null,
                            ban_expires: null
                        });
                        toast('Пользователь разбанен');
                        loadPanel();
                    };
                }

            } catch(e) {
                box.innerHTML = '<p style="color:#e74c3c;text-align:center;padding:20px;">Ошибка загрузки админ-панели</p>';
            }
        }
    })
    .catch(function() {
        toast('Ошибка соединения');
    });
};
