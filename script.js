const NobuChirp = (() => {
    const supabase = window.supabase.createClient('https://iljsednetiogjtowlexo.supabase.co', 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O');
    let currentUser = null, pendingImage = null, activeTab = 'feed', realtimeChannel = null, banCheckInterval = null;
    let canPost = true, postCooldown = 10, postTimerInterval = null;
    const app = document.getElementById('app');
    const ADMIN_PASSWORD = 'NobuWaveAdmin2024';
    const esc = s => String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
    const formatTime = d => { const diff = Math.floor((Date.now() - new Date(d)) / 1000); if (diff < 60) return 'сейчас'; if (diff < 3600) return Math.floor(diff/60) + 'м'; if (diff < 86400) return Math.floor(diff/3600) + 'ч'; return new Date(d).toLocaleDateString('ru-RU', {day:'numeric',month:'short'}); };

    const subscribeToRealtime = () => {
        if (realtimeChannel) supabase.removeChannel(realtimeChannel);
        realtimeChannel = supabase.channel('chirps-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chirps' }, () => loadFeed())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chirps' }, () => loadFeed())
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chirps' }, () => loadFeed())
            .subscribe();
    };

    const startBanCheckInterval = () => {
        if (banCheckInterval) clearInterval(banCheckInterval);
        banCheckInterval = setInterval(async () => {
            if (!currentUser) return;
            const { data: user } = await supabase.from('users').select('*').eq('id', currentUser.id).single();
            if (!user) return;
            if (user.is_banned) {
                if (user.ban_expires && new Date(user.ban_expires) > new Date()) { clearInterval(banCheckInterval); if (realtimeChannel) supabase.removeChannel(realtimeChannel); showBanScreen(user); return; }
                else { await supabase.from('users').update({ is_banned: false, ban_reason: null, ban_expires: null }).eq('id', user.id); }
            }
            const { data: warnings } = await supabase.from('warnings').select('*').eq('user_id', user.id).eq('is_read', false);
            if (warnings && warnings.length > 0) { clearInterval(banCheckInterval); if (realtimeChannel) supabase.removeChannel(realtimeChannel); showWarningScreen(warnings[0]); }
            currentUser = user;
            localStorage.setItem('nobu_user', JSON.stringify(user));
        }, 5000);
    };

    const showBanScreen = (user) => {
        const until = user.ban_expires ? new Date(user.ban_expires) : null;
        const diff = until ? Math.floor((until - new Date()) / 60000) : Infinity;
        const dur = diff < 60 ? `${diff} мин` : diff < 1440 ? `${Math.floor(diff/60)} ч` : diff < 43200 ? `${Math.floor(diff/1440)} дн` : 'навсегда';
        app.innerHTML = `<div class="auth-container"><div class="auth-card" style="max-width:500px"><div style="font-size:4rem">🚫</div><h2 style="color:var(--danger);margin:12px 0">Вы заблокированы</h2><p style="color:var(--text-secondary)">Причина: <strong>${esc(user.ban_reason||'нарушение правил')}</strong></p>${until?`<p style="color:var(--text-secondary)">До: ${until.toLocaleString('ru-RU')} (${dur})</p>`:'<p style="color:var(--text-secondary)">Навсегда</p>'}<p style="color:var(--text-secondary);margin-top:16px">Вы больше не можете пользоваться NobuChirp.</p></div></div>`;
    };

    const showWarningScreen = (warning) => {
        app.innerHTML = `<div class="auth-container"><div class="auth-card" style="max-width:500px"><div style="font-size:4rem;color:var(--warning)">⚠️</div><h2 style="color:var(--warning);margin:12px 0">Предупреждение</h2><p style="color:var(--text-secondary)">Причина: <strong>${esc(warning.reason||'нарушение правил')}</strong></p><p style="color:var(--text-secondary);margin:16px 0">Пожалуйста, ознакомьтесь с правилами. Кнопка станет доступна через 3 минуты.</p><div class="rules-content"><h3 style="color:var(--danger)">🚫 ЗАПРЕЩЕНО:</h3><ul><li>Хейтинг и травля</li><li>Спам</li><li>Угрозы</li><li>Дискриминация</li><li>Контент 18+</li><li>Мошенничество</li><li>Чужая личность</li><li>Вредоносные ссылки</li></ul></div><p class="timer-text">Осталось: <strong id="warnTimer">3:00</strong></p><button class="modal-btn" id="warnConfirmBtn" disabled>Я понял(а)</button></div></div>`;
        let seconds = 180;
        const timerEl = document.getElementById('warnTimer'), btn = document.getElementById('warnConfirmBtn');
        const interval = setInterval(() => { seconds--; const m=Math.floor(seconds/60),s=seconds%60; timerEl.textContent=`${m}:${s.toString().padStart(2,'0')}`; if(seconds<=0){clearInterval(interval);btn.disabled=false;timerEl.textContent='0:00';} },1000);
        btn.addEventListener('click', async () => { await supabase.from('warnings').update({ is_read: true }).eq('id', warning.id); renderApp(); });
    };

    const checkWarningsAndBan = async (user) => {
        if (user.is_banned) {
            if (user.ban_expires && new Date(user.ban_expires) > new Date()) { showBanScreen(user); return true; }
            else { await supabase.from('users').update({ is_banned: false, ban_reason: null, ban_expires: null }).eq('id', user.id); }
        }
        const { data: warnings } = await supabase.from('warnings').select('*').eq('user_id', user.id).eq('is_read', false);
        if (warnings && warnings.length > 0) { showWarningScreen(warnings[0]); return true; }
        return false;
    };

    const renderAuth = () => {
        cleanup();
        app.innerHTML = `<div class="auth-container"><div class="auth-card"><div class="auth-logo"><div class="logo-icon"><i class="fa-solid fa-feather"></i></div><h1>Nobu<span>Chirp</span></h1></div><div class="auth-tabs"><button class="auth-tab active" data-tab="login">Вход</button><button class="auth-tab" data-tab="register">Регистрация</button></div><form id="loginForm" class="auth-form"><input type="text" id="loginUsername" class="auth-input" placeholder="Никнейм" autocomplete="off"><input type="password" id="loginPassword" class="auth-input" placeholder="Пароль"><div id="loginError" class="auth-error"></div><button type="submit" class="auth-btn">Войти</button></form><form id="registerForm" class="auth-form hidden"><input type="text" id="regUsername" class="auth-input" placeholder="Никнейм"><input type="password" id="regPassword" class="auth-input" placeholder="Пароль"><div id="regError" class="auth-error"></div><button type="submit" class="auth-btn">Зарегистрироваться</button></form></div></div>`;
        document.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', () => { document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active')); t.classList.add('active'); document.getElementById('loginForm').classList.toggle('hidden', t.dataset.tab !== 'login'); document.getElementById('registerForm').classList.toggle('hidden', t.dataset.tab !== 'register'); }));
        document.getElementById('loginForm').addEventListener('submit', async (e) => { e.preventDefault(); const u = document.getElementById('loginUsername').value.trim(), p = document.getElementById('loginPassword').value.trim(); const { data: user, error } = await supabase.from('users').select('*').eq('username', u).eq('password', p).single(); if (error || !user) { document.getElementById('loginError').textContent = 'Неверный никнейм или пароль'; return; } currentUser = user; if (await checkWarningsAndBan(user)) return; localStorage.setItem('nobu_user', JSON.stringify(user)); renderApp(); });
        document.getElementById('registerForm').addEventListener('submit', async (e) => { e.preventDefault(); const u = document.getElementById('regUsername').value.trim(), p = document.getElementById('regPassword').value.trim(); if (p.length < 4) { document.getElementById('regError').textContent = 'Пароль минимум 4 символа'; return; } const { data: exist } = await supabase.from('users').select('id').eq('username', u).single(); if (exist) { document.getElementById('regError').textContent = 'Никнейм занят'; return; } const { data: newUser } = await supabase.from('users').insert({ username: u, password: p }).select().single(); currentUser = newUser; localStorage.setItem('nobu_user', JSON.stringify(newUser)); renderApp(); });
    };

    const cleanup = () => {
        if (realtimeChannel) supabase.removeChannel(realtimeChannel);
        if (banCheckInterval) clearInterval(banCheckInterval);
        if (postTimerInterval) clearInterval(postTimerInterval);
    };

    const renderApp = () => {
        subscribeToRealtime();
        startBanCheckInterval();
        canPost = true;
        app.innerHTML = `<div class="app-container"><div class="header"><div class="header-title"><div class="logo-icon"><i class="fa-solid fa-feather"></i></div>NobuChirp</div><div class="header-actions"><button class="icon-btn" id="profileBtn"><i class="fa-solid fa-user"></i></button><button class="icon-btn" id="logoutBtn"><i class="fa-solid fa-right-from-bracket"></i></button><button class="icon-btn" id="adminBtn"><i class="fa-solid fa-shield-halved"></i></button></div></div><div class="tabs"><button class="tab active" data-tab="feed">📰 Лента</button><button class="tab" data-tab="following">👥 Подписки</button><button class="tab" data-tab="trends">🔥 Тренды</button></div><div class="composer"><textarea id="chirpInput" class="composer-input" placeholder="Что происходит?" maxlength="280" rows="2"></textarea><div class="pending-image hidden" id="pendingImageContainer"><img id="pendingImagePreview"><button id="removePendingImage">&times;</button></div><div class="composer-footer"><span class="composer-counter" id="chirpCounter">0/280</span><div class="composer-actions"><button class="icon-btn" id="attachImageBtn"><i class="fa-solid fa-image"></i></button><input type="file" id="imageInput" accept="image/*" hidden><button class="post-btn" id="postBtn" disabled><i class="fa-solid fa-feather"></i> <span id="postBtnText">Чирикнуть</span></button></div></div></div><div class="feed" id="feedContainer"></div></div>`;
        setupTabs(); setupComposer(); loadFeed();
        document.getElementById('profileBtn').addEventListener('click', () => showProfile(currentUser.id));
        document.getElementById('logoutBtn').addEventListener('click', () => { cleanup(); localStorage.removeItem('nobu_user'); location.reload(); });
        document.getElementById('adminBtn').addEventListener('click', showAdminLogin);
    };

    const setupTabs = () => { document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); t.classList.add('active'); activeTab = t.dataset.tab; loadFeed(); })); };

    const startPostCooldown = () => {
        canPost = false;
        const btn = document.getElementById('postBtn');
        const btnText = document.getElementById('postBtnText');
        let remaining = postCooldown;
        btn.disabled = true;
        btnText.textContent = `${remaining}с`;
        if (postTimerInterval) clearInterval(postTimerInterval);
        postTimerInterval = setInterval(() => {
            remaining--;
            btnText.textContent = `${remaining}с`;
            if (remaining <= 0) {
                clearInterval(postTimerInterval);
                postTimerInterval = null;
                canPost = true;
                btn.disabled = false;
                btnText.textContent = 'Чирикнуть';
                updatePostBtn();
            }
        }, 1000);
    };

    const updatePostBtn = () => {
        const input = document.getElementById('chirpInput');
        const postBtn = document.getElementById('postBtn');
        if (!canPost) { postBtn.disabled = true; return; }
        postBtn.disabled = (input.value.length === 0 && !pendingImage);
    };

    const setupComposer = () => {
        const input = document.getElementById('chirpInput'), counter = document.getElementById('chirpCounter'), postBtn = document.getElementById('postBtn');
        input.addEventListener('input', () => { counter.textContent = `${input.value.length}/280`; updatePostBtn(); });
        document.getElementById('attachImageBtn').addEventListener('click', () => document.getElementById('imageInput').click());
        document.getElementById('imageInput').addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; pendingImage = file; const reader = new FileReader(); reader.onload = ev => { document.getElementById('pendingImagePreview').src = ev.target.result; document.getElementById('pendingImageContainer').classList.remove('hidden'); updatePostBtn(); }; reader.readAsDataURL(file); });
        document.getElementById('removePendingImage').addEventListener('click', () => { pendingImage = null; document.getElementById('pendingImageContainer').classList.add('hidden'); updatePostBtn(); });
        postBtn.addEventListener('click', async () => {
            if (!canPost || postBtn.disabled) return;
            const content = input.value.trim();
            if (!content && !pendingImage) return;
            postBtn.disabled = true;
            let imageUrl = null;
            if (pendingImage) { const path = `chirps/${currentUser.id}_${Date.now()}.${pendingImage.name.split('.').pop()}`; await supabase.storage.from('images').upload(path, pendingImage); const { data } = supabase.storage.from('images').getPublicUrl(path); imageUrl = data.publicUrl; }
            const hashtags = content.match(/#\w+/g) || [];
            let isFire = false; const today = new Date().toISOString().split('T')[0]; const lastDate = currentUser.last_post_date; let newStreak = currentUser.streak_count || 0;
            if (lastDate === today) {} else if (lastDate === new Date(Date.now() - 86400000).toISOString().split('T')[0]) { newStreak++; } else { newStreak = 1; }
            if (newStreak >= 2) isFire = true;
            const { data: freshUser } = await supabase.from('users').select('is_verified, avatar_emoji').eq('id', currentUser.id).single();
            await supabase.from('chirps').insert({ user_id: currentUser.id, username: currentUser.username, avatar_emoji: freshUser?.avatar_emoji || currentUser.avatar_emoji || '👤', is_verified: freshUser?.is_verified || false, content, image_url: imageUrl, hashtags, is_fire: isFire });
            await supabase.from('users').update({ streak_count: newStreak, last_post_date: today }).eq('id', currentUser.id);
            currentUser.streak_count = newStreak; currentUser.last_post_date = today;
            if (freshUser) { currentUser.is_verified = freshUser.is_verified; currentUser.avatar_emoji = freshUser.avatar_emoji; }
            hashtags.forEach(async (tag) => { const { data: exist } = await supabase.from('trends').select('*').eq('hashtag', tag).single(); if (exist) { await supabase.from('trends').update({ count: exist.count + 1 }).eq('id', exist.id); } else { await supabase.from('trends').insert({ hashtag: tag }); } });
            input.value = ''; pendingImage = null; document.getElementById('pendingImageContainer').classList.add('hidden'); counter.textContent = '0/280';
            startPostCooldown();
            loadFeed();
        });
    };

    const loadFeed = async () => {
        const container = document.getElementById('feedContainer'); if (!container) return;
        let query = supabase.from('chirps').select('*').order('created_at', { ascending: false });
        if (activeTab === 'following') { const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', currentUser.id); const ids = follows?.map(f => f.following_id) || []; if (ids.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">Подпишитесь на кого-нибудь</div>'; return; } query = query.in('user_id', ids); }
        if (activeTab === 'trends') { const { data: trends } = await supabase.from('trends').select('*').order('count', { ascending: false }).limit(20); container.innerHTML = trends?.map(t => `<div class="trend-item" data-tag="${t.hashtag}"><span style="font-weight:700">${t.hashtag}</span><br><span style="color:var(--text-secondary);font-size:0.85rem">${t.count} чириков</span></div>`).join('') || '<div style="text-align:center;padding:40px;color:var(--text-secondary)">Нет трендов</div>'; document.querySelectorAll('.trend-item').forEach(el => el.addEventListener('click', () => { activeTab = 'trends'; loadTrendFeed(el.dataset.tag); })); return; }
        const { data: chirps } = await query;
        container.innerHTML = chirps?.map(c => renderChirp(c)).join('') || '<div style="text-align:center;padding:40px;color:var(--text-secondary)">Нет чириков</div>';
        setupChirpActions();
    };

    const loadTrendFeed = async (tag) => { const { data } = await supabase.from('chirps').select('*').contains('hashtags', [tag]).order('created_at', { ascending: false }); document.getElementById('feedContainer').innerHTML = data?.map(c => renderChirp(c)).join('') || '<div style="text-align:center;padding:40px;color:var(--text-secondary)">Нет чириков</div>'; setupChirpActions(); };

    const renderChirp = (c) => `<div class="chirp-card" data-chirp-id="${c.id}" data-user-id="${c.user_id}"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div class="chirp-header" style="flex:1"><div class="chirp-avatar">${c.avatar_emoji||'👤'}${c.is_verified?'<span class="verified-badge"><i class="fa-solid fa-check"></i></span>':''}</div><div><div class="chirp-author">${esc(c.username)} ${c.is_fire?'<span class="chirp-fire"><i class="fa-solid fa-fire"></i></span>':''}</div><div class="chirp-username">@${esc(c.username)} · ${formatTime(c.created_at)}</div></div></div><span style="color:#333;font-size:0.6rem;cursor:pointer" title="ID: ${c.id}" onclick="navigator.clipboard.writeText('${c.id}')">${c.id.slice(0,8)}</span></div><div class="chirp-content">${c.content.replace(/#\w+/g, '<span class="hashtag">$&</span>')}</div>${c.image_url?`<div class="chirp-image"><img src="${c.image_url}" onclick="window.open('${c.image_url}')"></div>`:''}<div class="chirp-actions"><button class="chirp-action like-btn" data-chirp-id="${c.id}"><i class="fa-heart fa-regular"></i> <span>${c.likes||0}</span></button><button class="chirp-action dislike-btn" data-chirp-id="${c.id}"><i class="fa-thumbs-down fa-regular"></i> <span>${c.dislikes||0}</span></button><button class="chirp-action rechirp-btn" data-chirp-id="${c.id}"><i class="fa-solid fa-retweet"></i> <span>${c.rechirps||0}</span></button><button class="chirp-action comment-btn" data-chirp-id="${c.id}"><i class="fa-regular fa-comment"></i></button></div></div>`;

    const setupChirpActions = () => {
        document.querySelectorAll('.chirp-card').forEach(card => { card.querySelector('.chirp-header')?.addEventListener('click', () => showProfile(card.dataset.userId)); });
        document.querySelectorAll('.like-btn').forEach(b => b.addEventListener('click', async (e) => { e.stopPropagation(); const id = b.dataset.chirpId; const { data: exist } = await supabase.from('likes').select('*').eq('user_id', currentUser.id).eq('chirp_id', id).single(); if (exist) { await supabase.from('likes').delete().eq('id', exist.id); } else { await supabase.from('likes').insert({ user_id: currentUser.id, chirp_id: id }); } const { count } = await supabase.from('likes').select('*', { count: 'exact' }).eq('chirp_id', id); b.querySelector('span').textContent = count || 0; b.classList.toggle('liked', !exist); b.querySelector('i').className = exist ? 'fa-regular fa-heart' : 'fa-solid fa-heart'; }));
        document.querySelectorAll('.dislike-btn').forEach(b => b.addEventListener('click', async (e) => { e.stopPropagation(); const id = b.dataset.chirpId; const { data: exist } = await supabase.from('dislikes').select('*').eq('user_id', currentUser.id).eq('chirp_id', id).single(); if (exist) { await supabase.from('dislikes').delete().eq('id', exist.id); } else { await supabase.from('dislikes').insert({ user_id: currentUser.id, chirp_id: id }); } const { count } = await supabase.from('dislikes').select('*', { count: 'exact' }).eq('chirp_id', id); b.querySelector('span').textContent = count || 0; b.classList.toggle('disliked', !exist); b.querySelector('i').className = exist ? 'fa-regular fa-thumbs-down' : 'fa-solid fa-thumbs-down'; }));
        document.querySelectorAll('.rechirp-btn').forEach(b => b.addEventListener('click', async (e) => { e.stopPropagation(); const id = b.dataset.chirpId; const { data: exist } = await supabase.from('rechirps').select('*').eq('user_id', currentUser.id).eq('chirp_id', id).single(); if (!exist) { await supabase.from('rechirps').insert({ user_id: currentUser.id, chirp_id: id }); const { count } = await supabase.from('rechirps').select('*', { count: 'exact' }).eq('chirp_id', id); b.querySelector('span').textContent = count || 0; } }));
        document.querySelectorAll('.comment-btn').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); showComments(b.dataset.chirpId); }));
    };

    const showComments = async (chirpId) => {
        const { data } = await supabase.from('comments').select('*').eq('chirp_id', chirpId).order('created_at', { ascending: true });
        const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
        overlay.innerHTML = `<div class="modal-card"><h3>💬 Комментарии</h3><div style="max-height:50vh;overflow-y:auto;margin-bottom:12px" id="commentsList">${data?.map(c => `<div style="padding:8px 0;border-bottom:1px solid var(--border)"><strong>${esc(c.username)}</strong>: ${esc(c.content)}</div>`).join('') || '<p style="color:var(--text-secondary)">Нет комментариев</p>'}</div><input type="text" id="commentInput" class="modal-input" placeholder="Ваш комментарий..."><button class="modal-btn" id="sendCommentBtn">Отправить</button><button class="modal-btn secondary" id="closeCommentsBtn">Закрыть</button></div>`;
        document.body.appendChild(overlay);
        const cc = supabase.channel(`comments-${chirpId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `chirp_id=eq.${chirpId}` }, () => { loadCommentsInModal(chirpId); }).subscribe();
        document.getElementById('closeCommentsBtn').addEventListener('click', () => { supabase.removeChannel(cc); overlay.remove(); });
        document.getElementById('sendCommentBtn').addEventListener('click', async () => { const content = document.getElementById('commentInput').value.trim(); if (!content) return; await supabase.from('comments').insert({ chirp_id: chirpId, user_id: currentUser.id, username: currentUser.username, content }); document.getElementById('commentInput').value = ''; });
    };

    const loadCommentsInModal = async (chirpId) => { const { data } = await supabase.from('comments').select('*').eq('chirp_id', chirpId).order('created_at', { ascending: true }); const list = document.getElementById('commentsList'); if (list) list.innerHTML = data?.map(c => `<div style="padding:8px 0;border-bottom:1px solid var(--border)"><strong>${esc(c.username)}</strong>: ${esc(c.content)}</div>`).join('') || '<p style="color:var(--text-secondary)">Нет комментариев</p>'; };

    const showProfile = async (userId) => {
        const { data: user } = await supabase.from('users').select('*').eq('id', userId).single(); if (!user) return;
        const { count: chirps } = await supabase.from('chirps').select('*', { count: 'exact' }).eq('user_id', userId);
        const { count: followers } = await supabase.from('follows').select('*', { count: 'exact' }).eq('following_id', userId);
        const { count: following } = await supabase.from('follows').select('*', { count: 'exact' }).eq('follower_id', userId);
        const isOwn = userId === currentUser.id;
        const { data: followData } = await supabase.from('follows').select('*').eq('follower_id', currentUser.id).eq('following_id', userId).single();
        const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
        overlay.innerHTML = `<div class="modal-card"><div style="text-align:center"><div class="profile-emoji">${user.avatar_emoji||'👤'}${user.is_verified?'<span class="verified-badge"><i class="fa-solid fa-check"></i></span>':''}</div><div class="profile-name">${esc(user.username)}</div><div class="profile-username">@${esc(user.username)}</div><div class="profile-bio">${esc(user.bio||'')}</div><div class="profile-stats"><div class="stat"><div class="stat-value">${chirps||0}</div><div class="stat-label">чириков</div></div><div class="stat"><div class="stat-value">${followers||0}</div><div class="stat-label">подписчиков</div></div><div class="stat"><div class="stat-value">${following||0}</div><div class="stat-label">подписок</div></div></div><div class="profile-actions">${isOwn?'<button class="modal-btn" id="editProfileBtn">Редактировать</button>':`<button class="modal-btn" id="followBtn">${followData?'Отписаться':'Подписаться'}</button>`}</div></div><button class="modal-btn secondary" id="closeProfileBtn" style="margin-top:10px">Закрыть</button></div>`;
        document.body.appendChild(overlay);
        document.getElementById('closeProfileBtn').addEventListener('click', () => overlay.remove());
        if (isOwn) document.getElementById('editProfileBtn').addEventListener('click', () => { overlay.remove(); showEditProfile(); });
        else document.getElementById('followBtn').addEventListener('click', async () => { if (followData) { await supabase.from('follows').delete().eq('id', followData.id); } else { await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: userId }); } overlay.remove(); showProfile(userId); });
    };

    const showEditProfile = () => {
        const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
        overlay.innerHTML = `<div class="modal-card"><h3>Редактировать профиль</h3><input type="text" id="editBio" class="modal-input" placeholder="О себе" value="${esc(currentUser.bio||'')}"><p style="color:var(--text-secondary);text-align:center;margin:10px 0">Эмодзи:</p><div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">${['👤','😀','😎','🤖','👽','🦊','🐼','🎃','💎','🔥'].map(e => `<span style="font-size:2rem;cursor:pointer" class="emoji-opt">${e}</span>`).join('')}</div><button class="modal-btn" id="saveProfileBtn">Сохранить</button><button class="modal-btn secondary" id="closeEditBtn">Отмена</button></div>`;
        document.body.appendChild(overlay);
        document.getElementById('closeEditBtn').addEventListener('click', () => overlay.remove());
        document.getElementById('saveProfileBtn').addEventListener('click', async () => { const bio = document.getElementById('editBio').value.trim(); await supabase.from('users').update({ bio }).eq('id', currentUser.id); currentUser.bio = bio; localStorage.setItem('nobu_user', JSON.stringify(currentUser)); overlay.remove(); });
        overlay.querySelectorAll('.emoji-opt').forEach(el => el.addEventListener('click', async () => { await supabase.from('users').update({ avatar_emoji: el.textContent }).eq('id', currentUser.id); currentUser.avatar_emoji = el.textContent; localStorage.setItem('nobu_user', JSON.stringify(currentUser)); overlay.remove(); }));
    };

    const showAdminLogin = () => { const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.innerHTML = `<div class="modal-card"><h3>🛡️ Доступ</h3><input type="password" id="adminPassword" class="modal-input" placeholder="Пароль"><button class="modal-btn" id="adminLoginBtn">Войти</button><button class="modal-btn secondary" id="closeAdminLoginBtn">Отмена</button></div>`; document.body.appendChild(overlay); document.getElementById('closeAdminLoginBtn').addEventListener('click', () => overlay.remove()); document.getElementById('adminLoginBtn').addEventListener('click', () => { if (document.getElementById('adminPassword').value === ADMIN_PASSWORD) { overlay.remove(); showAdminPanel(); } else alert('Неверный пароль'); }); };

    const showAdminPanel = () => {
        const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
        overlay.innerHTML = `<div class="modal-card" style="max-height:85vh;overflow-y:auto"><h3>🛡️ Админ</h3><h4>🔨 Бан</h4><input type="text" id="banUsername" class="modal-input" placeholder="Никнейм"><select id="banDuration" class="modal-input"><option value="10">10 мин</option><option value="60">1 час</option><option value="360">6 ч</option><option value="1440">24 ч</option><option value="0">Навсегда</option></select><input type="text" id="banReason" class="modal-input" placeholder="Причина"><button class="modal-btn" id="banUserBtn" style="background:var(--danger)">Заблокировать</button><h4>⚠️ Предупреждение</h4><input type="text" id="warnUsername" class="modal-input" placeholder="Никнейм"><input type="text" id="warnReason" class="modal-input" placeholder="Причина"><button class="modal-btn" id="warnUserBtn" style="background:var(--warning)">Предупредить</button><h4>✅ Верификация</h4><input type="text" id="verifyUsername" class="modal-input" placeholder="Никнейм"><button class="modal-btn" id="verifyUserBtn">Выдать ✅</button><h4>🗑️ Удаление поста</h4><input type="text" id="deleteChirpId" class="modal-input" placeholder="ID чирика (нажми на серый ID в углу поста)"><button class="modal-btn" id="deleteChirpBtn" style="background:var(--danger)">Удалить</button><h4>👤 Профиль</h4><input type="text" id="lookupUsername" class="modal-input" placeholder="Никнейм"><button class="modal-btn" id="lookupUserBtn">Посмотреть</button><h4>🔓 Разбан</h4><input type="text" id="unbanUsername" class="modal-input" placeholder="Никнейм"><button class="modal-btn" id="unbanUserBtn" style="background:var(--success)">Разблокировать</button><button class="modal-btn secondary" id="closeAdminBtn" style="margin-top:12px">Закрыть</button></div>`;
        document.body.appendChild(overlay); document.getElementById('closeAdminBtn').addEventListener('click', () => overlay.remove());
        document.getElementById('banUserBtn').addEventListener('click', async () => { const u = document.getElementById('banUsername').value.trim(), m = parseInt(document.getElementById('banDuration').value), r = document.getElementById('banReason').value.trim()||'нарушение'; if(!u)return; const{data:user}=await supabase.from('users').select('id').eq('username',u).single(); if(!user){alert('Не найден');return;} const expires = m === 0 ? null : new Date(Date.now() + m*60000).toISOString(); await supabase.from('users').update({ is_banned: true, ban_reason: r, ban_expires: expires }).eq('id', user.id); alert(`${u} заблокирован`); });
        document.getElementById('warnUserBtn').addEventListener('click', async () => { const u = document.getElementById('warnUsername').value.trim(), r = document.getElementById('warnReason').value.trim()||'нарушение'; if(!u)return; const{data:user}=await supabase.from('users').select('id').eq('username',u).single(); if(!user){alert('Не найден');return;} await supabase.from('warnings').insert({ user_id: user.id, username: u, reason: r }); alert(`${u} получил предупреждение`); });
        document.getElementById('verifyUserBtn').addEventListener('click', async () => { const u = document.getElementById('verifyUsername').value.trim(); if(!u)return; const{error}=await supabase.from('users').update({ is_verified: true }).eq('username',u); if(error){alert('Ошибка: '+error.message);return;} alert(`${u} верифицирован ✅`); });
        document.getElementById('deleteChirpBtn').addEventListener('click', async () => { const id = document.getElementById('deleteChirpId').value.trim(); if(!id)return; const{error}=await supabase.from('chirps').delete().eq('id', id); if(error){alert('Ошибка: '+error.message);return;} alert('Пост удалён'); });
        document.getElementById('lookupUserBtn').addEventListener('click', async () => { const u = document.getElementById('lookupUsername').value.trim(); if(!u)return; const{data:user}=await supabase.from('users').select('*').eq('username',u).single(); if(!user){alert('Не найден');return;} alert(`Профиль ${user.username}:\nID: ${user.id}\nВерифицирован: ${user.is_verified?'Да':'Нет'}\nБан: ${user.is_banned?'Да (до '+new Date(user.ban_expires).toLocaleString()+')':'Нет'}`); });
        document.getElementById('unbanUserBtn').addEventListener('click', async () => { const u = document.getElementById('unbanUsername').value.trim(); if(!u)return; await supabase.from('users').update({ is_banned: false, ban_reason: null, ban_expires: null }).eq('username', u); alert(`${u} разблокирован`); });
    };

    const init = async () => {
        const saved = localStorage.getItem('nobu_user');
        if (saved) { currentUser = JSON.parse(saved); const { data: user } = await supabase.from('users').select('*').eq('id', currentUser.id).single(); if (user) { currentUser = user; if (await checkWarningsAndBan(user)) return; renderApp(); } else { renderAuth(); } }
        else { renderAuth(); }
        window.addEventListener('beforeunload', () => { cleanup(); });
    };
    return { init };
})();
document.addEventListener('DOMContentLoaded', () => NobuChirp.init());