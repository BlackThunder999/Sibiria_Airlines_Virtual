// ============================
// SUPABASE CONFIG
// ============================
const SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
const ADMIN_PASSWORD = 'nobu2467';

// ============================
// GLOBAL STATE
// ============================
let currentUser = null;
let currentScreen = 'feed';
let banCheckInterval = null;
let warningTimerInterval = null;
let imageFile = null;
let avatarFile = null;
let subscriptions = [];

// ============================
// DOM HELPERS
// ============================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ============================
// API HELPERS
// ============================
async function api(method, path, body = null, isStorage = false) {
    const url = isStorage
        ? `${SUPABASE_URL}/storage/v1/object/${path}`
        : `${SUPABASE_URL}/rest/v1/${path}`;
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
    };
    if (!isStorage && body !== null && method !== 'DELETE') {
        headers['Content-Type'] = 'application/json';
        headers['Prefer'] = method === 'POST' ? 'return=representation' : 'return=minimal';
    }
    const options = { method, headers };
    if (body && method !== 'DELETE') {
        options.body = isStorage ? body : JSON.stringify(body);
    }
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

// ============================
// INIT
// ============================
function init() {
    const saved = localStorage.getItem('nobuchirp_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        checkBanAndWarnings().then(() => {
            if (!isOverlayActive()) showMainApp();
        });
    }
    setTimeout(() => {
        const splash = $('#splashScreen');
        if (splash) splash.style.display = 'none';
        if (!currentUser) showAuthScreen();
    }, 2000);
}

function isOverlayActive() {
    const ban = $('#banScreen');
    const warn = $('#warningScreen');
    return (ban && ban.style.display === 'flex') || (warn && warn.style.display === 'flex');
}

// ============================
// LOGOUT
// ============================
function logout() {
    clearAllIntervals();
    currentUser = null;
    subscriptions = [];
    localStorage.removeItem('nobuchirp_user');
    hideAllModals();
    const main = $('#mainApp');
    if (main) main.style.display = 'none';
    const ban = $('#banScreen');
    if (ban) ban.style.display = 'none';
    const warn = $('#warningScreen');
    if (warn) warn.style.display = 'none';
    showAuthScreen();
}

function clearAllIntervals() {
    if (banCheckInterval) { clearInterval(banCheckInterval); banCheckInterval = null; }
    if (warningTimerInterval) { clearInterval(warningTimerInterval); warningTimerInterval = null; }
}

function hideAllModals() {
    const modals = ['#composeModal', '#profileModal', '#commentsModal', '#adminModal', '#editProfileModal'];
    modals.forEach(sel => {
        const el = $(sel);
        if (el) el.style.display = 'none';
    });
}

// ============================
// AUTH
// ============================
function showAuthScreen() {
    const authScr = $('#authScreen');
    const main = $('#mainApp');
    if (authScr) authScr.style.display = 'flex';
    if (main) main.style.display = 'none';
    const username = $('#authUsername');
    const password = $('#authPassword');
    const error = $('#authError');
    if (username) username.value = '';
    if (password) password.value = '';
    if (error) error.textContent = '';
}

function showMainApp() {
    const authScr = $('#authScreen');
    const main = $('#mainApp');
    if (authScr) authScr.style.display = 'none';
    if (main) main.style.display = 'flex';
    updateHeaderAvatar();
    loadFeed();
    loadSubscriptions();
    startBanCheck();
}

function updateHeaderAvatar() {
    if (!currentUser) return;
    const avatar = $('#headerAvatar');
    if (!avatar) return;
    avatar.style.backgroundImage = '';
    avatar.textContent = '';
    if (currentUser.avatar_url) {
        avatar.style.backgroundImage = `url(${currentUser.avatar_url})`;
        avatar.style.backgroundSize = 'cover';
    } else {
        avatar.textContent = currentUser.avatar_emoji || '👤';
    }
}

// Auth tabs
$$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        $$('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        authMode = tab.dataset.tab;
        const btn = $('#authSubmitBtn');
        if (btn) btn.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться';
        const err = $('#authError');
        if (err) err.textContent = '';
    });
});

// Auth form submit
const authFormEl = $('#authForm');
if (authFormEl) {
    authFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameEl = $('#authUsername');
        const passwordEl = $('#authPassword');
        const errorEl = $('#authError');
        const submitBtn = $('#authSubmitBtn');
        const username = usernameEl ? usernameEl.value.trim() : '';
        const password = passwordEl ? passwordEl.value.trim() : '';

        if (!username || !password) { if (errorEl) errorEl.textContent = 'Заполните все поля'; return; }
        if (username.length < 2) { if (errorEl) errorEl.textContent = 'Никнейм от 2 символов'; return; }
        if (password.length < 4) { if (errorEl) errorEl.textContent = 'Пароль от 4 символов'; return; }

        if (submitBtn) submitBtn.disabled = true;
        if (errorEl) errorEl.textContent = '';

        try {
            if (authMode === 'register') {
                const existing = await api('GET', `users?username=eq.${encodeURIComponent(username)}&select=id`);
                if (existing && existing.length > 0) {
                    if (errorEl) errorEl.textContent = 'Никнейм уже занят';
                    if (submitBtn) submitBtn.disabled = false;
                    return;
                }
                const newUser = await api('POST', 'users', {
                    username, password, avatar_emoji: '👤', avatar_url: null,
                    bio: '', is_verified: false, is_banned: false, streak_count: 0
                });
                if (newUser && newUser.length > 0) currentUser = newUser[0];
            } else {
                const users = await api('GET', `users?username=eq.${encodeURIComponent(username)}&password=eq.${encodeURIComponent(password)}&select=*`);
                if (!users || users.length === 0) {
                    if (errorEl) errorEl.textContent = 'Неверный никнейм или пароль';
                    if (submitBtn) submitBtn.disabled = false;
                    return;
                }
                currentUser = users[0];
            }

            localStorage.setItem('nobuchirp_user', JSON.stringify(currentUser));
            await checkBanAndWarnings();
            if (!isOverlayActive()) showMainApp();
        } catch (err) {
            if (errorEl) errorEl.textContent = 'Ошибка соединения';
        }
        if (submitBtn) submitBtn.disabled = false;
    });
}

// ============================
// BAN & WARNING
// ============================
async function checkBanAndWarnings() {
    if (!currentUser) return;
    try {
        const users = await api('GET', `users?id=eq.${currentUser.id}&select=*`);
        if (users && users.length > 0) {
            currentUser = users[0];
            localStorage.setItem('nobuchirp_user', JSON.stringify(currentUser));

            if (currentUser.is_banned) {
                const now = new Date();
                if (currentUser.ban_expires && new Date(currentUser.ban_expires) < now) {
                    await api('PATCH', `users?id=eq.${currentUser.id}`, { is_banned: false, ban_reason: null, ban_expires: null });
                    currentUser.is_banned = false;
                    localStorage.setItem('nobuchirp_user', JSON.stringify(currentUser));
                    const ban = $('#banScreen'); if (ban) ban.style.display = 'none';
                } else {
                    showBanScreen(currentUser.ban_reason, currentUser.ban_expires);
                    return;
                }
            } else {
                const ban = $('#banScreen'); if (ban) ban.style.display = 'none';
            }
        }

        const warnings = await api('GET', `warnings?user_id=eq.${currentUser.id}&is_read=eq.false&order=created_at.desc&limit=1`);
        if (warnings && warnings.length > 0) {
            showWarningScreen(warnings[0]);
        } else {
            const warn = $('#warningScreen'); if (warn) warn.style.display = 'none';
        }
    } catch (e) {}
}

function startBanCheck() {
    if (banCheckInterval) clearInterval(banCheckInterval);
    banCheckInterval = setInterval(checkBanAndWarnings, 10000);
}

function showBanScreen(reason, expires) {
    const main = $('#mainApp'); if (main) main.style.display = 'none';
    const auth = $('#authScreen'); if (auth) auth.style.display = 'none';
    const ban = $('#banScreen'); if (ban) ban.style.display = 'flex';
    const reasonEl = $('#banReason'); if (reasonEl) reasonEl.textContent = `Причина: ${reason || 'Нарушение правил'}`;
    const expiresEl = $('#banExpires');
    if (expiresEl) {
        if (expires) {
            const d = new Date(expires);
            expiresEl.textContent = `Разбан: ${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'})}`;
        } else {
            expiresEl.textContent = 'Бан навсегда';
        }
    }
    const rulesEl = $('#banRules');
    if (rulesEl) rulesEl.innerHTML = `<p><strong>📜 Правила:</strong></p><p>1. Без оскорблений<br>2. Без спама<br>3. Без 18+<br>4. Без наркотиков<br>5. Без угроз</p>`;
}

function showWarningScreen(warning) {
    const main = $('#mainApp'); if (main) main.style.display = 'none';
    const auth = $('#authScreen'); if (auth) auth.style.display = 'none';
    const warn = $('#warningScreen'); if (warn) warn.style.display = 'flex';
    const reasonEl = $('#warningReason'); if (reasonEl) reasonEl.textContent = `Причина: ${warning.reason || 'Нарушение правил'}`;
    const dismissBtn = $('#warningDismissBtn'); if (dismissBtn) dismissBtn.disabled = true;
    startWarningCountdown(60);
}

const dismissBtn = $('#warningDismissBtn');
if (dismissBtn) {
    dismissBtn.addEventListener('click', async () => {
        if (dismissBtn.disabled) return;
        try {
            const warnings = await api('GET', `warnings?user_id=eq.${currentUser.id}&is_read=eq.false&order=created_at.desc&limit=1`);
            if (warnings && warnings.length > 0) {
                await api('PATCH', `warnings?id=eq.${warnings[0].id}`, { is_read: true });
            }
        } catch (e) {}
        if (warningTimerInterval) { clearInterval(warningTimerInterval); warningTimerInterval = null; }
        const warn = $('#warningScreen'); if (warn) warn.style.display = 'none';
        showMainApp();
    });
}

function startWarningCountdown(seconds) {
    if (warningTimerInterval) clearInterval(warningTimerInterval);
    const el = $('#warningTimer');
    if (!el) return;
    let remaining = seconds;
    el.textContent = formatTime(remaining);
    warningTimerInterval = setInterval(() => {
        remaining--;
        el.textContent = formatTime(remaining);
        if (remaining <= 0) {
            clearInterval(warningTimerInterval);
            warningTimerInterval = null;
            const btn = $('#warningDismissBtn');
            if (btn) btn.disabled = false;
        }
    }, 1000);
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ============================
// FEED
// ============================
async function loadFeed() {
    const container = $('#feedContainer');
    if (!container) return;
    container.innerHTML = '<div class="feed-loading">Загрузка...</div>';
    try {
        const chirps = await api('GET', 'chirps?order=created_at.desc&limit=50');
        renderChirps(container, chirps || []);
    } catch (e) {
        container.innerHTML = '<div class="feed-loading">Ошибка загрузки</div>';
    }
}

async function loadSubscriptionsFeed() {
    const container = $('#subscriptionsContainer');
    if (!container) return;
    if (subscriptions.length === 0) {
        container.innerHTML = '<p class="empty-feed">Подпишитесь на пользователей, чтобы видеть их посты</p>';
        return;
    }
    container.innerHTML = '<div class="feed-loading">Загрузка...</div>';
    try {
        const ids = subscriptions.map(s => `"${s}"`).join(',');
        const chirps = await api('GET', `chirps?user_id=in.(${ids})&order=created_at.desc&limit=50`);
        renderChirps(container, chirps || []);
    } catch (e) {
        container.innerHTML = '<div class="feed-loading">Ошибка загрузки</div>';
    }
}

function renderChirps(container, chirps) {
    if (!chirps || chirps.length === 0) {
        container.innerHTML = '<p class="empty-feed">Пока нет постов</p>';
        return;
    }
    container.innerHTML = chirps.map(c => chirpCardHTML(c)).join('');
    attachChirpEvents(container);
}

function chirpCardHTML(c) {
    const time = new Date(c.created_at).toLocaleString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    const verifiedIcon = c.is_verified ? ' <span class="verified-badge"><i class="fa-solid fa-circle-check"></i></span>' : '';
    const fireIcon = c.is_fire ? ' <span class="fire-badge">🔥</span>' : '';
    const imageHTML = c.image_url ? `<img class="chirp-image" src="${c.image_url}" alt="" loading="lazy" onclick="window.open('${c.image_url}')">` : '';
    const contentHTML = escapeHTML(c.content).replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
    const shortId = c.id ? c.id.substring(0, 8) : '';

    let avatarHTML = `<span class="chirp-avatar">${c.avatar_emoji || '👤'}</span>`;
    if (c.avatar_url) {
        avatarHTML = `<span class="chirp-avatar" style="background-image:url(${c.avatar_url});background-size:cover;"></span>`;
    }

    return `
        <div class="chirp-card" data-id="${c.id || ''}">
            <div class="chirp-header">
                ${avatarHTML}
                <span class="chirp-username">${escapeHTML(c.username || '')}${verifiedIcon}${fireIcon}</span>
                <span class="chirp-time">${time}</span>
            </div>
            <div class="chirp-content">${contentHTML}</div>
            ${imageHTML}
            <div class="chirp-actions">
                <button class="chirp-action like-btn" data-chirp="${c.id}"><i class="fa-regular fa-heart"></i> <span>${c.likes || 0}</span></button>
                <button class="chirp-action dislike-btn" data-chirp="${c.id}"><i class="fa-regular fa-thumbs-down"></i> <span>${c.dislikes || 0}</span></button>
                <button class="chirp-action rechirp-btn" data-chirp="${c.id}"><i class="fa-solid fa-retweet"></i> <span>${c.rechirps || 0}</span></button>
                <button class="chirp-action comment-btn" data-chirp="${c.id}"><i class="fa-regular fa-comment"></i></button>
                <button class="chirp-action report-btn" data-chirp="${c.id}"><i class="fa-regular fa-flag"></i></button>
            </div>
            <span class="chirp-id" data-id="${c.id}" title="Копировать ID">#${shortId}</span>
        </div>`;
}

function attachChirpEvents(container) {
    container.querySelectorAll('.like-btn').forEach(b => b.addEventListener('click', () => handleLike(b.dataset.chirp)));
    container.querySelectorAll('.dislike-btn').forEach(b => b.addEventListener('click', () => handleDislike(b.dataset.chirp)));
    container.querySelectorAll('.rechirp-btn').forEach(b => b.addEventListener('click', () => handleRechirp(b.dataset.chirp)));
    container.querySelectorAll('.comment-btn').forEach(b => b.addEventListener('click', () => openComments(b.dataset.chirp)));
    container.querySelectorAll('.report-btn').forEach(b => b.addEventListener('click', () => handleReport(b.dataset.chirp)));
    container.querySelectorAll('.chirp-id').forEach(el => {
        el.addEventListener('click', () => {
            navigator.clipboard.writeText(el.dataset.id).then(() => showToast('ID скопирован')).catch(() => {});
        });
    });
}

// ============================
// LIKE / DISLIKE / RECHIRP
// ============================
async function handleLike(chirpId) {
    if (!currentUser || !chirpId) return;
    try {
        const ex = await api('GET', `likes?user_id=eq.${currentUser.id}&chirp_id=eq.${chirpId}`);
        if (ex && ex.length > 0) {
            await api('DELETE', `likes?id=eq.${ex[0].id}`);
        } else {
            await api('POST', 'likes', { user_id: currentUser.id, chirp_id: chirpId });
            await api('DELETE', `dislikes?user_id=eq.${currentUser.id}&chirp_id=eq.${chirpId}`);
        }
        const lc = await getCount('likes', chirpId);
        const dc = await getCount('dislikes', chirpId);
        await api('PATCH', `chirps?id=eq.${chirpId}`, { likes: lc, dislikes: dc });
        refreshCurrentScreen();
    } catch (e) {}
}

async function handleDislike(chirpId) {
    if (!currentUser || !chirpId) return;
    try {
        const ex = await api('GET', `dislikes?user_id=eq.${currentUser.id}&chirp_id=eq.${chirpId}`);
        if (ex && ex.length > 0) {
            await api('DELETE', `dislikes?id=eq.${ex[0].id}`);
        } else {
            await api('POST', 'dislikes', { user_id: currentUser.id, chirp_id: chirpId });
            await api('DELETE', `likes?user_id=eq.${currentUser.id}&chirp_id=eq.${chirpId}`);
        }
        const lc = await getCount('likes', chirpId);
        const dc = await getCount('dislikes', chirpId);
        await api('PATCH', `chirps?id=eq.${chirpId}`, { likes: lc, dislikes: dc });
        refreshCurrentScreen();
    } catch (e) {}
}

async function handleRechirp(chirpId) {
    if (!currentUser || !chirpId) return;
    try {
        const ex = await api('GET', `rechirps?user_id=eq.${currentUser.id}&chirp_id=eq.${chirpId}`);
        if (ex && ex.length > 0) { showToast('Вы уже делали речирп'); return; }
        await api('POST', 'rechirps', { user_id: currentUser.id, chirp_id: chirpId });
        const count = await getCount('rechirps', chirpId);
        await api('PATCH', `chirps?id=eq.${chirpId}`, { rechirps: count });
        refreshCurrentScreen();
    } catch (e) {}
}

async function getCount(table, chirpId) {
    try {
        const res = await api('GET', `${table}?chirp_id=eq.${chirpId}&select=id`);
        return res ? res.length : 0;
    } catch (e) { return 0; }
}

function refreshCurrentScreen() {
    if (currentScreen === 'feed') loadFeed();
    else if (currentScreen === 'subscriptions') loadSubscriptionsFeed();
}

// ============================
// COMPOSE
// ============================
$('#composeNavBtn').addEventListener('click', openCompose);
$('#composeClose').addEventListener('click', closeCompose);
$('#composeContent').addEventListener('input', () => {
    const count = $('#charCount');
    const content = $('#composeContent');
    if (count && content) count.textContent = content.value.length;
});
$('#composeImage').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        imageFile = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            const preview = $('#composePreview');
            const img = $('#composePreviewImg');
            if (img) img.src = ev.target.result;
            if (preview) preview.style.display = 'inline-block';
        };
        reader.readAsDataURL(imageFile);
    }
});
$('#removePreview').addEventListener('click', () => {
    imageFile = null;
    const input = $('#composeImage'); if (input) input.value = '';
    const preview = $('#composePreview'); if (preview) preview.style.display = 'none';
});
$('#composeSubmit').addEventListener('click', submitChirp);

function openCompose() {
    if (!currentUser) return;
    const modal = $('#composeModal'); if (modal) modal.style.display = 'flex';
    const content = $('#composeContent'); if (content) content.value = '';
    const count = $('#charCount'); if (count) count.textContent = '0';
    imageFile = null;
    const input = $('#composeImage'); if (input) input.value = '';
    const preview = $('#composePreview'); if (preview) preview.style.display = 'none';
    setTimeout(() => { const c = $('#composeContent'); if (c) c.focus(); }, 100);
}

function closeCompose() {
    const modal = $('#composeModal'); if (modal) modal.style.display = 'none';
}

async function submitChirp() {
    const contentEl = $('#composeContent');
    const content = contentEl ? contentEl.value.trim() : '';
    if (!content) { showToast('Напишите текст'); return; }
    if (content.length > 280) { showToast('Максимум 280 символов'); return; }
    if (!currentUser) return;

    const submitBtn = $('#composeSubmit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

    try {
        let imageUrl = null;
        if (imageFile) {
            const ext = imageFile.name.split('.').pop();
            const filePath = `chirps/${currentUser.id}/${Date.now()}.${ext}`;
            await api('POST', `images/${filePath}`, imageFile, true);
            imageUrl = `${SUPABASE_URL}/storage/v1/object/public/images/${filePath}`;
        }

        const hashtags = (content.match(/#(\w+)/g) || []).map(h => h.toLowerCase());
        const today = new Date().toISOString().split('T')[0];
        let isFire = false;
        let streak = currentUser.streak_count || 0;

        if (currentUser.last_post_date) {
            const yest = new Date(); yest.setDate(yest.getDate() - 1);
            const yestStr = yest.toISOString().split('T')[0];
            if (currentUser.last_post_date === yestStr) { streak++; if (streak >= 2) isFire = true; }
            else if (currentUser.last_post_date !== today) { streak = 1; }
        } else { streak = 1; }

        await api('POST', 'chirps', {
            user_id: currentUser.id, username: currentUser.username,
            avatar_emoji: currentUser.avatar_emoji || '👤', avatar_url: currentUser.avatar_url || null,
            content, image_url: imageUrl, likes: 0, dislikes: 0, rechirps: 0,
            hashtags, is_fire: isFire, is_verified: currentUser.is_verified || false
        });

        await api('PATCH', `users?id=eq.${currentUser.id}`, { streak_count: streak, last_post_date: today });

        for (const tag of hashtags) {
            const existing = await api('GET', `trends?hashtag=eq.${encodeURIComponent(tag)}`);
            if (existing && existing.length > 0) {
                await api('PATCH', `trends?id=eq.${existing[0].id}`, { count: existing[0].count + 1, updated_at: new Date().toISOString() });
            } else {
                await api('POST', 'trends', { hashtag: tag, count: 1 });
            }
        }

        currentUser.streak_count = streak;
        currentUser.last_post_date = today;
        localStorage.setItem('nobuchirp_user', JSON.stringify(currentUser));
        closeCompose();
        loadFeed();
        showToast('Опубликовано!');
    } catch (e) { showToast('Ошибка публикации'); }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-feather"></i> Чирикнуть'; }
}

// ============================
// COMMENTS
// ============================
async function openComments(chirpId) {
    if (!chirpId) return;
    const modal = $('#commentsModal'); if (modal) modal.style.display = 'flex';
    const content = $('#commentsModalContent'); if (!content) return;
    content.innerHTML = '<div class="feed-loading">Загрузка...</div>';
    try {
        const chirp = await api('GET', `chirps?id=eq.${chirpId}&select=*`);
        const comments = await api('GET', `comments?chirp_id=eq.${chirpId}&order=created_at.asc`);
        const cData = chirp ? chirp[0] : null;
        content.innerHTML = `
            <div class="modal-header"><h3>Комментарии</h3><button class="modal-close" id="commentsCloseBtn">&times;</button></div>
            ${cData ? `<div class="comment-item"><span class="comment-user">${escapeHTML(cData.username)}</span><p class="comment-text">${escapeHTML(cData.content.substring(0,100))}</p></div>` : ''}
            <div id="commentsList">${(comments||[]).map(c => `<div class="comment-item"><span class="comment-user">${escapeHTML(c.username)}</span><p class="comment-text">${escapeHTML(c.content)}</p></div>`).join('')}</div>
            <div class="comment-input-row"><input id="commentInput" placeholder="Написать..." maxlength="280"><button id="submitCommentBtn">Отпр.</button></div>`;
        $('#commentsCloseBtn').addEventListener('click', () => { if(modal) modal.style.display = 'none'; });
        $('#submitCommentBtn').addEventListener('click', async () => {
            const input = $('#commentInput');
            if (!input) return;
            const text = input.value.trim();
            if (!text) return;
            const btn = $('#submitCommentBtn'); if (btn) btn.disabled = true;
            try {
                await api('POST', 'comments', { chirp_id: chirpId, user_id: currentUser.id, username: currentUser.username, content: text });
                if (input) input.value = '';
                openComments(chirpId);
            } catch (e) { showToast('Ошибка'); }
            if (btn) btn.disabled = false;
        });
    } catch (e) { content.innerHTML = '<p>Ошибка</p>'; }
}

// ============================
// REPORT
// ============================
async function handleReport(chirpId) {
    if (!chirpId) return;
    const reason = prompt('Причина жалобы:');
    if (!reason || !reason.trim()) return;
    try {
        await api('POST', 'reports', { from_user: currentUser.id, from_username: currentUser.username, chirp_id: chirpId, reason: reason.trim() });
        showToast('Жалоба отправлена');
    } catch (e) { showToast('Ошибка'); }
}

// ============================
// PROFILE
// ============================
$('#headerProfileBtn').addEventListener('click', () => { if (currentUser) openProfile(currentUser.id); });

async function openProfile(userId) {
    if (!userId) return;
    const modal = $('#profileModal'); if (modal) modal.style.display = 'flex';
    const content = $('#profileModalContent'); if (!content) return;
    content.innerHTML = '<div class="feed-loading">Загрузка...</div>';
    try {
        const users = await api('GET', `users?id=eq.${userId}&select=*`);
        if (!users || users.length === 0) { content.innerHTML = '<p>Пользователь не найден</p>'; return; }
        const user = users[0];
        const fRes = await api('GET', `follows?following_id=eq.${userId}&select=id`);
        const gRes = await api('GET', `follows?follower_id=eq.${userId}&select=id`);
        const cRes = await api('GET', `chirps?user_id=eq.${userId}&select=id`);
        const followersCount = fRes ? fRes.length : 0;
        const followingCount = gRes ? gRes.length : 0;
        const chirpsCount = cRes ? cRes.length : 0;
        const isOwn = currentUser && currentUser.id === userId;
        const isFollowing = subscriptions.includes(userId);
        const vIcon = user.is_verified ? ' <span class="verified-badge"><i class="fa-solid fa-circle-check"></i></span>' : '';

        let avatarHTML = `<span class="profile-avatar-large">${user.avatar_emoji || '👤'}</span>`;
        if (user.avatar_url) avatarHTML = `<span class="profile-avatar-large" style="background-image:url(${user.avatar_url});background-size:cover;"></span>`;

        let btns = '';
        if (isOwn) {
            btns = `<button class="profile-btn edit" id="profileEditBtn">✏️ Редактировать</button>
                    <button class="profile-btn info" id="profileAdminBtn">⚙️ Админка</button>
                    <button class="profile-btn danger" id="profileLogoutBtn">🚪 Выйти</button>`;
        } else {
            btns = isFollowing
                ? `<button class="profile-btn unfollow" id="profileFollowBtn">Отписаться</button>`
                : `<button class="profile-btn follow" id="profileFollowBtn">Подписаться</button>`;
        }

        content.innerHTML = `<div class="modal-header"><h3>Профиль</h3><button class="modal-close" id="profileCloseBtn">&times;</button></div>
            ${avatarHTML}<div class="profile-username">${escapeHTML(user.username)}${vIcon}</div>
            <p class="profile-bio">${escapeHTML(user.bio||'')}</p>
            <div class="profile-stats"><div class="profile-stat"><span class="count">${chirpsCount}</span><span class="label">Посты</span></div>
            <div class="profile-stat"><span class="count">${followersCount}</span><span class="label">Подписчики</span></div>
            <div class="profile-stat"><span class="count">${followingCount}</span><span class="label">Подписки</span></div></div>
            ${btns}<div class="profile-chirps" id="profileChirpsList"><h4>Посты</h4><div class="feed-loading">Загрузка...</div></div>`;

        $('#profileCloseBtn').addEventListener('click', () => { if(modal) modal.style.display = 'none'; });
        if (isOwn) {
            $('#profileEditBtn').addEventListener('click', openEditProfile);
            $('#profileAdminBtn').addEventListener('click', openAdminPanel);
            $('#profileLogoutBtn').addEventListener('click', () => { if (confirm('Выйти из аккаунта?')) logout(); });
        } else {
            $('#profileFollowBtn').addEventListener('click', () => toggleFollow(userId));
        }

        const userChirps = await api('GET', `chirps?user_id=eq.${userId}&order=created_at.desc&limit=20`);
        const list = $('#profileChirpsList'); if (!list) return;
        list.innerHTML = '<h4>Посты</h4>';
        if (userChirps && userChirps.length > 0) {
            list.innerHTML += userChirps.map(c => chirpCardHTML(c)).join('');
            attachChirpEvents(list);
        } else { list.innerHTML += '<p style="color:#888;font-size:13px;">Нет постов</p>'; }
    } catch (e) { content.innerHTML = '<p>Ошибка</p>'; }
}

async function toggleFollow(userId) {
    try {
        const ex = await api('GET', `follows?follower_id=eq.${currentUser.id}&following_id=eq.${userId}`);
        if (ex && ex.length > 0) {
            await api('DELETE', `follows?id=eq.${ex[0].id}`);
            subscriptions = subscriptions.filter(id => id !== userId);
        } else {
            await api('POST', 'follows', { follower_id: currentUser.id, following_id: userId });
            subscriptions.push(userId);
        }
        openProfile(userId);
    } catch (e) {}
}

async function loadSubscriptions() {
    if (!currentUser) return;
    try {
        const follows = await api('GET', `follows?follower_id=eq.${currentUser.id}&select=following_id`);
        subscriptions = follows ? follows.map(f => f.following_id) : [];
    } catch (e) { subscriptions = []; }
}

// ============================
// EDIT PROFILE
// ============================
function openEditProfile() {
    const modal = $('#editProfileModal'); if (modal) modal.style.display = 'flex';
    const emojiEl = $('#editAvatarEmoji'); if (emojiEl) emojiEl.value = currentUser.avatar_emoji || '👤';
    const bioEl = $('#editBio'); if (bioEl) bioEl.value = currentUser.bio || '';
    avatarFile = null;
    const fileEl = $('#editAvatarFile'); if (fileEl) fileEl.value = '';
    updateEditPreview();
}

function updateEditPreview() {
    const preview = $('#editAvatarPreview'); if (!preview) return;
    preview.style.backgroundImage = '';
    preview.textContent = '';
    if (currentUser.avatar_url) {
        preview.style.backgroundImage = `url(${currentUser.avatar_url})`;
        preview.style.backgroundSize = 'cover';
    } else {
        preview.textContent = currentUser.avatar_emoji || '👤';
    }
}

$('#editProfileClose').addEventListener('click', () => {
    const modal = $('#editProfileModal'); if (modal) modal.style.display = 'none';
});

$('#editAvatarFile').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        avatarFile = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            const preview = $('#editAvatarPreview');
            if (preview) { preview.style.backgroundImage = `url(${ev.target.result})`; preview.style.backgroundSize = 'cover'; preview.textContent = ''; }
        };
        reader.readAsDataURL(avatarFile);
    }
});

$('#saveProfileBtn').addEventListener('click', async () => {
    const emojiEl = $('#editAvatarEmoji');
    const bioEl = $('#editBio');
    const saveBtn = $('#saveProfileBtn');
    const avatarEmoji = emojiEl ? emojiEl.value.trim() || '👤' : '👤';
    const bio = bioEl ? bioEl.value.trim() : '';
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Сохранение...'; }

    try {
        let avatarUrl = currentUser.avatar_url || null;
        if (avatarFile) {
            const ext = avatarFile.name.split('.').pop();
            const filePath = `avatars/${currentUser.id}/${Date.now()}.${ext}`;
            await api('POST', `images/${filePath}`, avatarFile, true);
            avatarUrl = `${SUPABASE_URL}/storage/v1/object/public/images/${filePath}`;
        }
        await api('PATCH', `users?id=eq.${currentUser.id}`, { avatar_emoji: avatarEmoji, avatar_url: avatarUrl, bio });
        currentUser.avatar_emoji = avatarEmoji;
        currentUser.avatar_url = avatarUrl;
        currentUser.bio = bio;
        localStorage.setItem('nobuchirp_user', JSON.stringify(currentUser));
        updateHeaderAvatar();
        const em = $('#editProfileModal'); if (em) em.style.display = 'none';
        const pm = $('#profileModal'); if (pm) pm.style.display = 'none';
        showToast('Профиль обновлён');
    } catch (e) { showToast('Ошибка'); }
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Сохранить'; }
});

// ============================
// ADMIN
// ============================
function openAdminPanel() {
    const pwd = prompt('Пароль администратора:');
    if (pwd !== ADMIN_PASSWORD) { showToast('Неверный пароль'); return; }
    const modal = $('#adminModal'); if (modal) modal.style.display = 'flex';
    loadAdminData();
}

async function loadAdminData() {
    const content = $('#adminModalContent'); if (!content) return;
    content.innerHTML = '<div class="feed-loading">Загрузка...</div>';
    try {
        const reports = await api('GET', 'reports?order=created_at.desc&limit=30');
        const bans = await api('GET', 'users?is_banned=eq.true&select=*');
        const repHTML = (reports||[]).map(r => `<div style="padding:8px 0;border-bottom:1px solid #2a2a2a;font-size:12px;"><b>${escapeHTML(r.from_username)}</b> → <code>${(r.chirp_id||'').substring(0,8)}</code><br>${escapeHTML(r.reason)}<br><button class="admin-btn danger" data-del="${r.chirp_id}">Удалить пост</button></div>`).join('') || '<p style="color:#888;">Нет жалоб</p>';
        const banHTML = (bans||[]).map(b => `<div style="padding:8px 0;border-bottom:1px solid #2a2a2a;font-size:12px;"><b>${escapeHTML(b.username)}</b> — ${escapeHTML(b.ban_reason||'')}<br>До: ${b.ban_expires?new Date(b.ban_expires).toLocaleDateString('ru-RU'):'Навсегда'}<br><button class="admin-btn success" data-unban="${b.id}">Разбанить</button></div>`).join('') || '<p style="color:#888;">Нет банов</p>';

        content.innerHTML = `<div class="modal-header"><h3>⚙️ Админка</h3><button class="modal-close" id="adminCloseBtn">&times;</button></div>
        <div class="admin-section"><h4>🔨 Бан</h4><div class="admin-row"><input id="aBanUser" placeholder="Никнейм"><select id="aBanDur"><option value="1">1 день</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="forever">Навсегда</option></select></div><input class="admin-input" id="aBanReason" placeholder="Причина"><button class="admin-btn danger" id="aBanBtn">Забанить</button></div>
        <div class="admin-section"><h4>⚠️ Предупреждение</h4><input class="admin-input" id="aWarnUser" placeholder="Никнейм"><input class="admin-input" id="aWarnReason" placeholder="Причина"><button class="admin-btn warn" id="aWarnBtn">Предупредить</button></div>
        <div class="admin-section"><h4>✅ Верификация</h4><input class="admin-input" id="aVerifyUser" placeholder="Никнейм"><button class="admin-btn info" id="aVerifyBtn">Галочка</button></div>
        <div class="admin-section"><h4>🗑️ Удалить пост</h4><input class="admin-input" id="aDelPost" placeholder="ID поста"><button class="admin-btn danger" id="aDelBtn">Удалить</button></div>
        <div class="admin-section"><h4>🔍 Профиль</h4><input class="admin-input" id="aViewUser" placeholder="Никнейм"><button class="admin-btn info" id="aViewBtn">Смотреть</button></div>
        <div class="admin-section"><h4>📋 Жалобы</h4>${repHTML}</div>
        <div class="admin-section"><h4>🚫 Баны</h4>${banHTML}</div>`;

        $('#adminCloseBtn').addEventListener('click', () => { const m = $('#adminModal'); if(m) m.style.display = 'none'; });
        $('#aBanBtn').addEventListener('click', async () => {
            const u = $('#aBanUser').value.trim(); if(!u) return;
            const dur = $('#aBanDur').value; const r = $('#aBanReason').value.trim();
            const us = await api('GET', `users?username=eq.${encodeURIComponent(u)}&select=*`);
            if(!us||!us.length) { showToast('Не найден'); return; }
            let exp = null; if(dur!=='forever') { const d=new Date(); d.setDate(d.getDate()+ +dur); exp=d.toISOString(); }
            await api('PATCH', `users?id=eq.${us[0].id}`, { is_banned:true, ban_reason:r||'Нарушение', ban_expires:exp });
            showToast('Забанен'); loadAdminData();
        });
        $('#aWarnBtn').addEventListener('click', async () => {
            const u = $('#aWarnUser').value.trim(); if(!u) return;
            const r = $('#aWarnReason').value.trim();
            const us = await api('GET', `users?username=eq.${encodeURIComponent(u)}&select=*`);
            if(!us||!us.length) { showToast('Не найден'); return; }
            await api('POST', 'warnings', { user_id:us[0].id, username:us[0].username, reason:r||'Нарушение' });
            showToast('Предупреждён'); loadAdminData();
        });
        $('#aVerifyBtn').addEventListener('click', async () => {
            const u = $('#aVerifyUser').value.trim(); if(!u) return;
            const us = await api('GET', `users?username=eq.${encodeURIComponent(u)}&select=*`);
            if(!us||!us.length) { showToast('Не найден'); return; }
            await api('PATCH', `users?id=eq.${us[0].id}`, { is_verified:true });
            showToast('Галочка выдана'); loadAdminData();
        });
        $('#aDelBtn').addEventListener('click', async () => {
            const id = $('#aDelPost').value.trim(); if(!id) return;
            await api('DELETE', `chirps?id=eq.${id}`); showToast('Удалён'); loadAdminData();
        });
        $('#aViewBtn').addEventListener('click', async () => {
            const u = $('#aViewUser').value.trim(); if(!u) return;
            const us = await api('GET', `users?username=eq.${encodeURIComponent(u)}&select=*`);
            if(!us||!us.length) { showToast('Не найден'); return; }
            const m = $('#adminModal'); if(m) m.style.display = 'none';
            openProfile(us[0].id);
        });
        $$('[data-del]').forEach(b => b.addEventListener('click', async () => { await api('DELETE', `chirps?id=eq.${b.dataset.del}`); showToast('Удалён'); loadAdminData(); }));
        $$('[data-unban]').forEach(b => b.addEventListener('click', async () => { await api('PATCH', `users?id=eq.${b.dataset.unban}`, { is_banned:false, ban_reason:null, ban_expires:null }); showToast('Разбанен'); loadAdminData(); }));
    } catch (e) { content.innerHTML = '<p>Ошибка</p>'; }
}

// ============================
// TRENDS
// ============================
async function loadTrends() {
    const c = $('#trendsContainer'); if (!c) return;
    c.innerHTML = '<div class="feed-loading">Загрузка...</div>';
    try {
        const t = await api('GET', 'trends?order=count.desc&limit=20');
        c.innerHTML = (t&&t.length) ? t.map(x => `<div class="trend-item"><span class="trend-hashtag">${x.hashtag}</span><span class="trend-count">${x.count}</span></div>`).join('') : '<p class="empty-feed">Нет трендов</p>';
    } catch (e) { c.innerHTML = '<p class="empty-feed">Ошибка</p>'; }
}

// ============================
// NAVIGATION
// ============================
$$('.nav-btn[data-screen]').forEach(b => b.addEventListener('click', () => switchScreen(b.dataset.screen)));

function switchScreen(screen) {
    currentScreen = screen;
    $$('.screen').forEach(s => s.classList.remove('active'));
    $$('.nav-btn[data-screen]').forEach(b => b.classList.remove('active'));
    const sc = $(`#screen-${screen}`); if(sc) sc.classList.add('active');
    const nb = document.querySelector(`.nav-btn[data-screen="${screen}"]`); if(nb) nb.classList.add('active');
    if (screen === 'feed') loadFeed();
    else if (screen === 'subscriptions') loadSubscriptionsFeed();
    else if (screen === 'trends') loadTrends();
}

// ============================
// BACKDROP
// ============================
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) hideAllModals();
});

// ============================
// UTILS
// ============================
function escapeHTML(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function showToast(msg) {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2300);
}

// ============================
// POLLING
// ============================
let lastUpdate = 0;
setInterval(async () => {
    if (currentScreen === 'feed' && $('#mainApp')?.style.display === 'flex') {
        try {
            const chirps = await api('GET', 'chirps?order=created_at.desc&limit=1');
            if (chirps?.length) {
                const t = new Date(chirps[0].created_at).getTime();
                if (t > lastUpdate) { lastUpdate = t; loadFeed(); }
            }
        } catch(e) {}
    }
}, 5000);

// ============================
// START
// ============================
init();