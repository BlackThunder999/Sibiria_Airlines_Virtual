// NobuTok — Современная социальная сеть коротких видео
const NobuTok = (() => {
    // Конфигурация Supabase
    const SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // ========== ГЛОБАЛЬНОЕ СОСТОЯНИЕ ==========
    let currentUser = null;
    let currentProfile = null;
    let activeTab = 'home';
    let videos = [];
    let currentVideoIndex = 0;
    let commentsSubscription = null;

    // ========== DOM-ЭЛЕМЕНТЫ (кэшируются после рендеринга) ==========
    const app = document.getElementById('app');

    // ========== УТИЛИТЫ ==========
    const html = (strings, ...values) => {
        let result = '';
        strings.forEach((str, i) => {
            result += str;
            if (i < values.length) {
                result += String(values[i])
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }
        });
        return result;
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        if (diff < 60) return 'только что';
        if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const showError = (message) => {
        // Можно заменить на кастомный тост
        alert(message);
    };

    // ========== АУТЕНТИФИКАЦИЯ ==========
    const renderAuth = () => {
        app.innerHTML = `
            <div class="auth-container">
                <div class="auth-card">
                    <div class="auth-logo">
                        <div class="logo-icon"><i class="fa-solid fa-feather"></i></div>
                        <h1>Nobu<span>Tok</span></h1>
                    </div>
                    <form id="authForm" class="auth-form">
                        <input type="text" id="authUsername" class="auth-input" placeholder="Никнейм" required>
                        <input type="password" id="authPassword" class="auth-input" placeholder="Пароль" required>
                        <button type="submit" class="auth-btn" id="authSubmitBtn">Войти</button>
                        <div class="auth-error" id="authError"></div>
                    </form>
                    <div class="auth-switch">
                        <span id="authSwitchText">Нет аккаунта? <span id="authSwitchLink">Зарегистрироваться</span></span>
                    </div>
                </div>
            </div>
        `;

        const authForm = document.getElementById('authForm');
        const authUsername = document.getElementById('authUsername');
        const authPassword = document.getElementById('authPassword');
        const authSubmitBtn = document.getElementById('authSubmitBtn');
        const authError = document.getElementById('authError');
        const authSwitchLink = document.getElementById('authSwitchLink');
        const authSwitchText = document.getElementById('authSwitchText');
        let isRegisterMode = false;

        const toggleMode = () => {
            isRegisterMode = !isRegisterMode;
            authSubmitBtn.textContent = isRegisterMode ? 'Зарегистрироваться' : 'Войти';
            authSwitchText.innerHTML = isRegisterMode 
                ? 'Уже есть аккаунт? <span id="authSwitchLink">Войти</span>' 
                : 'Нет аккаунта? <span id="authSwitchLink">Зарегистрироваться</span>';
            document.getElementById('authSwitchLink').addEventListener('click', toggleMode);
            authError.textContent = '';
        };

        authSwitchLink.addEventListener('click', toggleMode);

        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = authUsername.value.trim();
            const password = authPassword.value.trim();
            if (!username || !password) {
                authError.textContent = 'Заполните все поля';
                return;
            }

            try {
                if (isRegisterMode) {
                    // Регистрация: создаём email из никнейма
                    const email = `${username.toLowerCase()}@nobutok.app`;
                    const { data, error } = await supabase.auth.signUp({ email, password });
                    if (error) throw error;
                    if (data.user) {
                        // Создаём профиль
                        await supabase.from('profiles').insert({ id: data.user.id, username: username, display_name: username });
                        // Сразу входим
                        await supabase.auth.signInWithPassword({ email, password });
                    }
                } else {
                    // Вход: ищем профиль по username
                    const { data: profileData } = await supabase.from('profiles').select('id').eq('username', username).single();
                    if (!profileData) {
                        authError.textContent = 'Пользователь не найден';
                        return;
                    }
                    const { data: userData } = await supabase.auth.admin.getUserById(profileData.id);
                    const email = `${username.toLowerCase()}@nobutok.app`;
                    const { error } = await supabase.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                }
                // Успешный вход
                const { data: { user } } = await supabase.auth.getUser();
                currentUser = user;
                await loadProfile();
                renderApp();
            } catch (error) {
                authError.textContent = error.message || 'Ошибка авторизации';
            }
        });
    };

    const loadProfile = async () => {
        if (!currentUser) return;
        const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        currentProfile = data;
    };

    const logout = async () => {
        await supabase.auth.signOut();
        currentUser = null;
        currentProfile = null;
        renderAuth();
    };

    // ========== ОСНОВНОЙ ИНТЕРФЕЙС ==========
    const renderApp = () => {
        app.innerHTML = `
            <div class="app-container">
                <div class="tab-content active" id="tab-home"></div>
                <div class="tab-content" id="tab-search"></div>
                <div class="tab-content" id="tab-profile"></div>
                <div class="tab-content" id="tab-following"></div>
                <nav class="bottom-nav">
                    <button class="nav-item active" data-tab="home"><i class="fa-solid fa-house"></i><span>Главная</span></button>
                    <button class="nav-item" data-tab="search"><i class="fa-solid fa-magnifying-glass"></i><span>Поиск</span></button>
                    <button class="nav-item" data-tab="profile"><i class="fa-solid fa-user"></i><span>Профиль</span></button>
                    <button class="nav-item" data-tab="following"><i class="fa-solid fa-users"></i><span>Подписки</span></button>
                </nav>
            </div>
        `;

        setupNavigation();
        loadHomeFeed();
        setupRealtime();
    };

    const setupNavigation = () => {
        const tabs = document.querySelectorAll('.tab-content');
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const tabName = item.dataset.tab;
                tabs.forEach(t => t.classList.remove('active'));
                document.getElementById(`tab-${tabName}`).classList.add('active');
                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');
                activeTab = tabName;

                if (tabName === 'home') loadHomeFeed();
                else if (tabName === 'search') renderSearch();
                else if (tabName === 'profile') renderProfile(currentUser.id);
                else if (tabName === 'following') renderFollowingFeed();
            });
        });
    };

    // ========== ЛЕНТА (ГЛАВНАЯ) ==========
    const loadHomeFeed = async () => {
        const tab = document.getElementById('tab-home');
        tab.innerHTML = '<div class="video-feed" id="videoFeed"></div>';
        const { data, error } = await supabase.from('videos').select('*').order('created_at', { ascending: false });
        if (error) { showError('Ошибка загрузки видео'); return; }
        videos = data || [];
        currentVideoIndex = 0;
        renderVideoFeed();
    };

    const renderVideoFeed = () => {
        const feed = document.getElementById('videoFeed');
        if (!feed || videos.length === 0) {
            feed.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Нет видео</div>';
            return;
        }
        feed.innerHTML = videos.map((video, index) => `
            <div class="video-item" data-index="${index}">
                <video src="${video.video_url}" loop muted playsinline></video>
                <div class="video-actions">
                    <button class="action-btn like-btn ${video.liked ? 'liked' : ''}" data-video-id="${video.id}">
                        <i class="fa-heart ${video.liked ? 'fa-solid' : 'fa-regular'}"></i>
                        <span>${video.likes_count || 0}</span>
                    </button>
                    <button class="action-btn comment-btn" data-video-id="${video.id}">
                        <i class="fa-regular fa-comment"></i>
                        <span>${video.comments_count || 0}</span>
                    </button>
                </div>
                <div class="video-overlay">
                    <div class="video-user" data-user-id="${video.user_id}">
                        <div class="video-avatar" style="background-image:url(${video.avatar_url || ''})"></div>
                        <div>
                            <div class="video-username">${video.display_name || video.username} ${video.username === 'NobuTok' ? '<span class="verified-badge"><i class="fa-solid fa-check"></i></span>' : ''}</div>
                            <div class="video-caption">${video.caption || ''}</div>
                            ${video.location ? `<div style="font-size:0.8rem;color:var(--text-muted)"><i class="fa-solid fa-location-dot"></i> ${video.location}</div>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        // Обработчики лайков
        document.querySelectorAll('.like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const videoId = btn.dataset.videoId;
                toggleLike(videoId, btn);
            });
        });

        // Обработчики комментариев
        document.querySelectorAll('.comment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const videoId = btn.dataset.videoId;
                openCommentsPanel(videoId);
            });
        });

        // Клик по пользователю
        document.querySelectorAll('.video-user').forEach(el => {
            el.addEventListener('click', () => {
                const userId = el.dataset.userId;
                renderProfile(userId);
            });
        });

        // Автовоспроизведение
        playCurrentVideo();
        feed.addEventListener('scroll', handleScroll);
    };

    const playCurrentVideo = () => {
        const items = document.querySelectorAll('.video-item');
        items.forEach((item, index) => {
            const video = item.querySelector('video');
            if (index === currentVideoIndex) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });
    };

    const handleScroll = () => {
        const feed = document.getElementById('videoFeed');
        const items = document.querySelectorAll('.video-item');
        let closestIndex = 0;
        let minDistance = Infinity;
        const feedRect = feed.getBoundingClientRect();
        items.forEach((item, index) => {
            const rect = item.getBoundingClientRect();
            const distance = Math.abs(rect.top + rect.height/2 - feedRect.top - feedRect.height/2);
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });
        if (closestIndex !== currentVideoIndex) {
            currentVideoIndex = closestIndex;
            playCurrentVideo();
        }
    };

    // ========== ЛАЙКИ ==========
    const toggleLike = async (videoId, btn) => {
        if (!currentUser) return;
        const { data: existingLike } = await supabase.from('likes')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('video_id', videoId)
            .single();

        if (existingLike) {
            await supabase.from('likes').delete().eq('id', existingLike.id);
            btn.classList.remove('liked');
            btn.querySelector('i').className = 'fa-regular fa-heart';
        } else {
            await supabase.from('likes').insert({ user_id: currentUser.id, video_id: videoId });
            btn.classList.add('liked');
            btn.querySelector('i').className = 'fa-solid fa-heart';
        }
        // Обновить счётчик
        const { count } = await supabase.from('likes').select('*', { count: 'exact' }).eq('video_id', videoId);
        btn.querySelector('span').textContent = count || 0;
        // Обновить в базе
        await supabase.from('videos').update({ likes_count: count }).eq('id', videoId);
    };

    // ========== КОММЕНТАРИИ ==========
    const openCommentsPanel = (videoId) => {
        const existingPanel = document.getElementById('commentsPanel');
        if (existingPanel) existingPanel.remove();

        const panel = document.createElement('div');
        panel.id = 'commentsPanel';
        panel.className = 'comments-panel open';
        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <h3>Комментарии</h3>
                <button id="closeCommentsBtn" style="background:none;border:none;color:var(--text);font-size:1.2rem;cursor:pointer"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="comments-list" id="commentsList"></div>
            <div class="comment-input-area">
                <input type="text" id="commentInput" placeholder="Написать комментарий...">
                <input type="file" id="commentImageInput" accept="image/*" style="display:none">
                <button id="attachImageBtn" style="background:none;border:none;color:var(--text-secondary);font-size:1.2rem;cursor:pointer"><i class="fa-solid fa-image"></i></button>
                <button class="comment-send-btn" id="sendCommentBtn"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('closeCommentsBtn').addEventListener('click', () => panel.remove());
        document.getElementById('attachImageBtn').addEventListener('click', () => document.getElementById('commentImageInput').click());

        loadComments(videoId);
        setupCommentRealtime(videoId);

        document.getElementById('sendCommentBtn').addEventListener('click', async () => {
            const content = document.getElementById('commentInput').value.trim();
            const imageFile = document.getElementById('commentImageInput').files[0];
            if (!content && !imageFile) return;

            let imageUrl = null;
            if (imageFile) {
                const path = `comments/${currentUser.id}_${Date.now()}`;
                await supabase.storage.from('comments').upload(path, imageFile);
                const { data } = supabase.storage.from('comments').getPublicUrl(path);
                imageUrl = data.publicUrl;
            }

            await supabase.from('comments').insert({
                user_id: currentUser.id,
                video_id: videoId,
                content: content || '',
                image_url: imageUrl
            });
            document.getElementById('commentInput').value = '';
            document.getElementById('commentImageInput').value = '';
        });
    };

    const loadComments = async (videoId) => {
        const { data } = await supabase.from('comments')
            .select('*, profiles:user_id (username, avatar_url, display_name)')
            .eq('video_id', videoId)
            .order('created_at', { ascending: true });

        const list = document.getElementById('commentsList');
        if (!data || data.length === 0) {
            list.innerHTML = '<div style="color:var(--text-muted);text-align:center">Нет комментариев</div>';
            return;
        }
        list.innerHTML = data.map(comment => {
            const profile = comment.profiles || {};
            return html`
                <div class="comment-item">
                    <div class="comment-avatar" style="background-image:url(${profile.avatar_url || ''})"></div>
                    <div class="comment-body">
                        <div class="comment-username">${profile.display_name || profile.username} ${profile.username === 'NobuTok' ? '<span class="verified-badge"><i class="fa-solid fa-check"></i></span>' : ''}</div>
                        <div class="comment-text">${comment.content}</div>
                        ${comment.image_url ? `<img src="${comment.image_url}" class="comment-image">` : ''}
                    </div>
                </div>
            `;
        }).join('');
    };

    const setupCommentRealtime = (videoId) => {
        if (commentsSubscription) supabase.removeChannel(commentsSubscription);
        commentsSubscription = supabase
            .channel(`comments-${videoId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `video_id=eq.${videoId}` }, payload => {
                loadComments(videoId);
            })
            .subscribe();
    };

    // ========== ПРОФИЛЬ ==========
    const renderProfile = async (userId) => {
        const tab = document.getElementById('tab-profile');
        tab.innerHTML = '<div style="text-align:center;padding:40px">Загрузка...</div>';
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector('[data-tab="profile"]').classList.add('active');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (!profile) {
            tab.innerHTML = '<div style="text-align:center;padding:40px">Пользователь не найден</div>';
            return;
        }

        const isOwn = currentUser && currentUser.id === userId;
        const { count: videosCount } = await supabase.from('videos').select('*', { count: 'exact' }).eq('user_id', userId);
        const { count: followersCount } = await supabase.from('followers').select('*', { count: 'exact' }).eq('following_id', userId);
        const { count: followingCount } = await supabase.from('followers').select('*', { count: 'exact' }).eq('follower_id', userId);
        const { data: likesData } = await supabase.from('videos').select('likes_count').eq('user_id', userId);
        const totalLikes = likesData?.reduce((sum, v) => sum + (v.likes_count || 0), 0) || 0;

        tab.innerHTML = html`
            <div class="profile-header">
                <div class="profile-avatar-large" style="background-image:url(${profile.avatar_url || ''})"></div>
                <div class="profile-name">${profile.display_name || profile.username} ${profile.username === 'NobuTok' ? '<span class="verified-badge"><i class="fa-solid fa-check"></i></span>' : ''}</div>
                <div class="profile-username">@${profile.username}</div>
                <div class="profile-bio">${profile.bio || ''}</div>
                <div class="profile-stats">
                    <div class="stat-item"><div class="stat-value">${videosCount || 0}</div><div class="stat-label">видео</div></div>
                    <div class="stat-item"><div class="stat-value">${followersCount || 0}</div><div class="stat-label">подписчиков</div></div>
                    <div class="stat-item"><div class="stat-value">${followingCount || 0}</div><div class="stat-label">подписок</div></div>
                    <div class="stat-item"><div class="stat-value">${totalLikes}</div><div class="stat-label">лайков</div></div>
                </div>
                <div class="profile-actions">
                    ${isOwn ? `
                        <button class="profile-btn" id="editProfileBtn">Редактировать</button>
                        <button class="profile-btn" id="logoutBtn">Выйти</button>
                    ` : `
                        <button class="profile-btn primary" id="followBtn">${isFollowing ? 'Отписаться' : 'Подписаться'}</button>
                    `}
                </div>
            </div>
            <div class="profile-videos-grid" id="profileVideos"></div>
        `;

        // Загрузить видео пользователя
        const { data: userVideos } = await supabase.from('videos').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        const grid = document.getElementById('profileVideos');
        grid.innerHTML = userVideos?.map(v => `
            <div class="grid-video" data-video-id="${v.id}">
                <video src="${v.video_url}" muted></video>
                <div class="likes-overlay"><i class="fa-solid fa-heart"></i> ${v.likes_count || 0}</div>
            </div>
        `).join('') || '';

        // Обработчики
        if (isOwn) {
            document.getElementById('editProfileBtn').addEventListener('click', () => openProfileEditor());
            document.getElementById('logoutBtn').addEventListener('click', logout);
        } else {
            const followBtn = document.getElementById('followBtn');
            followBtn.addEventListener('click', () => toggleFollow(userId, followBtn));
            checkIfFollowing(userId).then(isFollowing => {
                followBtn.textContent = isFollowing ? 'Отписаться' : 'Подписаться';
                followBtn.classList.toggle('primary', !isFollowing);
            });
        }
    };

    const openProfileEditor = () => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = html`
            <div class="modal-card">
                <h3>Редактировать профиль</h3>
                <input type="text" id="editDisplayName" class="auth-input" placeholder="Имя" value="${currentProfile?.display_name || ''}">
                <input type="text" id="editBio" class="auth-input" placeholder="О себе" value="${currentProfile?.bio || ''}">
                <input type="file" id="editAvatar" accept="image/*">
                <button class="profile-btn primary" id="saveProfileBtn">Сохранить</button>
                <button class="profile-btn" id="closeModalBtn">Отмена</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('closeModalBtn').addEventListener('click', () => overlay.remove());
        document.getElementById('saveProfileBtn').addEventListener('click', async () => {
            const displayName = document.getElementById('editDisplayName').value.trim();
            const bio = document.getElementById('editBio').value.trim();
            const avatarFile = document.getElementById('editAvatar').files[0];

            let avatarUrl = currentProfile.avatar_url;
            if (avatarFile) {
                const path = `avatars/${currentUser.id}_${Date.now()}`;
                await supabase.storage.from('avatars').upload(path, avatarFile);
                const { data } = supabase.storage.from('avatars').getPublicUrl(path);
                avatarUrl = data.publicUrl;
            }

            await supabase.from('profiles').update({ display_name: displayName, bio, avatar_url: avatarUrl }).eq('id', currentUser.id);
            await loadProfile();
            overlay.remove();
            renderProfile(currentUser.id);
        });
    };

    const checkIfFollowing = async (userId) => {
        if (!currentUser) return false;
        const { data } = await supabase.from('followers').select('*').eq('follower_id', currentUser.id).eq('following_id', userId).single();
        return !!data;
    };

    const toggleFollow = async (userId, btn) => {
        if (!currentUser) return;
        const isFollowing = await checkIfFollowing(userId);
        if (isFollowing) {
            await supabase.from('followers').delete().eq('follower_id', currentUser.id).eq('following_id', userId);
        } else {
            await supabase.from('followers').insert({ follower_id: currentUser.id, following_id: userId });
        }
        renderProfile(userId);
    };

    // ========== ПОИСК ==========
    const renderSearch = () => {
        const tab = document.getElementById('tab-search');
        tab.innerHTML = `
            <div class="search-container">
                <input type="text" class="search-input" id="searchInput" placeholder="Поиск пользователей...">
            </div>
            <div class="search-results" id="searchResults"></div>
        `;
        document.getElementById('searchInput').addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (query.length < 1) {
                document.getElementById('searchResults').innerHTML = '';
                return;
            }
            const { data } = await supabase.from('profiles').select('*').ilike('username', `%${query}%`).limit(20);
            const resultsDiv = document.getElementById('searchResults');
            resultsDiv.innerHTML = data?.map(user => `
                <div class="user-result" data-user-id="${user.id}">
                    <div class="user-result-avatar" style="background-image:url(${user.avatar_url || ''})"></div>
                    <div>
                        <div class="user-result-name">${user.display_name || user.username} ${user.username === 'NobuTok' ? '<span class="verified-badge"><i class="fa-solid fa-check"></i></span>' : ''}</div>
                        <div class="user-result-username">@${user.username}</div>
                    </div>
                </div>
            `).join('') || '<div style="color:var(--text-muted);text-align:center">Никого не найдено</div>';
            document.querySelectorAll('.user-result').forEach(el => {
                el.addEventListener('click', () => renderProfile(el.dataset.userId));
            });
        });
    };

    // ========== ЛЕНТА ПОДПИСОК ==========
    const renderFollowingFeed = () => {
        const tab = document.getElementById('tab-following');
        tab.innerHTML = '<div class="video-feed" id="followingFeed"></div>';
        loadFollowingVideos();
    };

    const loadFollowingVideos = async () => {
        if (!currentUser) return;
        const { data: follows } = await supabase.from('followers').select('following_id').eq('follower_id', currentUser.id);
        const ids = follows?.map(f => f.following_id) || [];
        if (ids.length === 0) {
            document.getElementById('followingFeed').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Вы ни на кого не подписаны</div>';
            return;
        }
        const { data } = await supabase.from('videos').select('*').in('user_id', ids).order('created_at', { ascending: false });
        videos = data || [];
        renderVideoFeedInTab('followingFeed');
    };

    const renderVideoFeedInTab = (feedId) => {
        const feed = document.getElementById(feedId);
        if (!feed || videos.length === 0) {
            feed.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Нет видео</div>';
            return;
        }
        feed.innerHTML = videos.map(video => `
            <div class="video-item">
                <video src="${video.video_url}" loop muted playsinline></video>
                <!-- Аналогично главной ленте -->
            </div>
        `).join('');
    };

    // ========== REALTIME ==========
    const setupRealtime = () => {
        supabase
            .channel('videos-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, payload => {
                if (activeTab === 'home') loadHomeFeed();
            })
            .subscribe();
    };

    // ========== ИНИЦИАЛИЗАЦИЯ ==========
    const init = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            currentUser = user;
            await loadProfile();
            renderApp();
        } else {
            renderAuth();
        }
    };

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => NobuTok.init());