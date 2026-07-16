// ============================
// SUPABASE CONFIG
// ============================
const SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';

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
    const main = $('#mainApp'); if (main) main.style.display = 'none';
    const ban = $('#banScreen'); if (ban) ban.style.display = 'none';
    const warn = $('#warningScreen'); if (warn) warn.style.display = 'none';
    showAuthScreen();
}

function clearAllIntervals() {
    if (banCheckInterval) { clearInterval(banCheckInterval); banCheckInterval = null; }
    if (warningTimerInterval) { clearInterval(warningTimerInterval); warningTimerInterval = null; }
}

function hideAllModals() {
    ['#composeModal', '#profileModal', '#commentsModal', '#adminModal', '#editProfileModal'].forEach(sel => {
        const el = $(sel); if (el) el.style.display = 'none';
    });
}

// ============================
// AUTH
// ============================
function showAuthScreen() {
    const authScr = $('#authScreen'); const main = $('#mainApp');
    if (authScr) authScr.style.display = 'flex';
    if (main) main.style.display = 'none';
    const u = $('#authUsername'); if (u) u.value = '';
    const p = $('#authPassword'); if (p) p.value = '';
    const e = $('#authError'); if (e) e.textContent = '';
}

function showMainApp() {
    $('#authScreen').style.display = 'none';
    $('#mainApp').style.display = 'flex';
    updateHeaderAvatar();
    loadFeed();
    loadSubscriptions();
    startBanCheck();
}

function updateHeaderAvatar() {
    if (!currentUser) return;
    const av = $('#headerAvatar'); if (!av) return;
    av.style.backgroundImage = '';
    av.textContent = '';
    if (currentUser.avatar_url) {
        av.style.backgroundImage = `url(${currentUser.avatar_url})`;
        av.style.backgroundSize = 'cover';
    } else {
        av.textContent = currentUser.avatar_emoji || '👤';
    }
}

$$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        $$('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        authMode = tab.dataset.tab;
        const btn = $('#authSubmitBtn'); if (btn) btn.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться';
        const err = $('#authError'); if (err) err.textContent = '';
    });
});

$('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#authUsername').value.trim();
    const password = $('#authPassword').value.trim();
    if (!username || !password) { $('#authError').textContent = 'Заполните все поля'; return; }
    if (username.length < 2) { $('#authError').textContent = 'Никнейм от 2 символов'; return; }
    if (password.length < 4) { $('#authError').textContent = 'Пароль от 4 символов'; return; }
    $('#authSubmitBtn').disabled = true;
    $('#authError').textContent = '';
    try {
        if (authMode === 'register') {
            const ex = await api('GET', `users?username=eq.${encodeURIComponent(username)}&select=id`);
            if (ex && ex.length > 0) { $('#authError').textContent = 'Никнейм занят'; $('#authSubmitBtn').disabled = false; return; }
            const nu = await api('POST', 'users', { username, password, avatar_emoji:'👤', avatar_url:null, bio:'', is_verified:false, is_banned:false, streak_count:0 });
            if (nu && nu.length > 0) currentUser = nu[0];
        } else {
            const users = await api('GET', `users?username=eq.${encodeURIComponent(username)}&password=eq.${encodeURIComponent(password)}&select=*`);
            if (!users || !users.length) { $('#authError').textContent = 'Неверный никнейм или пароль'; $('#authSubmitBtn').disabled = false; return; }
            currentUser = users[0];
        }
        localStorage.setItem('nobuchirp_user', JSON.stringify(currentUser));
        await checkBanAndWarnings();
        if (!isOverlayActive()) showMainApp();
    } catch (err) { $('#authError').textContent = 'Ошибка соединения'; }
    $('#authSubmitBtn').disabled = false;
});

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
                    await api('PATCH', `users?id=eq.${currentUser.id}`, { is_banned:false, ban_reason:null, ban_expires:null });
                    currentUser.is_banned = false;
                    localStorage.setItem('nobuchirp_user', JSON.stringify(currentUser));
                    $('#banScreen').style.display = 'none';
                } else { showBanScreen(currentUser.ban_reason, currentUser.ban_expires); return; }
            } else { $('#banScreen').style.display = 'none'; }
        }
        const warns = await api('GET', `warnings?user_id=eq.${currentUser.id}&is_read=eq.false&order=created_at.desc&limit=1`);
        if (warns && warns.length > 0) { showWarningScreen(warns[0]); }
        else { $('#warningScreen').style.display = 'none'; }
    } catch(e) {}
}

function startBanCheck() {
    if (banCheckInterval) clearInterval(banCheckInterval);
    banCheckInterval = setInterval(checkBanAndWarnings, 10000);
}

function showBanScreen(reason, expires) {
    $('#mainApp').style.display = 'none';
    $('#authScreen').style.display = 'none';
    $('#banScreen').style.display = 'flex';
    $('#banReason').textContent = `Причина: ${reason || 'Нарушение правил'}`;
    if (expires) {
        const d = new Date(expires);
        $('#banExpires').textContent = `Разбан: ${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'})}`;
    } else { $('#banExpires').textContent = 'Бан навсегда'; }
    $('#banRules').innerHTML = `<p><strong>📜 Правила:</strong></p><p>1. Без оскорблений<br>2. Без спама<br>3. Без 18+<br>4. Без наркотиков<br>5. Без угроз</p>`;
}

function showWarningScreen(warning) {
    $('#mainApp').style.display = 'none';
    $('#authScreen').style.display = 'none';
    $('#warningScreen').style.display = 'flex';
    $('#warningReason').textContent = `Причина: ${warning.reason || 'Нарушение правил'}`;
    $('#warningDismissBtn').disabled = true;
    startWarningCountdown(60);
}

$('#warningDismissBtn').addEventListener('click', async () => {
    if ($('#warningDismissBtn').disabled) return;
    try {
        const w = await api('GET', `warnings?user_id=eq.${currentUser.id}&is_read=eq.false&order=created_at.desc&limit=1`);
        if (w && w.length > 0) await api('PATCH', `warnings?id=eq.${w[0].id}`, { is_read:true });
    } catch(e) {}
    if (warningTimerInterval) { clearInterval(warningTimerInterval); warningTimerInterval = null; }
    $('#warningScreen').style.display = 'none';
    showMainApp();
});

function startWarningCountdown(seconds) {
    if (warningTimerInterval) clearInterval(warningTimerInterval);
    let remaining = seconds;
    $('#warningTimer').textContent = formatTime(remaining);
    warningTimerInterval = setInterval(() => {
        remaining--;
        $('#warningTimer').textContent = formatTime(remaining);
        if (remaining <= 0) {
            clearInterval(warningTimerInterval);
            warningTimerInterval = null;
            $('#warningDismissBtn').disabled = false;
        }
    }, 1000);
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ============================
// FEED
// ============================
async function loadFeed() {
    const c = $('#feedContainer'); if (!c) return;
    c.innerHTML = '<div class="feed-loading">Загрузка...</div>';
    try { const ch = await api('GET', 'chirps?order=created_at.desc&limit=50'); renderChirps(c, ch || []); }
    catch(e) { c.innerHTML = '<div class="feed-loading">Ошибка</div>'; }
}

async function loadSubscriptionsFeed() {
    const c = $('#subscriptionsContainer'); if (!c) return;
    if (!subscriptions.length) { c.innerHTML = '<p class="empty-feed">Подпишитесь на пользователей</p>'; return; }
    c.innerHTML = '<div class="feed-loading">Загрузка...</div>';
    try {
        const ids = subscriptions.map(s => `"${s}"`).join(',');
        const ch = await api('GET', `chirps?user_id=in.(${ids})&order=created_at.desc&limit=50`);
        renderChirps(c, ch || []);
    } catch(e) { c.innerHTML = '<div class="feed-loading">Ошибка</div>'; }
}

function renderChirps(container, chirps) {
    if (!chirps?.length) { container.innerHTML = '<p class="empty-feed">Пока нет постов</p>'; return; }
    container.innerHTML = chirps.map(c => chirpCardHTML(c)).join('');
    attachChirpEvents(container);
}

function chirpCardHTML(c) {
    const time = new Date(c.created_at).toLocaleString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    const v = c.is_verified ? ' <span class="verified-badge"><i class="fa-solid fa-circle-check"></i></span>' : '';
    const f = c.is_fire ? ' <span class="fire-badge">🔥</span>' : '';
    const img = c.image_url ? `<img class="chirp-image" src="${c.image_url}" onclick="window.open('${c.image_url}')">` : '';
    const txt = escapeHTML(c.content).replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
    const sid = (c.id||'').substring(0,8);
    let av = `<span class="chirp-avatar">${c.avatar_emoji||'👤'}</span>`;
    if (c.avatar_url) av = `<span class="chirp-avatar" style="background-image:url(${c.avatar_url});background-size:cover;"></span>`;
    return `<div class="chirp-card"><div class="chirp-header">${av}<span class="chirp-username">${escapeHTML(c.username||'')}${v}${f}</span><span class="chirp-time">${time}</span></div><div class="chirp-content">${txt}</div>${img}<div class="chirp-actions"><button class="chirp-action like-btn" data-c="${c.id}"><i class="fa-regular fa-heart"></i> ${c.likes||0}</button><button class="chirp-action dislike-btn" data-c="${c.id}"><i class="fa-regular fa-thumbs-down"></i> ${c.dislikes||0}</button><button class="chirp-action rechirp-btn" data-c="${c.id}"><i class="fa-solid fa-retweet"></i> ${c.rechirps||0}</button><button class="chirp-action comment-btn" data-c="${c.id}"><i class="fa-regular fa-comment"></i></button><button class="chirp-action report-btn" data-c="${c.id}"><i class="fa-regular fa-flag"></i></button></div><span class="chirp-id" data-id="${c.id}">#${sid}</span></div>`;
}

function attachChirpEvents(container) {
    container.querySelectorAll('.like-btn').forEach(b => b.addEventListener('click', () => handleLike(b.dataset.c)));
    container.querySelectorAll('.dislike-btn').forEach(b => b.addEventListener('click', () => handleDislike(b.dataset.c)));
    container.querySelectorAll('.rechirp-btn').forEach(b => b.addEventListener('click', () => handleRechirp(b.dataset.c)));
    container.querySelectorAll('.comment-btn').forEach(b => b.addEventListener('click', () => openComments(b.dataset.c)));
    container.querySelectorAll('.report-btn').forEach(b => b.addEventListener('click', () => handleReport(b.dataset.c)));
    container.querySelectorAll('.chirp-id').forEach(el => el.addEventListener('click', () => {
        navigator.clipboard.writeText(el.dataset.id).then(() => showToast('ID скопирован')).catch(()=>{});
    }));
}

// ============================
// LIKE / DISLIKE / RECHIRP
// ============================
async function handleLike(cid) { if(!currentUser||!cid) return;
    try {
        const ex = await api('GET', `likes?user_id=eq.${currentUser.id}&chirp_id=eq.${cid}`);
        if(ex?.length) await api('DELETE', `likes?id=eq.${ex[0].id}`);
        else { await api('POST','likes',{user_id:currentUser.id,chirp_id:cid}); await api('DELETE',`dislikes?user_id=eq.${currentUser.id}&chirp_id=eq.${cid}`); }
        await api('PATCH',`chirps?id=eq.${cid}`,{likes:await cnt('likes',cid),dislikes:await cnt('dislikes',cid)});
        refreshCurrentScreen();
    } catch(e) {}
}
async function handleDislike(cid) { if(!currentUser||!cid) return;
    try {
        const ex = await api('GET', `dislikes?user_id=eq.${currentUser.id}&chirp_id=eq.${cid}`);
        if(ex?.length) await api('DELETE', `dislikes?id=eq.${ex[0].id}`);
        else { await api('POST','dislikes',{user_id:currentUser.id,chirp_id:cid}); await api('DELETE',`likes?user_id=eq.${currentUser.id}&chirp_id=eq.${cid}`); }
        await api('PATCH',`chirps?id=eq.${cid}`,{likes:await cnt('likes',cid),dislikes:await cnt('dislikes',cid)});
        refreshCurrentScreen();
    } catch(e) {}
}
async function handleRechirp(cid) { if(!currentUser||!cid) return;
    try {
        const ex = await api('GET', `rechirps?user_id=eq.${currentUser.id}&chirp_id=eq.${cid}`);
        if(ex?.length) { showToast('Уже делали'); return; }
        await api('POST','rechirps',{user_id:currentUser.id,chirp_id:cid});
        await api('PATCH',`chirps?id=eq.${cid}`,{rechirps:await cnt('rechirps',cid)});
        refreshCurrentScreen();
    } catch(e) {}
}
async function cnt(table, cid) { try { const r = await api('GET', `${table}?chirp_id=eq.${cid}&select=id`); return r?r.length:0; } catch(e) { return 0; } }
function refreshCurrentScreen() { if(currentScreen==='feed') loadFeed(); else if(currentScreen==='subscriptions') loadSubscriptionsFeed(); }

// ============================
// COMPOSE
// ============================
$('#composeNavBtn').addEventListener('click', openCompose);
$('#composeClose').addEventListener('click', closeCompose);
$('#composeContent').addEventListener('input', () => { $('#charCount').textContent = $('#composeContent').value.length; });
$('#composeImage').addEventListener('change', (e) => {
    if(e.target.files?.[0]) { imageFile=e.target.files[0]; const r=new FileReader(); r.onload=ev=>{ $('#composePreviewImg').src=ev.target.result; $('#composePreview').style.display='inline-block'; }; r.readAsDataURL(imageFile); }
});
$('#removePreview').addEventListener('click', () => { imageFile=null; $('#composeImage').value=''; $('#composePreview').style.display='none'; });
$('#composeSubmit').addEventListener('click', submitChirp);

function openCompose() { if(!currentUser) return; $('#composeModal').style.display='flex'; $('#composeContent').value=''; $('#charCount').textContent='0'; imageFile=null; $('#composeImage').value=''; $('#composePreview').style.display='none'; setTimeout(()=>$('#composeContent').focus(),100); }
function closeCompose() { $('#composeModal').style.display='none'; }

async function submitChirp() {
    const txt = $('#composeContent').value.trim();
    if(!txt) { showToast('Напишите текст'); return; }
    if(txt.length>280) { showToast('Макс 280'); return; }
    if(!currentUser) return;
    const btn = $('#composeSubmit'); btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
        let imgUrl = null;
        if(imageFile) {
            const ext = imageFile.name.split('.').pop();
            const path = `chirps/${currentUser.id}/${Date.now()}.${ext}`;
            await api('POST',`images/${path}`,imageFile,true);
            imgUrl = `${SUPABASE_URL}/storage/v1/object/public/images/${path}`;
        }
        const tags = (txt.match(/#(\w+)/g)||[]).map(h=>h.toLowerCase());
        const today = new Date().toISOString().split('T')[0];
        let fire=false, streak=currentUser.streak_count||0;
        if(currentUser.last_post_date) {
            const y=new Date(); y.setDate(y.getDate()-1); const ys=y.toISOString().split('T')[0];
            if(currentUser.last_post_date===ys) { streak++; if(streak>=2) fire=true; }
            else if(currentUser.last_post_date!==today) streak=1;
        } else streak=1;
        await api('POST','chirps',{user_id:currentUser.id,username:currentUser.username,avatar_emoji:currentUser.avatar_emoji||'👤',avatar_url:currentUser.avatar_url||null,content:txt,image_url:imgUrl,likes:0,dislikes:0,rechirps:0,hashtags:tags,is_fire:fire,is_verified:currentUser.is_verified||false});
        await api('PATCH',`users?id=eq.${currentUser.id}`,{streak_count:streak,last_post_date:today});
        for(const tag of tags) {
            const ex=await api('GET',`trends?hashtag=eq.${encodeURIComponent(tag)}`);
            if(ex?.length) await api('PATCH',`trends?id=eq.${ex[0].id}`,{count:ex[0].count+1,updated_at:new Date().toISOString()});
            else await api('POST','trends',{hashtag:tag,count:1});
        }
        currentUser.streak_count=streak; currentUser.last_post_date=today;
        localStorage.setItem('nobuchirp_user',JSON.stringify(currentUser));
        closeCompose(); loadFeed(); showToast('Опубликовано!');
    } catch(e) { showToast('Ошибка'); }
    btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-feather"></i> Чирикнуть';
}

// ============================
// COMMENTS
// ============================
async function openComments(cid) {
    if(!cid) return;
    $('#commentsModal').style.display='flex';
    const c = $('#commentsModalContent'); c.innerHTML='<div class="feed-loading">...</div>';
    try {
        const ch = await api('GET',`chirps?id=eq.${cid}&select=*`);
        const cm = await api('GET',`comments?chirp_id=eq.${cid}&order=created_at.asc`);
        const cd = ch?.[0];
        c.innerHTML = `<div class="modal-header"><h3>Комментарии</h3><button class="modal-close" id="cmClose">&times;</button></div>${cd?`<div class="comment-item"><span class="comment-user">${escapeHTML(cd.username)}</span><p class="comment-text">${escapeHTML(cd.content.substring(0,100))}</p></div>`:''}<div id="cmList">${(cm||[]).map(x=>`<div class="comment-item"><span class="comment-user">${escapeHTML(x.username)}</span><p class="comment-text">${escapeHTML(x.content)}</p></div>`).join('')}</div><div class="comment-input-row"><input id="cmInput" placeholder="Написать..." maxlength="280"><button id="cmSend">Отпр.</button></div>`;
        $('#cmClose').addEventListener('click',()=>$('#commentsModal').style.display='none');
        $('#cmSend').addEventListener('click',async()=>{
            const t=$('#cmInput').value.trim(); if(!t) return;
            $('#cmSend').disabled=true;
            try { await api('POST','comments',{chirp_id:cid,user_id:currentUser.id,username:currentUser.username,content:t}); $('#cmInput').value=''; openComments(cid); }
            catch(e) { showToast('Ошибка'); }
            $('#cmSend').disabled=false;
        });
    } catch(e) { c.innerHTML='<p>Ошибка</p>'; }
}

// ============================
// REPORT
// ============================
async function handleReport(cid) {
    const r = prompt('Причина жалобы:');
    if(!r?.trim()) return;
    try { await api('POST','reports',{from_user:currentUser.id,from_username:currentUser.username,chirp_id:cid,reason:r.trim()}); showToast('Отправлено'); }
    catch(e) { showToast('Ошибка'); }
}

// ============================
// PROFILE
// ============================
$('#headerProfileBtn').addEventListener('click', () => { if(currentUser) openProfile(currentUser.id); });

async function openProfile(uid) {
    if(!uid) return;
    $('#profileModal').style.display='flex';
    const c = $('#profileModalContent'); c.innerHTML='<div class="feed-loading">...</div>';
    try {
        const users = await api('GET',`users?id=eq.${uid}&select=*`);
        if(!users?.length) { c.innerHTML='<p>Не найден</p>'; return; }
        const u = users[0];
        const fR=await api('GET',`follows?following_id=eq.${uid}&select=id`);
        const gR=await api('GET',`follows?follower_id=eq.${uid}&select=id`);
        const cR=await api('GET',`chirps?user_id=eq.${uid}&select=id`);
        const own = currentUser?.id === uid;
        const fol = subscriptions.includes(uid);
        const vI = u.is_verified ? ' <span class="verified-badge"><i class="fa-solid fa-circle-check"></i></span>' : '';
        let av = `<span class="profile-avatar-large">${u.avatar_emoji||'👤'}</span>`;
        if(u.avatar_url) av = `<span class="profile-avatar-large" style="background-image:url(${u.avatar_url});background-size:cover;"></span>`;
        let btns = own
            ? `<button class="profile-btn edit" id="pfEdit">✏️ Редактировать</button><button class="profile-btn info" id="pfAdmin">⚙️ Админка</button><button class="profile-btn danger" id="pfLogout">🚪 Выйти</button>`
            : (fol ? `<button class="profile-btn unfollow" id="pfFollow">Отписаться</button>` : `<button class="profile-btn follow" id="pfFollow">Подписаться</button>`);
        c.innerHTML = `<div class="modal-header"><h3>Профиль</h3><button class="modal-close" id="pfClose">&times;</button></div>${av}<div class="profile-username">${escapeHTML(u.username)}${vI}</div><p class="profile-bio">${escapeHTML(u.bio||'')}</p><div class="profile-stats"><div class="profile-stat"><span class="count">${cR?.length||0}</span><span class="label">Посты</span></div><div class="profile-stat"><span class="count">${fR?.length||0}</span><span class="label">Подписчики</span></div><div class="profile-stat"><span class="count">${gR?.length||0}</span><span class="label">Подписки</span></div></div>${btns}<div class="profile-chirps" id="pfChirps"><h4>Посты</h4><div class="feed-loading">...</div></div>`;
        $('#pfClose').addEventListener('click',()=>$('#profileModal').style.display='none');
        if(own) {
            $('#pfEdit').addEventListener('click', openEditProfile);
            $('#pfAdmin').addEventListener('click', () => loadAdminScript());
            $('#pfLogout').addEventListener('click', () => { if(confirm('Выйти?')) logout(); });
        } else {
            $('#pfFollow').addEventListener('click', () => toggleFollow(uid));
        }
        const uCh = await api('GET',`chirps?user_id=eq.${uid}&order=created_at.desc&limit=20`);
        const list = $('#pfChirps'); list.innerHTML = '<h4>Посты</h4>';
        if(uCh?.length) { list.innerHTML += uCh.map(c=>chirpCardHTML(c)).join(''); attachChirpEvents(list); }
        else list.innerHTML += '<p style="color:#888;font-size:13px;">Нет постов</p>';
    } catch(e) { c.innerHTML='<p>Ошибка</p>'; }
}

async function toggleFollow(uid) {
    try {
        const ex = await api('GET',`follows?follower_id=eq.${currentUser.id}&following_id=eq.${uid}`);
        if(ex?.length) { await api('DELETE',`follows?id=eq.${ex[0].id}`); subscriptions=subscriptions.filter(id=>id!==uid); }
        else { await api('POST','follows',{follower_id:currentUser.id,following_id:uid}); subscriptions.push(uid); }
        openProfile(uid);
    } catch(e) {}
}

async function loadSubscriptions() {
    if(!currentUser) return;
    try { const f=await api('GET',`follows?follower_id=eq.${currentUser.id}&select=following_id`); subscriptions=f?f.map(x=>x.following_id):[]; }
    catch(e) { subscriptions=[]; }
}

// ============================
// EDIT PROFILE
// ============================
function openEditProfile() {
    $('#editProfileModal').style.display='flex';
    $('#editAvatarEmoji').value=currentUser.avatar_emoji||'👤';
    $('#editBio').value=currentUser.bio||'';
    avatarFile=null; $('#editAvatarFile').value='';
    updateEditPreview();
}

function updateEditPreview() {
    const p=$('#editAvatarPreview'); if(!p) return;
    p.style.backgroundImage=''; p.textContent='';
    if(currentUser.avatar_url) { p.style.backgroundImage=`url(${currentUser.avatar_url})`; p.style.backgroundSize='cover'; }
    else p.textContent=currentUser.avatar_emoji||'👤';
}

$('#editProfileClose').addEventListener('click',()=>$('#editProfileModal').style.display='none');
$('#editAvatarFile').addEventListener('change',(e)=>{
    if(e.target.files?.[0]) {
        avatarFile=e.target.files[0];
        const r=new FileReader();
        r.onload=ev=>{ const p=$('#editAvatarPreview'); p.style.backgroundImage=`url(${ev.target.result})`; p.style.backgroundSize='cover'; p.textContent=''; };
        r.readAsDataURL(avatarFile);
    }
});
$('#saveProfileBtn').addEventListener('click', async () => {
    const emoji=$('#editAvatarEmoji').value.trim()||'👤';
    const bio=$('#editBio').value.trim();
    const btn=$('#saveProfileBtn'); btn.disabled=true; btn.textContent='Сохранение...';
    try {
        let url=currentUser.avatar_url||null;
        if(avatarFile) {
            const ext=avatarFile.name.split('.').pop();
            const path=`avatars/${currentUser.id}/${Date.now()}.${ext}`;
            await api('POST',`images/${path}`,avatarFile,true);
            url=`${SUPABASE_URL}/storage/v1/object/public/images/${path}`;
        }
        await api('PATCH',`users?id=eq.${currentUser.id}`,{avatar_emoji:emoji,avatar_url:url,bio});
        currentUser.avatar_emoji=emoji; currentUser.avatar_url=url; currentUser.bio=bio;
        localStorage.setItem('nobuchirp_user',JSON.stringify(currentUser));
        updateHeaderAvatar();
        $('#editProfileModal').style.display='none';
        $('#profileModal').style.display='none';
        showToast('Профиль обновлён');
    } catch(e) { showToast('Ошибка'); }
    btn.disabled=false; btn.textContent='Сохранить';
});

// ============================
// ADMIN SCRIPT LOADER
// ============================
function loadAdminScript() {
    const existing = document.querySelector('script[data-admin]');
    if (existing) { existing.remove(); }
    const script = document.createElement('script');
    script.dataset.admin = 'true';
    script.src = 'admin.js';
    script.onload = () => {
        if (typeof window.openNobuAdmin === 'function') {
            window.openNobuAdmin(currentUser, api, showToast, openProfile, escapeHTML, $, SUPABASE_URL);
        }
    };
    script.onerror = () => showToast('Ошибка загрузки админки');
    document.body.appendChild(script);
}

// ============================
// TRENDS
// ============================
async function loadTrends() {
    const c=$('#trendsContainer'); if(!c) return;
    c.innerHTML='<div class="feed-loading">...</div>';
    try {
        const t=await api('GET','trends?order=count.desc&limit=20');
        c.innerHTML=t?.length?t.map(x=>`<div class="trend-item"><span class="trend-hashtag">${x.hashtag}</span><span class="trend-count">${x.count}</span></div>`).join(''):'<p class="empty-feed">Нет трендов</p>';
    } catch(e) { c.innerHTML='<p class="empty-feed">Ошибка</p>'; }
}

// ============================
// NAVIGATION
// ============================
$$('.nav-btn[data-screen]').forEach(b=>b.addEventListener('click',()=>switchScreen(b.dataset.screen)));
function switchScreen(s) {
    currentScreen=s;
    $$('.screen').forEach(x=>x.classList.remove('active'));
    $$('.nav-btn[data-screen]').forEach(x=>x.classList.remove('active'));
    $(`#screen-${s}`)?.classList.add('active');
    document.querySelector(`.nav-btn[data-screen="${s}"]`)?.classList.add('active');
    if(s==='feed') loadFeed();
    else if(s==='subscriptions') loadSubscriptionsFeed();
    else if(s==='trends') loadTrends();
}

// ============================
// BACKDROP
// ============================
document.addEventListener('click', (e) => { if(e.target.classList.contains('modal-backdrop')) hideAllModals(); });

// ============================
// UTILS
// ============================
function escapeHTML(str) { if(!str) return ''; const d=document.createElement('div'); d.textContent=str; return d.innerHTML; }
function showToast(msg) { const old=document.querySelector('.toast'); if(old) old.remove(); const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2300); }

// ============================
// POLLING
// ============================
let lastUpdate=0;
setInterval(async()=>{
    if(currentScreen==='feed' && $('#mainApp')?.style.display==='flex') {
        try {
            const ch=await api('GET','chirps?order=created_at.desc&limit=1');
            if(ch?.length) { const t=new Date(ch[0].created_at).getTime(); if(t>lastUpdate) { lastUpdate=t; loadFeed(); } }
        } catch(e) {}
    }
},5000);

// ============================
// START
// ============================
init();